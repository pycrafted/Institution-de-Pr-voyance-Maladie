# -*- coding: utf-8 -*-
"""
Reprend l'HISTORIQUE RÉEL des soins de LAMPS : documents, factures, liquidations.

Les commandes `importer_*` existantes reprenaient les **référentiels** et les
**personnes** (participants, prestataires, médicaments, barème). Il manquait le
mouvement : les 113 832 bons et lettres réellement émis, les 24 668 factures
des prestataires, et les 63 039 bons liquidés.

    DB_NAME=ipm_dev python manage.py importer_historique_soins --purger

La reprise est **globale** : elle refuse de s'ajouter à un historique déjà
présent, parce que ni les factures ni les liquidations n'ont de clé unique qui
permettrait d'éviter les doublons. `--purger` vide d'abord les trois tables.

Comment LAMPS relie ses tables, et nous donc :
- `documents_ipm.numfact` porte le **numéro d'enregistrement** de la facture
  (`factures.numenreg`), pas le numéro que le prestataire a écrit dessus ;
- `lignesprest.numdoc` porte le numéro du bon ;
- un bon liquidé de notre côté (`LiquidationBon`) agrège donc les lignes de
  `lignesprest` d'un même `numdoc`, et pointe vers la facture via ce numéro.

Depuis le 2026-10-28, la commande reprend aussi le **grand livre** : les
396 873 écritures de `compta`, qui alimentent le Journal Central. Elles ne
pouvaient pas entrer tant que `EcritureCompta` exigeait une facture et
refusait les montants négatifs ; la migration `traitements/0010` a levé les
deux.

Ce que la commande NE reprend PAS : les 17 documents `TIC` (ticket de
remboursement, tous de 2020) - notre modèle n'a pas ce type, et LAMPS ne s'en
est servi qu'un mois.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from adherents.models import Adherent
from documents.models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation
from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import (
    FournisseurDeSoins,
    FournisseurDivers,
    Specialite,
    TypeBeneficiaire,
    TypePrestation,
)
from participants.models import Beneficiaire, Participant
from traitements.models import (
    EcritureCompta,
    ETAT_COMPTABILISEE,
    ETAT_PAYEE,
    ETAT_RECUE,
    ETAT_TRAITEE,
    Facture,
    LiquidationBon,
    TYPE_BON_OPTIQUE,
    TYPE_BON_PHARMACIE,
    TYPE_DIVERS,
    TYPE_LETTRE_GARANTIE,
    TYPE_LG_HOSPITALISATION,
    TYPE_SOINS,
)

# typedoc LAMPS -> (notre modèle, notre code de type pour la liquidation)
DOCUMENTS = {
    'BPI': (BonPharmacie, TYPE_BON_PHARMACIE),
    'LGI': (LettreGarantie, TYPE_LETTRE_GARANTIE),
    'BCI': (BonOptique, TYPE_BON_OPTIQUE),
    'LHI': (LettreHospitalisation, TYPE_LG_HOSPITALISATION),
}

# factures.etat de LAMPS -> notre libellé d'état.
ETATS_FACTURE = {
    'R': ETAT_RECUE,
    'T': ETAT_TRAITEE,
    'C': ETAT_COMPTABILISEE,
    'P': ETAT_PAYEE,
}

LOT = 1000


class Command(BaseCommand):
    help = "Reprend les documents, factures et liquidations réels de LAMPS."

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument(
            '--purger', action='store_true',
            help="Vide d'abord liquidations, documents et factures.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self._verifier_le_terrain(options)
        self._charger_les_correspondances()

        factures = self._importer_factures(options)
        documents = self._importer_documents(options)
        liquidations = self._importer_liquidations(options)
        ecritures = self._importer_ecritures(options)

        self.stdout.write(
            self.style.SUCCESS(
                '\nRepris de LAMPS : %d factures, %d documents, %d bons liquidés, '
                '%d écritures.' % (factures, documents, liquidations, ecritures)
            )
        )

    # ------------------------------------------------------------------ garde

    def _verifier_le_terrain(self, options):
        presents = (
            Facture.objects.count()
            + LiquidationBon.objects.count()
            + EcritureCompta.objects.count()
            + sum(m.objects.count() for m, _ in DOCUMENTS.values())
        )
        if not presents:
            return
        if not options['purger']:
            raise CommandError(
                "La base porte déjà %d factures / documents / liquidations.\n"
                "La reprise est globale : relancer avec --purger pour les "
                "remplacer par l'historique réel de LAMPS." % presents
            )
        EcritureCompta.objects.all().delete()
        LiquidationBon.objects.all().delete()
        for modele, _ in DOCUMENTS.values():
            modele.objects.all().delete()
        Facture.objects.all().delete()
        self.stdout.write(self.style.WARNING('Purge : %d fiches retirées.' % presents))

    # ------------------------------------------------------------------ outils

    def _charger_les_correspondances(self):
        """Les clés de LAMPS (des codes) vers nos objets (des identifiants)."""
        self.adherents = {a.code: a.id for a in Adherent.objects.all()}
        self.natures = {n.code: n.id for n in TypePrestation.objects.all()}
        self.types_benef = {t.code: t.id for t in TypeBeneficiaire.objects.all()}

        self.fournisseurs, self.specialite_du_fournisseur = {}, {}
        for f in FournisseurDeSoins.objects.all():
            self.fournisseurs[f.code] = f.id
            self.specialite_du_fournisseur[f.code] = f.specialite_id

        # Les fournisseurs DIVERS (comptes 401xxx) : une facture peut en citer
        # un dans le même champ `numfourn` qu'un prestataire de soins.
        self.fournisseurs_divers = {f.code: f.id for f in FournisseurDivers.objects.all()}

        # LAMPS désigne un participant par « société-matricule ».
        self.participants, self.nom_participant = {}, {}
        for p in Participant.objects.select_related('adherent').all():
            cle = '%s-%s' % (p.adherent.code if p.adherent_id else '', p.matricule)
            self.participants[cle] = p.id
            self.nom_participant[cle] = ('%s %s' % (p.nom or '', p.prenoms or '')).strip()

        self.beneficiaires, self.nom_beneficiaire = {}, {}
        for b in Beneficiaire.objects.all():
            if b.matricule_benef:
                self.beneficiaires[b.matricule_benef] = b.id
                self.nom_beneficiaire[b.matricule_benef] = (
                    '%s %s' % (b.nom or '', b.prenoms or '')
                ).strip()

        self.stdout.write(
            'Correspondances : %d sociétés, %d participants, %d ayants droit, '
            '%d prestataires, %d natures.'
            % (len(self.adherents), len(self.participants), len(self.beneficiaires),
               len(self.fournisseurs), len(self.natures))
        )

    def _poser(self, modele, fiches, libelle):
        for debut in range(0, len(fiches), LOT):
            modele.objects.bulk_create(fiches[debut:debut + LOT], batch_size=LOT)
        self.stdout.write('  %-26s %6d' % (libelle, len(fiches)))

    # --------------------------------------------------------------- factures

    def _importer_factures(self, options):
        self.stdout.write('\nFactures')
        lignes = lire(options, """
            select numenreg, numfact, datefact, daterecep, datesaisie, delai,
                   montfact, remise, ristourne, qp_agent, rembourse, typeremb,
                   avoir, etat, etape, typefact, datetrait, datecompta,
                   datereglmt, numreglmt, typereglmt, montant_reglmt, acompte,
                   numfourn, codesoc
              from factures order by numenreg
        """)

        fiches, numeros = [], []
        for (numenreg, numfact, datefact, daterecep, datesaisie, delai, montfact,
             remise, ristourne, qp_agent, rembourse, typeremb, avoir, etat, etape,
             typefact, datetrait, datecompta, datereglmt, numreglmt, typereglmt,
             montant_reglmt, acompte, numfourn, codesoc) in lignes:
            code_fournisseur = texte(numfourn, 10)
            # Le numéro de fournisseur d'une facture désigne SOIT un
            # prestataire de soins, SOIT un fournisseur divers (un compte
            # 401xxx du plan comptable) - LAMPS les range dans le même champ.
            # Sept factures de l'origine citent ainsi 401019 (SIPREX SARL) :
            # sans ce rattrapage, elles arrivaient sans aucun fournisseur.
            id_soins = self.fournisseurs.get(code_fournisseur)
            id_divers = None if id_soins else self.fournisseurs_divers.get(code_fournisseur)
            fiches.append(Facture(
                type_fournisseur=(
                    TYPE_DIVERS if texte(typefact) == 'D' or id_divers else TYPE_SOINS
                ),
                numero_fournisseur=texte(numfact, 40),
                adherent_id=self.adherents.get(texte(codesoc, 4)),
                fournisseur_soins_id=id_soins,
                fournisseur_divers_id=id_divers,
                specialite_id=self.specialite_du_fournisseur.get(code_fournisseur),
                date_facture=datefact,
                recu_le=daterecep,
                saisie_le=datesaisie,
                delai=max(int(delai or 0), 0),
                frais_reel=max(int(montfact or 0), 0),
                remise=max(int(remise or 0), 0),
                ristourne=max(int(ristourne or 0), 0),
                qp_agent=max(int(qp_agent or 0), 0),
                remboursement_ticket=texte(rembourse).lower() == 'oui',
                type_remb=texte(typeremb, 10).lower(),
                avoir=bool(avoir),
                etat=ETATS_FACTURE.get(texte(etat), ETAT_RECUE),
                a_payer=texte(etape) == 'AP',
                acompte=bool(acompte),
                mois_traitement=datetrait.strftime('%b-%Y') if datetrait else '',
                traitee_le=datetrait,
                date_compta=datecompta,
                payee_le=datereglmt,
                date_reglement=datereglmt,
                numero_reglement=texte(numreglmt, 30),
                type_reglement=texte(typereglmt, 1),
                montant_reglement=max(int(montant_reglmt or 0), 0),
            ))
            numeros.append(str(numenreg))

        self._poser(Facture, fiches, 'reprises')
        # bulk_create renseigne les clés primaires (PostgreSQL) : on garde le
        # lien numéro d'enregistrement LAMPS -> notre identifiant.
        self.facture_de_lamps = {
            numero: fiche.pk for numero, fiche in zip(numeros, fiches) if fiche.pk
        }
        return len(fiches)

    # -------------------------------------------------------------- documents

    def _importer_documents(self, options):
        self.stdout.write('\nDocuments')
        lignes = lire(options, """
            select numdoc, typedoc, datedoc, codesoc, matripart, matribenef,
                   typebenef, codefourn, codepresc, codeprest, natprest,
                   numfact, etat, nbarticle, datepresc, remb_integral,
                   montant_remise, categ
              from documents_ipm order by numdoc
        """)

        paniers = {code: [] for code in DOCUMENTS}
        self.renseignements = {}
        ignores = doublons = 0
        vus = set()
        for (numdoc, typedoc, datedoc, codesoc, matripart, matribenef, typebenef,
             codefourn, codepresc, codeprest, natprest, numfact, etat, nbarticle,
             datepresc, remb_integral, montant_remise, categ) in lignes:
            type_doc = texte(typedoc)
            if type_doc not in DOCUMENTS:
                ignores += 1
                continue
            numero = texte(numdoc, 15)
            if numero in vus:
                doublons += 1
                continue
            vus.add(numero)

            # Quelques matricules de LAMPS portent une espace parasite
            # (« 01- 0824 ») : on la retire pour retrouver la fiche.
            cle_part = texte(matripart, 20).replace(' ', '')
            cle_benef = texte(matribenef, 25).replace(' ', '')
            code_fourn = texte(codefourn, 10)
            code_presc = texte(codepresc, 10)
            numero_facture = '' if numfact is None else str(int(numfact))

            commun = dict(
                code=numero,
                date=datedoc,
                adherent_id=self.adherents.get(texte(codesoc, 4)),
                participant_id=self.participants.get(cle_part),
                type_benef_id=self.types_benef.get(texte(typebenef, 4)),
                beneficiaire_id=self.beneficiaires.get(cle_benef),
                prescripteur_id=self.fournisseurs.get(code_presc),
                specialite_id=self.specialite_du_fournisseur.get(code_presc),
                numero_facture=numero_facture[:20],
                traite=texte(etat) == 'OK',
                remboursement_integral=bool(remb_integral),
            )
            self.renseignements[numero] = {
                'type': DOCUMENTS[type_doc][1],
                'matricule': cle_part,
                'beneficiaire': cle_benef,
                'date': datedoc,
                'societe': texte(codesoc, 4),
                'type_benef': texte(typebenef, 4),
                'facture': numero_facture,
            }

            if type_doc == 'BPI':
                paniers[type_doc].append(BonPharmacie(
                    pharmacie_id=self.fournisseurs.get(code_fourn),
                    nb_articles=max(int(nbarticle or 0), 0),
                    date_ordonnance=datepresc,
                    **commun,
                ))
            elif type_doc == 'BCI':
                paniers[type_doc].append(BonOptique(
                    fournisseur_id=self.fournisseurs.get(code_fourn),
                    date_ordonnance=datepresc,
                    montant_remise=max(int(montant_remise or 0), 0),
                    **commun,
                ))
            elif type_doc == 'LGI':
                paniers[type_doc].append(LettreGarantie(
                    prestataire_id=self.fournisseurs.get(code_fourn),
                    specialite_prestataire_id=self.specialite_du_fournisseur.get(code_fourn),
                    nature_prestation_id=self.natures.get(texte(natprest or codeprest, 4)),
                    nb_articles=max(int(nbarticle or 0), 0),
                    date_prescription=datepresc,
                    **commun,
                ))
            else:  # LHI
                paniers[type_doc].append(LettreHospitalisation(
                    prestataire_id=self.fournisseurs.get(code_fourn),
                    nature_prestation_id=self.natures.get(texte(natprest or codeprest, 4)),
                    categorie=texte(categ, 1),
                    date_prescription=datepresc,
                    **commun,
                ))

        total = 0
        for type_doc, (modele, _) in DOCUMENTS.items():
            self._poser(modele, paniers[type_doc], type_doc)
            total += len(paniers[type_doc])
        if ignores:
            self.stdout.write('  %-26s %6d  (TIC : pas de modèle chez nous)'
                              % ('ignorés', ignores))
        if doublons:
            self.stdout.write('  %-26s %6d' % ('numéros en double', doublons))
        return total

    # ----------------------------------------------------------- liquidations

    def _importer_liquidations(self, options):
        self.stdout.write('\nBons liquidés')
        lignes = lire(options, """
            select numdoc, codeprest, qte, tarif, freel, fexclus, qpmut,
                   ticket, qpassur, ajustmt
              from lignesprest order by numdoc, numligne
        """)

        identifiant = {}
        for modele, _ in DOCUMENTS.values():
            for id_doc, code in modele.objects.values_list('id', 'code'):
                identifiant[code] = id_doc

        groupes = {}
        for (numdoc, codeprest, qte, tarif, freel, fexclus, qpmut, ticket,
             qpassur, ajustmt) in lignes:
            numero = texte(numdoc, 20)
            g = groupes.setdefault(numero, {
                'freel': 0, 'fexclus': 0, 'qpipm': 0, 'qppart': 0,
                'qpassur': 0, 'ajustement': 0, 'actes': [],
            })
            g['freel'] += int(freel or 0)
            g['fexclus'] += int(fexclus or 0)
            g['qpipm'] += int(qpmut or 0)
            g['qppart'] += int(ticket or 0)
            g['qpassur'] += int(qpassur or 0)
            g['ajustement'] += int(ajustmt or 0)
            g['actes'].append({
                'code': texte(codeprest, 15),
                'quantite': int(qte or 0),
                'tarif': int(tarif or 0),
                'freel': int(freel or 0),
                'fexclus': int(fexclus or 0),
                'qpipm': int(qpmut or 0),
                'qppart': int(ticket or 0),
            })

        fiches, orphelins, sans_facture = [], 0, 0
        for numero, g in groupes.items():
            info = self.renseignements.get(numero)
            id_doc = identifiant.get(numero)
            if not info or not id_doc:
                orphelins += 1
                continue
            # Un bon liquidé appartient forcément à une facture chez nous
            # (`facture` n'est pas nullable). Quelques bons de LAMPS désignent
            # un numéro d'enregistrement qui n'existe plus dans `factures` :
            # on les laisse de côté plutôt que d'inventer un rattachement.
            id_facture = self.facture_de_lamps.get(info['facture'])
            if not id_facture:
                sans_facture += 1
                continue
            fiches.append(LiquidationBon(
                facture_id=id_facture,
                type_document=info['type'],
                document_id=id_doc,
                numero=numero,
                date_bon=info['date'],
                code_soc=info['societe'],
                matricule_part=info['matricule'],
                participant=self.nom_participant.get(info['matricule'], '')[:160],
                type_benef=info['type_benef'],
                beneficiaire=self.nom_beneficiaire.get(info['beneficiaire'], '')[:160],
                freel=max(g['freel'], 0),
                qpipm=max(g['qpipm'], 0),
                qppart=max(g['qppart'], 0),
                qpassur=max(g['qpassur'], 0),
                fexclus=max(g['fexclus'], 0),
                ajustement=g['ajustement'],
                actes=g['actes'],
            ))

        self._poser(LiquidationBon, fiches, 'repris')
        if orphelins:
            self.stdout.write('  %-26s %6d  (bon absent de documents_ipm)'
                              % ('sans document', orphelins))
        if sans_facture:
            self.stdout.write('  %-26s %6d  (facture absente de LAMPS)'
                              % ('sans facture', sans_facture))
        return len(fiches)

    # ------------------------------------------------------------ écritures

    def _importer_ecritures(self, options):
        """
        Le grand livre, dans l'ordre de LAMPS.

        Lu par tranches (`numligne` est la clé primaire, donc un parcours par
        bornes successives ne coûte rien) : charger les 396 873 lignes d'un
        coup tiendrait plusieurs centaines de mégaoctets en mémoire pour rien.

        L'ordre d'insertion est conservé tel quel : c'est celui que le Journal
        Central affiche, et il garde groupées les lignes d'un même traitement.
        """
        self.stdout.write('\nÉcritures comptables')
        TRANCHE = 50000
        derniere, total, rattachees, negatives = 0, 0, 0, 0

        while True:
            lignes = lire(options, """
                select numligne, codej, datepiece, datecompta, datetrait, numpiece,
                       numcheque, comptegen, comptetiers, libelle, debit, credit,
                       numdoc, numfactfrs, numfactipm, codesoc, matri, numfourn,
                       numtrans, lettrage, freels, fexclus
                  from compta where numligne > %s order by numligne limit %s
            """, (derniere, TRANCHE))
            if not lignes:
                break

            fiches = []
            for (numligne, codej, datepiece, datecompta, datetrait, numpiece,
                 numcheque, comptegen, comptetiers, libelle, debit, credit,
                 numdoc, numfactfrs, numfactipm, codesoc, matri, numfourn,
                 numtrans, lettrage, freels, fexclus) in lignes:
                derniere = numligne
                reference = texte(numfactipm, 20)
                identifiant = self.facture_de_lamps.get(reference)
                if identifiant:
                    rattachees += 1
                montant_debit = int(debit or 0)
                montant_credit = int(credit or 0)
                if montant_debit < 0 or montant_credit < 0:
                    negatives += 1
                fiches.append(EcritureCompta(
                    facture_id=identifiant,
                    codej=texte(codej, 5),
                    date_piece=datepiece,
                    date_compta=datecompta,
                    date_trait=datetrait,
                    numpiece=texte(numpiece, 25),
                    numcheque=texte(numcheque, 20),
                    comptegen=texte(comptegen, 12),
                    comptetiers=texte(comptetiers, 25),
                    libelle=texte(libelle, 120),
                    debit=montant_debit,
                    credit=montant_credit,
                    numdoc=texte(numdoc, 25),
                    numfactfrs=texte(numfactfrs, 50),
                    numfactipm=reference,
                    codesoc=texte(codesoc, 4),
                    matri=texte(matri, 20),
                    numfourn=texte(numfourn, 20),
                    numtrans=texte(numtrans, 20),
                    lettrage=texte(lettrage).lower() == 'oui',
                    # La liquidation portée par l'écriture : ce que l'onglet
                    # « Charges Techniques » de l'Interrogation Compte affiche.
                    frais_reel=int(freels or 0),
                    frais_exclus=int(fexclus or 0),
                ))

            for debut in range(0, len(fiches), LOT):
                EcritureCompta.objects.bulk_create(fiches[debut:debut + LOT], batch_size=LOT)
            total += len(fiches)
            self.stdout.write('  %-26s %6d' % ('reprises', total), ending='\r')

        self.stdout.write('  %-26s %6d' % ('reprises', total))
        self.stdout.write('  %-26s %6d  (les autres ne viennent d\'aucune facture)'
                          % ('rattachées à une facture', rattachees))
        self.stdout.write('  %-26s %6d  (annulations)' % ('en montant négatif', negatives))
        return total

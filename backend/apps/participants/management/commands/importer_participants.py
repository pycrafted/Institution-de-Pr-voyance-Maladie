# -*- coding: utf-8 -*-
"""
Reprend les participants RÉELS de LAMPS et leurs ayants droit.

Source : la base d'analyse ``lamps_analyse`` (le dump db_sar restauré), tables
``participants`` (664 lignes) et ``beneficiaires`` (3 838). Rien n'est inventé :
noms, dates, adresses, contrats et rattachements sont ceux de l'origine.

Deux particularités du réel, qui expliquent la forme de l'import :

1. **Le matricule ne suffit pas à désigner quelqu'un.** 163 des 664 participants
   sont rattachés à DEUX sociétés (l'IPM et une mutuelle) et portent le même
   matricule des deux côtés. La clé est donc le couple société + matricule -
   ce que LAMPS écrit « 01-0708 », et que l'application affiche déjà ainsi.

2. **Les ayants droit citent leur participant par ce couple** (``matripart``
   vaut « 01-0302 ») : le rattachement se fait là-dessus, pas sur le matricule
   seul. Le bénéficiaire de type 1 (« LUI-MÊME ») n'est pas repris : dans
   l'application, le participant est son propre bénéficiaire, sans fiche.

Les codes de LAMPS sont traduits dans le vocabulaire de l'application (état
A/R, contrat OU/FE, sexe MA/FE, situation familiale C/M/D/V) ; aucune valeur
n'est ajoutée.

Les fiches absentes du réel sont retirées, sauf celles qu'un document cite
encore (PROTECT) - elles sont alors comptées à part.

    DB_NAME=ipm_dev python manage.py importer_participants --motdepasse XXX
    DB_NAME=ipm_dev python manage.py importer_participants --sans-purge
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import ProtectedError

from adherents.models import Adherent
from donnees_de_base.lamps import ajouter_arguments, lire, texte
from donnees_de_base.models import TypeBeneficiaire
from participants.models import Beneficiaire, Participant

PARTICIPANTS = """
    select matricule, codesoc, nom, prenom, sexe, sitfam, datenaiss, lieunaiss,
           adresse, portable, email, region, dateemb, typecontrat,
           categprof, codedir, codedept, codeserv, numfiche, numcont, datesous,
           etatcont, dateres, dateradiation, etat, cin, type_piece
      from participants
     order by codesoc, matricule
"""

BENEFICIAIRES = """
    select matribenef, matripart, codebenef, nom, prenoms, sexe, datenaiss,
           lieunaiss, adresse, disabled
      from beneficiaires
     order by matribenef
"""

# Les codes de LAMPS, tels quels, vers les mots de l'application.
SEXE = {'MA': 'M', 'FE': 'F'}
ETAT = {'A': 'Actif', 'R': 'Radié'}
CONTRAT = {'OU': 'Ouverture', 'FE': 'Fermeture'}
SITUATION = {'C': 'CELIBATAIRE', 'M': 'MARIE', 'D': 'DIVORCE', 'V': 'VEUF'}


class Command(BaseCommand):
    help = "Reprend les participants et ayants droit réels depuis lamps_analyse."

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument(
            '--sans-purge',
            action='store_true',
            help="Garde les fiches absentes du réel au lieu de les retirer.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        societes = {a.code: a for a in Adherent.objects.all()}
        types = {t.code: t for t in TypeBeneficiaire.objects.all()}

        par_cle, crees, majs, sans_societe = {}, 0, 0, 0
        for ligne in lire(options, PARTICIPANTS):
            (matricule, codesoc, nom, prenom, sexe, sitfam, datenaiss, lieunaiss,
             adresse, portable, email, region, dateemb, typecontrat, categprof,
             codedir, codedept, codeserv, numfiche, numcont, datesous, etatcont,
             dateres, dateradiation, etat, cin, type_piece) = ligne
            matricule, codesoc = texte(matricule, 20), texte(codesoc)
            societe = societes.get(codesoc)
            if societe is None:
                sans_societe += 1
                continue
            participant, cree = Participant.objects.update_or_create(
                adherent=societe,
                matricule=matricule,
                defaults={
                    'nom': texte(nom, 100),
                    'prenoms': texte(prenom, 150),
                    'sexe': SEXE.get(texte(sexe), ''),
                    'situation_familiale': SITUATION.get(texte(sitfam)[:1], ''),
                    'date_naissance': datenaiss,
                    'lieu_naissance': texte(lieunaiss, 100),
                    'adresse': texte(adresse, 255),
                    'mobile': texte(portable, 30),
                    'email': texte(email, 254),
                    'region': texte(region, 50),
                    'date_embauche': dateemb,
                    'type_contrat': texte(typecontrat, 3),
                    'categorie': texte(categprof, 20),
                    'direction': texte(codedir, 10),
                    'departement': texte(codedept, 10),
                    'service': texte(codeserv, 10),
                    'numero_fiche': texte(numfiche, 20),
                    'numero_contrat': texte(numcont, 30),
                    'date_souscription': datesous,
                    'etat_contrat': CONTRAT.get(texte(etatcont), 'Ouverture'),
                    'date_resiliation': dateres,
                    'date_radiation': dateradiation,
                    'etat': ETAT.get(texte(etat), 'En Attente'),
                    'numero_piece': texte(cin, 30),
                    'type_piece': texte(type_piece, 20),
                    'actif': True,
                },
            )
            crees += cree
            majs += not cree
            par_cle['%s-%s' % (codesoc, matricule)] = participant

        b_crees, b_majs, orphelins, sans_type = 0, 0, 0, 0
        vus = set()
        for ligne in lire(options, BENEFICIAIRES):
            (matribenef, matripart, codebenef, nom, prenoms, sexe, datenaiss,
             lieunaiss, adresse, disabled) = ligne
            code_type = texte(codebenef)
            # Type 1 « LUI-MÊME » : pas de fiche, le participant l'est déjà.
            if code_type == '1':
                continue
            participant = par_cle.get(texte(matripart))
            if participant is None:
                orphelins += 1
                continue
            type_benef = types.get(code_type)
            if type_benef is None:
                sans_type += 1
                continue
            matribenef = texte(matribenef, 25)
            _, cree = Beneficiaire.objects.update_or_create(
                matricule_benef=matribenef,
                defaults={
                    'participant': participant,
                    'type_benef': type_benef,
                    'nom': texte(nom, 100),
                    'prenoms': texte(prenoms, 150),
                    'sexe': SEXE.get(texte(sexe), ''),
                    'date_naissance': datenaiss,
                    'lieu_naissance': texte(lieunaiss, 100),
                    'adresse': texte(adresse, 255),
                    'etat': 'Radié' if disabled else 'Actif',
                    'actif': not disabled,
                },
            )
            b_crees += cree
            b_majs += not cree
            vus.add(matribenef)

        retires, proteges = 0, 0
        if not options['sans_purge']:
            retires, proteges = self._purger(par_cle, vus)

        self.stdout.write(
            self.style.SUCCESS(
                'Participants : %d créés, %d mis à jour (%d sans société connue).\n'
                'Ayants droit : %d créés, %d mis à jour '
                '(%d sans participant, %d sans type connu).\n'
                'Retirés (absents du réel) : %d ; retenus par un document : %d.'
                % (crees, majs, sans_societe, b_crees, b_majs, orphelins,
                   sans_type, retires, proteges)
            )
        )

    def _purger(self, par_cle, matricules_benef):
        """Retire fiche par fiche : un document qui en cite une la retient."""
        retires = proteges = 0
        for benef in Beneficiaire.objects.exclude(matricule_benef__in=matricules_benef):
            try:
                with transaction.atomic():
                    benef.delete()
                retires += 1
            except ProtectedError:
                proteges += 1
        gardes = {p.pk for p in par_cle.values()}
        for participant in Participant.objects.exclude(pk__in=gardes):
            try:
                with transaction.atomic():
                    participant.delete()
                retires += 1
            except ProtectedError:
                proteges += 1
        return retires, proteges

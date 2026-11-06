# -*- coding: utf-8 -*-
"""
Efface ce qui trahit l'origine des données : la SAR, LAMPS, les vrais tiers.

Deux commandes masquaient déjà une partie du réel :

- ``masquer_donnees_internes`` : structures, fournisseurs divers, journaux ;
- ``anonymiser_fournisseurs_soins`` : les 412 prestataires de soins.

Restaient quatre endroits où l'origine se lit en toutes lettres, et ce sont
justement les plus visibles à l'écran :

1. les **adhérents** - « IPM SAR PERSONNEL CADRES » ;
2. le **plan comptable** - 27 intitulés nomment la SAR, LAMPS ou un régime,
   sans compter les 17 comptes 401xxx qui portent de vrais fournisseurs
   (SONATEL, SENELEC, SDE…) et les 11 comptes 521xxx qui nomment de vraies
   banques ;
3. les **banques** du module Traitements (B1 à B10) ;
4. l'**identité de l'IPM** (Paramètres → Informations Générales).

**Ce qui n'est PAS touché** : les codes, les comptes, les volumes, la
hiérarchie, les rattachements. Même nombre de lignes, mêmes numéros, mêmes
liens - seuls les libellés changent. L'application continue de fonctionner à
l'identique, et les écritures qui citent un compte par son numéro restent
lisibles.

La nomenclature médicale (spécialités, prestations, actes, médicaments) n'est
pas touchée non plus : elle n'a rien de confidentiel et doit rester celle de
LAMPS, sans quoi la liquidation n'aurait plus de sens.

    DB_NAME=lah python manage.py masquer_origine

Relançable sans dégât : les substitutions ne retrouvent plus rien à remplacer.
"""

import re

from django.core.management.base import BaseCommand
from django.db import transaction

from adherents.models import Adherent
from donnees_de_base.models import CompteComptable, FournisseurDivers, JournalComptable
from parametres.models import InformationsIPM
from traitements.models import Banque

# --- Les sociétés adhérentes ------------------------------------------------
# Une entreprise inventée (ORIA) et ses deux mutuelles de retraités. Les codes
# 01 à 04 ne bougent pas : tout le reste s'y accroche.
ADHERENTS = {
    '01': 'IPM ORIA PERSONNEL EXECUTION',
    '02': 'IPM ORIA PERSONNEL CADRES',
    '03': 'MUTUELLE CADRES RETRAITES',
    '04': 'MUTUELLE NON CADRES RETRAITES',
}

# --- Les dix banques --------------------------------------------------------
# Deux réseaux inventés, déclinés par entité et par usage - la structure réelle
# est conservée (c'est elle qui explique pourquoi B7 et B8 disent
# « FONCTIONNEMENT »), seuls les noms sont faux.
BANQUES = {
    'B1': 'BANQUE DU LITTORAL IPM',
    'B2': 'BANQUE DU LITTORAL MCA',
    'B3': 'BANQUE DU LITTORAL MCS',
    'B4': "BANQUE DE L'ESTUAIRE IPM",
    'B5': "BANQUE DE L'ESTUAIRE MCA",
    'B6': 'BANQUE DU LITTORAL MCR',
    'B7': "BANQUE DE L'ESTUAIRE IPM FONCTIONNEMENT",
    'B8': "BANQUE DE L'ESTUAIRE MCA FONCTIONNEMENT",
    'B9': "BANQUE DE L'ESTUAIRE MCS",
    'B10': "BANQUE DE L'ESTUAIRE MNR",
}

# --- Les sigles, remplacés partout -----------------------------------------
# L'ordre compte : on remplace du plus long au plus court, sinon « CMMC »
# mangerait le début de « CMMCR-SAR ». Les bornes de mot (\b) évitent que
# « SAR » n'attaque « SARL ».
SIGLES = [
    ('CMM NCR-SAR', 'MNR'),
    ('CMM CR-SAR', 'MCR'),
    ('CMMCR-SAR', 'MCR'),
    ('CMMCR -SAR', 'MCR'),
    ('CMMC-R', 'MCR'),
    ('CMMCR', 'MCR'),
    ('MSRNC-SAR', 'MNR'),
    ('MSRNC SAR', 'MNR'),
    ('MSRNC', 'MNR'),
    ('CMMC', 'MCA'),
    ('CSM', 'MCS'),
    ('CREDIT DU SENEGAL', 'BANQUE DU LITTORAL'),
    ('ECOBANK', "BANQUE DE L'ESTUAIRE"),
    ('LAMPS', 'GESMUT'),
    ('SAR', 'ORIA'),
    # Le plan comptable traîne aussi les comptes d'un AUTRE client de LAMPS -
    # subventions, dahiras, emprunts qui n'ont rien à voir avec l'IPM reprise
    # ici. Les laisser reviendrait à dire quels organismes LAMPS équipait.
    ('SONATEL MULTIMEDIA', 'TELECOM REGIONALE MEDIAS'),
    ('SONATEL MOBILES', 'TELECOM REGIONALE MOBILE'),
    ('SONATEL SA', 'TELECOM REGIONALE SA'),
    ('SONATEL', 'TELECOM REGIONALE'),
    ('SENELEC', 'SOCIETE ELECTRIQUE'),
    ('SDE', 'SOCIETE DES EAUX'),
    # Les amicales de personnel du même client : un « dahira » rattaché à un
    # employeur le désigne aussi sûrement que son nom.
    ('DAHIRA TOUBA POSTE', 'AMICALE DU PERSONNEL'),
    ('DAHIRA', 'AMICALE'),
    # Relevé en relisant les 462 intitulés un à un, après un premier passage
    # qui les avait manqués : des sigles sans séparateur, et de vrais tiers
    # financiers et assureurs sénégalais.
    ('CMMNCR', 'MNR'),
    ('MCA R', 'MCR'),
    ('PERSONNEL MOO', 'PERSONNEL EXECUTION'),
    ('SAGAM', 'FINANCIERE DU LITTORAL'),
    ('AMSA', 'ASSUREUR ATLANTIQUE'),
    ('SONAM', 'ASSUREUR MERIDIEN'),
    ('ORANGE MONEY', 'PORTE-MONNAIE MOBILE'),
]

# --- Les vrais fournisseurs du plan comptable (401xxx) ----------------------
# Des sociétés inventées, de même nature que les vraies (imprimeur, télécom,
# eau, électricité, informatique) pour que les comptes gardent leur sens.
FOURNISSEURS_401 = [
    'IMPRIMERIE DU FLEUVE',
    'BUREAUTIQUE CENTRALE',
    'PAPETERIE DU PORT',
    'TELECOM REGIONALE',
    'SOCIETE DES EAUX',
    'SOCIETE ELECTRIQUE',
    'INFORMATIQUE ET RESEAUX',
    'DISTRIBUTION GENERALE',
    'EDITIONS DU LITTORAL',
    'MOBILIER ET AGENCEMENT',
    'CLINIQUE INTERNATIONALE',
    'CENTRE MEDICAL ETRANGER',
    'TRANSPORTS URBAINS',
    'MAINTENANCE TECHNIQUE',
    'SERVICES GENERAUX',
    'FOURNITURES DE BUREAU',
    'ASSURANCES REUNIES',
]


def remplacer_sigles(texte):
    """Applique les substitutions de sigles à un libellé, bornes de mot incluses."""
    resultat = texte or ''
    for avant, apres in SIGLES:
        resultat = re.sub(r'\b%s\b' % re.escape(avant), apres, resultat)
    return resultat


class Command(BaseCommand):
    help = "Masque la SAR, LAMPS et les vrais tiers dans les libellés."

    @transaction.atomic
    def handle(self, *args, **options):
        self._adherents()
        self._banques()
        self._comptes()
        self._identite()
        self.stdout.write(
            self.style.SUCCESS(
                "\nOrigine masquée. Codes, comptes, volumes et rattachements "
                "inchangés : l'application fonctionne à l'identique."
            )
        )

    def _adherents(self):
        change = 0
        for adherent in Adherent.objects.all():
            nouveau = ADHERENTS.get(adherent.code)
            if nouveau and adherent.libelle != nouveau:
                adherent.libelle = nouveau
                adherent.save(update_fields=['libelle', 'modifie_le'])
                change += 1
        self.stdout.write('  %-34s %3d' % ('adhérents renommés', change))

    def _banques(self):
        """
        Les banques et leurs journaux portent le même nom : B6 est à la fois
        un journal et un compte 521600. Les renommer d'un seul endroit évite
        qu'ils ne divergent.
        """
        banques = journaux = 0
        for banque in Banque.objects.all():
            nouveau = BANQUES.get(banque.code)
            reseau = remplacer_sigles(banque.reseau)
            if (nouveau and banque.libelle != nouveau) or reseau != banque.reseau:
                banque.libelle = nouveau or banque.libelle
                # `reseau` porte lui aussi le vrai nom (« ECOBANK »).
                banque.reseau = reseau
                banque.save(update_fields=['libelle', 'reseau', 'modifie_le'])
                banques += 1
        for journal in JournalComptable.objects.filter(code__in=BANQUES):
            nouveau = BANQUES[journal.code]
            if journal.libelle != nouveau:
                journal.libelle = nouveau
                journal.save(update_fields=['libelle', 'modifie_le'])
                journaux += 1
        self.stdout.write('  %-34s %3d' % ('banques renommées', banques))
        self.stdout.write('  %-34s %3d' % ('journaux de banque alignés', journaux))

        # Les autres journaux (cotisations, opérations diverses) peuvent eux
        # aussi citer un régime : on y passe les sigles.
        autres = 0
        for journal in JournalComptable.objects.exclude(code__in=BANQUES):
            nouveau = remplacer_sigles(journal.libelle)
            if nouveau != journal.libelle:
                journal.libelle = nouveau
                journal.save(update_fields=['libelle', 'modifie_le'])
                autres += 1
        self.stdout.write('  %-34s %3d' % ('autres journaux nettoyés', autres))

    def _comptes(self):
        """
        Le plan comptable : sigles partout, et les 401xxx reçoivent des
        fournisseurs inventés. Les 400xxx (spécialités) et 602xxx
        (prestations) ne bougent pas - c'est de la nomenclature médicale.
        """
        sigles = 0
        for compte in CompteComptable.objects.all():
            nouveau = remplacer_sigles(compte.libelle)
            if nouveau != compte.libelle:
                compte.libelle = nouveau
                compte.save(update_fields=['libelle', 'modifie_le'])
                sigles += 1
        self.stdout.write('  %-34s %3d' % ('comptes dé-sigles', sigles))

        # Les fournisseurs nommés, dans l'ordre des comptes pour rester
        # reproductible d'une base à l'autre. Le compte collectif 401 (« 401 »,
        # « FOURNISSEURS DETTES EN COMPTE ») garde son intitulé : ce n'est le
        # nom de personne.
        nommes = (
            CompteComptable.objects.filter(code__startswith='401')
            .exclude(code='401')
            .order_by('code')
        )
        fournisseurs = 0
        for rang, compte in enumerate(nommes):
            nouveau = FOURNISSEURS_401[rang % len(FOURNISSEURS_401)]
            if compte.libelle != nouveau:
                compte.libelle = nouveau
                compte.save(update_fields=['libelle', 'modifie_le'])
                fournisseurs += 1
        self.stdout.write('  %-34s %3d' % ('comptes fournisseurs (401xxx)', fournisseurs))

        # Et les fiches « Fournisseurs Divers » du référentiel, qui portent les
        # mêmes sociétés. `masquer_donnees_internes` les traite déjà, mais la
        # commande peut n'avoir pas été passée : on repasse les sigles.
        divers = 0
        for fiche in FournisseurDivers.objects.all():
            nouveau = remplacer_sigles(fiche.libelle)
            if nouveau != fiche.libelle:
                fiche.libelle = nouveau
                fiche.save(update_fields=['libelle', 'modifie_le'])
                divers += 1
        self.stdout.write('  %-34s %3d' % ('fournisseurs divers nettoyés', divers))

    def _identite(self):
        """L'en-tête de l'institution (Paramètres → Informations Générales)."""
        infos = InformationsIPM.objects.first()
        if not infos:
            self.stdout.write('  %-34s %3s' % ('identité IPM', '-'))
            return
        infos.intitule = 'IPM ORIA'
        infos.adresse = 'Zone Industrielle'
        infos.telephone = '33 800 00 00'
        infos.fax = '33 800 00 01'
        infos.boite_postale = '1000'
        infos.email = 'contact@ipm-oria.sn'
        infos.contact_nom = ''
        infos.contact_telephone = ''
        infos.contact_email = ''
        infos.latitude = ''
        infos.longitude = ''
        infos.save()
        self.stdout.write('  %-34s %3s' % ('identité IPM', 'ok'))

# -*- coding: utf-8 -*-
"""
Reprend les RETENUES réelles de LAMPS (``retenues`` + ``lignes_retenues``).

148 campagnes et 20 664 lignes. Même forme que les cotisations : la table
d'en-tête ne porte qu'un code, un statut et une société ; la période vit sur
les lignes, identique d'une ligne à l'autre (vérifié : 0 campagne sur 148 en
porte deux).

    DB_NAME=vrai_base python manage.py importer_retenues --purger

**Les trois montants, et lequel vient d'où.** LAMPS n'en tient qu'un par
ligne, ``mont_retenue`` : c'est ce que la paie a réellement prélevé, donc
notre ``retenue_paie``. Le ``solde`` est la dette photographiée au moment de
l'appel, et la « Retenue IPM » n'existe pas dans l'origine : c'est une
proposition, ``min(solde, 35 000)``, que notre écran recalcule et qui ne part
jamais en comptabilité (cf. l'en-tête de ``LigneRetenue``). On la repose donc
à l'import plutôt que de laisser une colonne à zéro qui ferait croire à une
absence de proposition.

Comme pour les cotisations, ``compta`` est un « Oui » / « Non » et non une
date : notre ``date_compta`` reste vide, seule l'écriture la porte.

Le matricule est rapproché **à l'identique**. Ne jamais retirer les zéros de
tête : « 0302 » et « 302 » sont deux personnes dans LAMPS, et 151 matricules
se confondraient.
"""

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from adherents.models import Adherent
from donnees_de_base.lamps import ajouter_arguments, lire, texte
from participants.models import Participant
from traitements.models import (
    PLAFOND_RETENUE_IPM,
    STATUT_APPEL_COMPTABILISE,
    STATUT_APPEL_OUVERT,
    CampagneRetenue,
    LigneRetenue,
)

CAMPAGNES = 'select code_retenue, statut, codesoc, compta from retenues order by code_retenue'

LIGNES = """
    select code_retenue, matricule, annee, mois, mont_retenue, datetrait, solde
    from lignes_retenues
    order by code_retenue, matricule
"""


def entier(valeur):
    try:
        return int(valeur or 0)
    except (TypeError, ValueError):
        return 0


class Command(BaseCommand):
    help = 'Reprend les retenues réelles de LAMPS (campagnes et lignes).'

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument(
            '--purger',
            action='store_true',
            help='Vide d’abord les campagnes et leurs lignes (reprise globale).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['purger']:
            LigneRetenue.objects.all().delete()
            CampagneRetenue.objects.all().delete()

        adherents = {a.code: a for a in Adherent.objects.all()}
        participants = {p.matricule: p for p in Participant.objects.all()}

        lignes = defaultdict(list)
        for code, matricule, annee, mois, montant, datetrait, solde in lire(options, LIGNES):
            lignes[texte(code, 20)].append(
                (texte(matricule), entier(annee), entier(mois), entier(montant), datetrait,
                 entier(solde))
            )

        crees = sans_societe = sans_ligne = 0
        posees = sans_participant = 0
        a_poser = []

        for code, statut, codesoc, compta in lire(options, CAMPAGNES):
            code = texte(code, 20)
            siennes = lignes.get(code)
            if not siennes:
                sans_ligne += 1
                continue
            adherent = adherents.get(texte(codesoc))
            if adherent is None:
                sans_societe += 1
                continue

            _, annee, mois, _, datetrait, _ = siennes[0]
            campagne = CampagneRetenue.objects.create(
                code=code,
                adherent=adherent,
                annee=annee,
                mois=mois,
                date_piece=datetrait,
                date_trait=datetrait,
                date_compta=None,
                statut=(
                    STATUT_APPEL_COMPTABILISE
                    if texte(statut).upper() == 'OK' or texte(compta).lower().startswith('oui')
                    else STATUT_APPEL_OUVERT
                ),
            )
            crees += 1

            for matricule, _, _, montant, _, solde in siennes:
                participant = participants.get(matricule)
                if participant is None:
                    sans_participant += 1
                    continue
                a_poser.append(
                    LigneRetenue(
                        campagne=campagne,
                        participant=participant,
                        solde=solde,
                        retenue_ipm=min(max(0, solde), PLAFOND_RETENUE_IPM),
                        retenue_paie=montant,
                    )
                )
                posees += 1

        LigneRetenue.objects.bulk_create(a_poser, batch_size=2000)

        self.stdout.write(f'Campagnes de retenue : {crees} reprises')
        if sans_societe:
            self.stdout.write(f'  dont écartées, société inconnue : {sans_societe}')
        if sans_ligne:
            self.stdout.write(f'  dont écartées, aucune ligne : {sans_ligne}')
        self.stdout.write(f'Lignes : {posees} reprises')
        if sans_participant:
            self.stdout.write(f'  écartées, matricule sans participant : {sans_participant}')

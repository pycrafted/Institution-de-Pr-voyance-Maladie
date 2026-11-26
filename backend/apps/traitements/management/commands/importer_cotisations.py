# -*- coding: utf-8 -*-
"""
Reprend les COTISATIONS réelles de LAMPS (``table_cotisations`` + ``ligne_cotisations``).

585 appels et 97 255 lignes, de 2020 à aujourd'hui. C'était le dernier gros
module que la base de test laissait vide.

    DB_NAME=vrai_base python manage.py importer_cotisations --purger

**Ce que LAMPS range où, et nous donc.** L'appel n'a presque rien dans sa
table : un code, un statut, une société. La période, le type et le montant
vivent sur ses LIGNES, identiques d'une ligne à l'autre pour la période et le
type (vérifié : 0 appel sur 585 en porte deux). On remonte donc ces trois-là
de la première ligne vers l'appel.

Le **montant**, lui, varie à l'intérieur d'un même appel (264 appels sur 585
ont plusieurs montants) : c'est la ligne qui fait foi, et le
``montant_unitaire`` de l'appel ne garde que le montant le plus répandu -
celui que l'écran propose à la saisie.

Le **type de cotisation est un journal** (``C500``, ``C910``…), comme ailleurs
dans ce module : on garde son code, pas une clé étrangère.

Les lignes dont le matricule n'a plus de participant sont comptées et
écartées : notre ``LigneCotisation.participant`` n'est pas nullable, et
inventer une fiche pour un salarié parti remettrait du faux dans la base.

Attention au champ ``compta`` de LAMPS : malgré son nom, ce n'est pas une
date mais un « Oui » / « Non ». La DATE de comptabilisation n'est pas tenue
par l'appel - seule l'écriture la porte -, et notre ``date_compta`` reste
donc vide. Le couple est d'ailleurs redondant dans l'origine : 565 appels
sont « OK / Oui » et 20 « KO / Non », jamais autre chose.
"""

from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from adherents.models import Adherent
from donnees_de_base.lamps import ajouter_arguments, lire, texte
from traitements.models import (
    STATUT_APPEL_COMPTABILISE,
    STATUT_APPEL_OUVERT,
    AppelCotisation,
    LigneCotisation,
)

APPELS = """
    select code_cotis, statut, codesoc, compta
    from table_cotisations
    order by code_cotis
"""

LIGNES = """
    select code_cotis, matricule, annee, mois, mont_cotis, datetrait, type_cotis
    from ligne_cotisations
    order by code_cotis, matricule
"""


def entier(valeur):
    try:
        return max(int(valeur or 0), 0)
    except (TypeError, ValueError):
        return 0


class Command(BaseCommand):
    help = 'Reprend les cotisations réelles de LAMPS (appels et lignes).'

    def add_arguments(self, parser):
        ajouter_arguments(parser)
        parser.add_argument(
            '--purger',
            action='store_true',
            help='Vide d’abord les appels et leurs lignes (reprise globale).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['purger']:
            LigneCotisation.objects.all().delete()
            AppelCotisation.objects.all().delete()

        adherents = {a.code: a for a in Adherent.objects.all()}
        participants = self.participants_par_matricule()

        # Les lignes d'abord : elles portent la période, le type et le montant
        # dont l'appel a besoin.
        lignes = defaultdict(list)
        for code, matricule, annee, mois, montant, datetrait, type_cotis in lire(options, LIGNES):
            lignes[texte(code, 25)].append(
                (texte(matricule), entier(annee), entier(mois), entier(montant), datetrait,
                 texte(type_cotis, 4))
            )

        crees = sans_societe = sans_ligne = 0
        posees = sans_participant = 0
        a_poser = []

        for code, statut, codesoc, compta in lire(options, APPELS):
            code = texte(code, 25)
            siennes = lignes.get(code)
            if not siennes:
                sans_ligne += 1
                continue
            adherent = adherents.get(texte(codesoc))
            if adherent is None:
                sans_societe += 1
                continue

            _, annee, mois, _, datetrait, journal = siennes[0]
            montants = Counter(ligne[3] for ligne in siennes)
            appel = AppelCotisation.objects.create(
                code=code,
                adherent=adherent,
                journal=journal,
                annee=annee,
                mois=mois,
                date_piece=datetrait,
                date_trait=datetrait,
                # `compta` est un « Oui » / « Non », pas une date (cf. en-tête).
                date_compta=None,
                montant_unitaire=montants.most_common(1)[0][0] if montants else None,
                statut=(
                    STATUT_APPEL_COMPTABILISE
                    if texte(statut).upper() == 'OK' or texte(compta).lower().startswith('oui')
                    else STATUT_APPEL_OUVERT
                ),
            )
            crees += 1

            for matricule, _, _, montant, _, _ in siennes:
                participant = participants.get(matricule)
                if participant is None:
                    sans_participant += 1
                    continue
                a_poser.append(
                    LigneCotisation(appel=appel, participant=participant, montant=montant)
                )
                posees += 1

        LigneCotisation.objects.bulk_create(a_poser, batch_size=2000)

        self.stdout.write(f'Appels de cotisation : {crees} repris')
        if sans_societe:
            self.stdout.write(f'  dont écartés, société inconnue : {sans_societe}')
        if sans_ligne:
            self.stdout.write(f'  dont écartés, aucune ligne : {sans_ligne}')
        self.stdout.write(f'Lignes : {posees} reprises')
        if sans_participant:
            self.stdout.write(
                f'  écartées, matricule sans participant : {sans_participant}'
            )

    def participants_par_matricule(self):
        from participants.models import Participant

        # Le matricule EXACTEMENT tel qu'il est écrit, et rien d'autre. Ne
        # jamais rapprocher « 0302 » de « 302 » en retirant les zéros de tête :
        # ce sont deux personnes différentes dans LAMPS, et 151 matricules se
        # confondraient ainsi. Nos participants viennent du même export, leur
        # matricule est donc déjà à la bonne écriture.
        return {p.matricule: p for p in Participant.objects.all()}

# -*- coding: utf-8 -*-
"""
Réduit la base à un petit lot de participants, et les anonymise.

Pour un environnement de test ouvert sur internet, 675 salariés n'apportent
rien que trente n'apportent déjà : les listes, les familles, les quatre
sociétés, les états de dossier. Ils ajoutent en revanche 675 personnes
réelles à protéger. On garde donc un échantillon, et on l'anonymise.

Les noms tirés sont **français** par défaut, et c'est voulu : dans une
entreprise sénégalaise, un « Bernard Lefèvre » ne peut être confondu avec
personne. Un tirage de noms sénégalais, lui, finit par reconstituer de vraies
identités - 36 fois sur 675 lors du premier essai.

L'échantillon n'est pas pris au hasard : on garde d'abord les fiches que des
documents citent (sans quoi l'application serait vide), puis on complète en
couvrant les quatre sociétés et tous les états de dossier.

    DB_NAME=ipm_cloud python manage.py jeu_de_test --participants 30
    DB_NAME=ipm_cloud python manage.py jeu_de_test --participants 30 --noms senegalais
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, ProtectedError

from participants.models import Beneficiaire, Participant

PRENOMS_M = [
    'Antoine', 'Baptiste', 'Clément', 'Damien', 'Étienne', 'Fabien', 'Gaspard',
    'Hugo', 'Julien', 'Laurent', 'Mathieu', 'Nicolas', 'Olivier', 'Pascal',
    'Quentin', 'Rémi', 'Sébastien', 'Thibault', 'Vincent', 'Xavier', 'Yann',
    'Alexandre', 'Benoît', 'Cédric', 'Didier', 'Emmanuel', 'François',
    'Grégoire', 'Henri', 'Jérôme', 'Ludovic', 'Marc', 'Philippe', 'Romain',
    'Stéphane', 'Thierry', 'Victor', 'Arnaud', 'Bruno', 'Charles',
]
PRENOMS_F = [
    'Amélie', 'Béatrice', 'Camille', 'Delphine', 'Élodie', 'Florence',
    'Gabrielle', 'Hélène', 'Isabelle', 'Juliette', 'Karine', 'Laure',
    'Margaux', 'Nathalie', 'Océane', 'Pauline', 'Quitterie', 'Romane',
    'Sandrine', 'Thérèse', 'Valérie', 'Agnès', 'Brigitte', 'Céline',
    'Dominique', 'Émilie', 'Fanny', 'Geneviève', 'Inès', 'Joséphine',
    'Léa', 'Manon', 'Noémie', 'Odile', 'Perrine', 'Sophie', 'Sylvie',
    'Aurélie', 'Claire', 'Mathilde',
]
NOMS = [
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit',
    'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefèvre', 'Michel',
    'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel',
    'Girard', 'André', 'Mercier', 'Blanc', 'Guérin', 'Boyer', 'Chevalier',
    'Masson', 'Fontaine', 'Rousseau', 'Perrin', 'Renard', 'Marchand',
    'Dumont', 'Barbier', 'Picard', 'Lemoine', 'Gauthier', 'Noël',
]

# Le jeu sénégalais reste disponible : c'est celui de la base de présentation,
# où des noms du pays sont plus crédibles devant le métier.
from participants.management.commands.anonymiser_participants import (  # noqa: E402
    NOMS as NOMS_SN,
    PRENOMS_F as PRENOMS_F_SN,
    PRENOMS_M as PRENOMS_M_SN,
)

JEUX = {
    'francais': (PRENOMS_M, PRENOMS_F, NOMS),
    'senegalais': (PRENOMS_M_SN, PRENOMS_F_SN, NOMS_SN),
}


class Command(BaseCommand):
    help = "Réduit la base à un lot de participants de test, et les anonymise."

    def add_arguments(self, parser):
        parser.add_argument('--participants', type=int, default=30)
        parser.add_argument('--noms', choices=sorted(JEUX), default='francais')
        parser.add_argument('--seed', type=int, default=None)

    @transaction.atomic
    def handle(self, *args, **options):
        if options['seed'] is not None:
            random.seed(options['seed'])
        prenoms_m, prenoms_f, noms = JEUX[options['noms']]

        gardes = self._echantillon(options['participants'])
        retires, retenus = self._retirer_les_autres(gardes)
        # On anonymise TOUT ce qui reste, pas seulement l'échantillon : une
        # fiche qu'un document retient survit à la purge, et elle sortirait
        # sinon avec son vrai nom.
        self._anonymiser(prenoms_m, prenoms_f, noms)

        restants = Participant.objects.count()
        beneficiaires = Beneficiaire.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                'Jeu de test : %d participants (%d ayants droit), '
                '%d retirés, %d retenus par un document.\n'
                'Identités, dates, lieux, adresses, coordonnées, pièces : '
                'remplacés en noms %s. Photos retirées.'
                % (restants, beneficiaires, retires, retenus, options['noms'])
            )
        )

    def _echantillon(self, combien):
        """
        Les fiches à garder, dans cet ordre de priorité :

        1. celles qu'un document cite - sans elles les écrans seraient vides ;
        2. un représentant par couple (société, état), pour que les listes
           montrent autre chose qu'une seule situation ;
        3. des dossiers **Actifs** avec la plus grande famille - ce sont les
           seuls qui peuvent se servir de l'application mobile, et une famille
           nombreuse fait un meilleur cas d'essai qu'une fiche seule.
        """
        avec_famille = Participant.objects.annotate(
            taille=Count('beneficiaires')
        ).select_related('adherent')

        gardes, vus = [], set()

        def ajouter(participant):
            if participant.pk in vus or len(gardes) >= combien:
                return
            gardes.append(participant)
            vus.add(participant.pk)

        for participant in avec_famille:
            if participant.bons_pharmacie.exists() or participant.lettres_garantie.exists():
                ajouter(participant)

        couples = set()
        for participant in avec_famille.order_by('-taille', 'matricule'):
            cle = (participant.adherent_id, participant.etat)
            if cle not in couples:
                couples.add(cle)
                ajouter(participant)

        for participant in avec_famille.filter(etat='Actif').order_by('-taille', 'matricule'):
            ajouter(participant)
        for participant in avec_famille.order_by('-taille', 'matricule'):
            ajouter(participant)
        return gardes

    def _retirer_les_autres(self, gardes):
        """Retire fiche par fiche : un document qui en cite une la retient."""
        a_garder = {p.pk for p in gardes}
        retires = retenus = 0
        for benef in Beneficiaire.objects.exclude(participant__pk__in=a_garder):
            try:
                with transaction.atomic():
                    benef.delete()
                retires += 1
            except ProtectedError:
                retenus += 1
        for participant in Participant.objects.exclude(pk__in=a_garder):
            try:
                with transaction.atomic():
                    participant.delete()
                retires += 1
            except ProtectedError:
                retenus += 1
        return retires, retenus

    def _anonymiser(self, prenoms_m, prenoms_f, noms):
        """
        Chaque famille reçoit un patronyme, et chacun de ses membres un
        prénom distinct - deux frères ne portent pas le même.
        """
        from participants.management.commands.anonymiser_participants import Command as Anonyme

        restants = list(Participant.objects.select_related('adherent').order_by('pk'))
        patronymes = random.sample(noms, min(len(restants), len(noms)))
        for rang, participant in enumerate(restants):
            patronyme = patronymes[rang % len(patronymes)]
            pris = set()

            def prenom(sexe):
                source = prenoms_f if str(sexe).upper().startswith('F') else prenoms_m
                libres = [p for p in source if p not in pris]
                choisi = random.choice(libres or source)
                pris.add(choisi)
                return choisi

            participant.nom = patronyme
            participant.prenoms = prenom(participant.sexe)
            participant.matricule = '%04d' % (9000 + rang + 1)
            Anonyme._effacer_traces(participant)
            participant.mobile = (
                '%s %d %02d %02d'
                % (
                    random.choice(['70', '75', '76', '77', '78']),
                    random.randint(100, 999),
                    random.randint(0, 99),
                    random.randint(0, 99),
                )
                if participant.mobile
                else ''
            )
            participant.email = (
                '%s.%s@exemple.sn' % (participant.prenoms.lower(), patronyme.lower())
                if participant.email
                else ''
            )
            participant.numero_piece = (
                '%09d' % random.randint(0, 10**9 - 1) if participant.numero_piece else ''
            )
            societe = participant.adherent.code if participant.adherent_id else ''

            for benef in participant.beneficiaires.all():
                fin = (benef.matricule_benef or '').rsplit('-', 1)[-1]
                benef.matricule_benef = '-'.join(
                    x for x in (societe, participant.matricule, fin) if x
                )
                benef.nom = patronyme
                benef.prenoms = prenom(benef.sexe)
                Anonyme._effacer_traces(benef)
                benef.save()

            participant.save()

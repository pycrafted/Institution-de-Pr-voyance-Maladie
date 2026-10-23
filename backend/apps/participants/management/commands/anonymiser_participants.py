"""
Anonymise les participants et leurs familles.

Remplace les **noms** et **prénoms** réels des participants et de leurs
bénéficiaires par des noms et prénoms **inventés**, sans rapport avec les vrais,
pour qu'aucune personne réelle ne soit identifiable depuis l'application.

Deux garanties :
  - **Prénoms inventés**, tirés au hasard selon le sexe, et **distincts au sein
    d'une même famille** (le participant et ses ayants droit n'ont jamais le
    même prénom) - « carrément différents » des vrais.
  - **Noms remappés de façon cohérente** : chaque ancien nom reçoit un nouveau
    nom (différent de l'ancien), le même partout. Les familles qui partageaient
    un nom le partagent donc toujours (enfants du père, conjoint, ascendant…),
    mais sous un nom nouveau.

Les vrais noms restent, au besoin, dans la base d'analyse ``lamps_analyse``.

    python manage.py anonymiser_participants
    python manage.py anonymiser_participants --seed 42   # reproductible
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction

from participants.models import Beneficiaire, Participant

# Prénoms sénégalais courants, par sexe.
PRENOMS_M = [
    'Mamadou', 'Ibrahima', 'Ousmane', 'Cheikh', 'Modou', 'Abdou', 'Moussa',
    'Samba', 'Alioune', 'Babacar', 'Lamine', 'Serigne', 'Pape', 'Amadou',
    'Malick', 'Assane', 'Birame', 'Mor', 'Demba', 'Souleymane', 'Elhadji',
    'Gorgui', 'Saliou', 'Thierno', 'Djibril', 'Mansour', 'Oumar', 'Khadim',
    'Massamba', 'Bassirou', 'Momar', 'Matar', 'Sidy', 'Daouda', 'Mactar',
    'Abdoulaye', 'Moustapha', 'Idrissa', 'Ndongo', 'Waly',
]
PRENOMS_F = [
    'Awa', 'Fatou', 'Aminata', 'Mariama', 'Ndeye', 'Khady', 'Aïssatou',
    'Rokhaya', 'Coumba', 'Astou', 'Bineta', 'Sokhna', 'Adama', 'Dior', 'Mame',
    'Oumou', 'Seynabou', 'Marieme', 'Nafissatou', 'Yacine', 'Soda', 'Penda',
    'Diarra', 'Maimouna', 'Rama', 'Nabou', 'Ramatoulaye', 'Oulimata', 'Daba',
    'Absa', 'Kiné', 'Thioro', 'Codou', 'Arame', 'Ngoné', 'Fatima', 'Yaye',
    'Nogaye', 'Ndioba', 'Adja',
]
# Noms de famille sénégalais courants.
NOMS = [
    'Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Diallo', 'Gueye', 'Sarr', 'Sy',
    'Mbaye', 'Faye', 'Cissé', 'Thiam', 'Niang', 'Sall', 'Kane', 'Diouf',
    'Seck', 'Camara', 'Dia', 'Ndoye', 'Wade', 'Dieng', 'Touré', 'Mbengue',
    'Samb', 'Diagne', 'Lo', 'Ndao', 'Gning', 'Sene', 'Kébé', 'Beye', 'Diatta',
    'Mané', 'Badji', 'Tine', 'Sagna', 'Ndour', 'Gaye',
]


class Command(BaseCommand):
    help = "Anonymise noms et prénoms des participants et de leurs familles."

    def add_arguments(self, parser):
        parser.add_argument(
            '--seed', type=int, default=None,
            help='Graine aléatoire, pour un résultat reproductible.',
        )
        parser.add_argument(
            '--matricules', action='store_true',
            help='Renumérote aussi les matricules, hors de la plage réelle.',
        )

    def handle(self, *args, **options):
        if options['seed'] is not None:
            random.seed(options['seed'])

        participants = list(Participant.objects.all())
        beneficiaires = list(Beneficiaire.objects.all())

        # 1) Mapping cohérent des noms : ancien → nouveau (différent), injectif.
        # Les noms s'écrivent en MAJUSCULES (convention de l'application) ; la
        # comparaison est insensible à la casse pour qu'un « SECK » ne devienne
        # pas « Seck » (le même nom).
        anciens = sorted(
            {p.nom for p in participants if p.nom}
            | {b.nom for b in beneficiaires if b.nom}
        )
        pool = [n.upper() for n in NOMS]
        random.shuffle(pool)
        nom_map = {}
        index = 0
        for ancien in anciens:
            while pool[index % len(pool)] == ancien.upper():
                index += 1
            nom_map[ancien] = pool[index % len(pool)]
            index += 1

        def nouveau_prenom(sexe, deja):
            """Un prénom du bon sexe, pas déjà pris dans la famille."""
            source = PRENOMS_F if str(sexe).upper().startswith('F') else PRENOMS_M
            libres = [p for p in source if p not in deja]
            return random.choice(libres or source)

        # 2) Bénéficiaires groupés par famille.
        familles = {}
        for b in beneficiaires:
            familles.setdefault(b.participant_id, []).append(b)

        with transaction.atomic():
            for participant in participants:
                deja = set()
                participant.prenoms = nouveau_prenom(participant.sexe, deja)
                deja.add(participant.prenoms)
                if participant.nom in nom_map:
                    participant.nom = nom_map[participant.nom]
                participant.save(update_fields=['prenoms', 'nom', 'modifie_le'])

                for benef in familles.get(participant.id, []):
                    benef.prenoms = nouveau_prenom(benef.sexe, deja)
                    deja.add(benef.prenoms)
                    if benef.nom in nom_map:
                        benef.nom = nom_map[benef.nom]
                    benef.save(update_fields=['prenoms', 'nom', 'modifie_le'])

        renumerotes = self._renumeroter(participants, familles) if options['matricules'] else 0

        self.stdout.write(
            self.style.SUCCESS(
                f'Anonymisation terminée : {len(participants)} participant(s) et '
                f'{len(beneficiaires)} bénéficiaire(s), {len(nom_map)} nom(s) remappé(s), '
                f'{renumerotes} matricule(s) renuméroté(s).'
            )
        )

    def _renumeroter(self, participants, familles):
        """
        Donne à chaque participant un matricule hors de la plage réelle, et
        refait ceux de sa famille dans la même forme.

        Un matricule est un identifiant direct : celui de la base de
        présentation était jusqu'ici un vrai, que les ressources humaines
        auraient rattaché à un nom en une requête. Les nouveaux partent de
        9001, où LAMPS n'en a aucun (les vrais vont de 0000 à 1059).

        Rien ne référence une fiche par son matricule - les documents pointent
        sur la fiche elle-même - donc la renumérotation ne casse aucun lien.
        """
        poses = 0
        with transaction.atomic():
            for rang, participant in enumerate(participants, start=1):
                nouveau = '%04d' % (9000 + rang)
                societe = participant.adherent.code if participant.adherent_id else ''
                for benef in familles.get(participant.id, []):
                    # « 02-0760-31 » : société, matricule, type + rang. Seul le
                    # matricule change ; le reste dit la place dans la famille.
                    fin = (benef.matricule_benef or '').rsplit('-', 1)[-1]
                    benef.matricule_benef = '-'.join(x for x in (societe, nouveau, fin) if x)
                    benef.save(update_fields=['matricule_benef', 'modifie_le'])
                    poses += 1
                participant.matricule = nouveau
                participant.save(update_fields=['matricule', 'modifie_le'])
                poses += 1
        return poses

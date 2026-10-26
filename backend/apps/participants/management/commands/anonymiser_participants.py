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
import unicodedata
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection, transaction

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

# Lieux de naissance et de résidence : des localités réelles du Sénégal, mais
# tirées au hasard - elles ne disent plus rien de la personne.
LIEUX = [
    'DAKAR', 'THIES', 'KAOLACK', 'SAINT-LOUIS', 'ZIGUINCHOR', 'DIOURBEL',
    'LOUGA', 'FATICK', 'KOLDA', 'TAMBACOUNDA', 'MBOUR', 'RUFISQUE', 'TOUBA',
    'MATAM', 'KEDOUGOU', 'SEDHIOU', 'KAFFRINE', 'PODOR', 'BIGNONA', 'TIVAOUANE',
]
QUARTIERS = [
    'PLATEAU', 'MEDINA', 'FANN', 'POINT E', 'MERMOZ', 'SACRE-COEUR', 'OUAKAM',
    'YOFF', 'ALMADIES', 'GRAND DAKAR', 'HLM', 'LIBERTE 6', 'DIEUPPEUL',
    'PIKINE', 'GUEDIAWAYE', 'PARCELLES ASSAINIES', 'THIAROYE', 'KEUR MASSAR',
    'NORD FOIRE', 'OUEST FOIRE', 'HANN', 'BEL-AIR', 'ZONE B', 'DERKLE',
]

# De combien la date de naissance se déplace, au plus. Assez pour qu'un
# recoupement sur la date exacte échoue, assez peu pour que l'âge - donc la
# limite d'âge des enfants et les tranches du barème - reste juste.
JOURS_DECALAGE = 45


class Command(BaseCommand):
    help = "Anonymise les participants et leurs familles (identité, dates, coordonnées)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--seed', type=int, default=None,
            help='Graine aléatoire, pour un résultat reproductible.',
        )
        parser.add_argument(
            '--matricules', action='store_true',
            help='Renumérote aussi les matricules, hors de la plage réelle.',
        )
        parser.add_argument(
            '--eviter-schema',
            help="Schéma LAMPS de la MÊME base d'où lire les identités réelles à éviter.",
        )
        parser.add_argument(
            '--eviter-base',
            help="Base d'analyse séparée d'où lire les identités réelles à éviter.",
        )

    def handle(self, *args, **options):
        if options['seed'] is not None:
            random.seed(options['seed'])

        # Déjà passée : tous les matricules sont hors de la plage réelle. On
        # ne recommence pas - une seconde passe renumétoterait tout le monde
        # et changerait les identifiants de connexion sans raison.
        if options['matricules'] and Participant.objects.exclude(matricule__gte='9000').count() == 0:
            if Participant.objects.exists():
                self.stdout.write('Déjà anonymisée (tous les matricules sont hors plage réelle).')
                return

        a_eviter = self._identites_reelles(options)
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

        def _poser(issue, nom_actuel):
            """nouveau_prenom rend un prénom, ou un couple (prénom, nom)."""
            if isinstance(issue, tuple):
                return issue[0], issue[1]
            return issue, nom_actuel

        def tel_mobile():
            return '%s %d %02d %02d' % (
                random.choice(['70', '75', '76', '77', '78']),
                random.randint(100, 999),
                random.randint(0, 99),
                random.randint(0, 99),
            )

        def nouveau_prenom(sexe, deja, nom):
            """
            Un prénom du bon sexe, pas déjà pris dans la famille, et qui ne
            reconstitue pas une personne réelle avec ce nom de famille.
            """
            source = PRENOMS_F if str(sexe).upper().startswith('F') else PRENOMS_M
            libres = [
                p for p in source
                if p not in deja and self.cle_identite(nom, p) not in a_eviter
            ]
            if libres:
                return random.choice(libres)
            # Ce nom de famille a épuisé les prénoms : on le change aussi.
            for autre in random.sample(NOMS, len(NOMS)):
                possibles = [
                    p for p in source
                    if p not in deja and self.cle_identite(autre, p) not in a_eviter
                ]
                if possibles:
                    return random.choice(possibles), autre
            return random.choice([p for p in source if p not in deja] or source)

        # 2) Bénéficiaires groupés par famille.
        familles = {}
        for b in beneficiaires:
            familles.setdefault(b.participant_id, []).append(b)

        champs_p = [
            'prenoms', 'nom', 'date_naissance', 'lieu_naissance', 'adresse',
            'mobile', 'email', 'numero_piece', 'photo', 'modifie_le',
        ]
        champs_b = [
            'prenoms', 'nom', 'date_naissance', 'lieu_naissance', 'adresse',
            'photo', 'modifie_le',
        ]
        with transaction.atomic():
            for participant in participants:
                deja = set()
                if participant.nom in nom_map:
                    participant.nom = nom_map[participant.nom]
                participant.prenoms, participant.nom = _poser(
                    nouveau_prenom(participant.sexe, deja, participant.nom), participant.nom
                )
                deja.add(participant.prenoms)
                self._effacer_traces(participant)
                # Un participant porte en plus ses coordonnées et sa pièce.
                participant.mobile = tel_mobile() if participant.mobile else ''
                participant.email = (
                    '%s.%s@exemple.sn'
                    % (participant.prenoms.lower(), participant.nom.lower())
                    if participant.email
                    else ''
                )
                participant.numero_piece = (
                    '%09d' % random.randint(0, 10**9 - 1) if participant.numero_piece else ''
                )
                participant.save(update_fields=champs_p)

                for benef in familles.get(participant.id, []):
                    if benef.nom in nom_map:
                        benef.nom = nom_map[benef.nom]
                    benef.prenoms, benef.nom = _poser(
                        nouveau_prenom(benef.sexe, deja, benef.nom), benef.nom
                    )
                    deja.add(benef.prenoms)
                    self._effacer_traces(benef)
                    benef.save(update_fields=champs_b)

        renumerotes = self._renumeroter(participants, familles) if options['matricules'] else 0

        self.stdout.write(
            self.style.SUCCESS(
                f'Anonymisation terminée : {len(participants)} participant(s) et '
                f'{len(beneficiaires)} bénéficiaire(s), {len(nom_map)} nom(s) remappé(s), '
                f'{renumerotes} matricule(s) renuméroté(s). '
                'Dates déplacées, lieux, adresses, coordonnées et pièces remplacés, '
                'photos retirées.'
            )
        )

    @staticmethod
    def cle_identite(nom, prenom):
        """
        « Aïssatou Diallo » et « AISSATOU DIALLO » sont la même personne. Sans
        cette normalisation, une comparaison laisse passer les identités
        accentuées - c'est arrivé, 36 d'un coup.
        """
        texte = unicodedata.normalize('NFD', f'{nom or ""} {prenom or ""}'.strip())
        return ''.join(c for c in texte if not unicodedata.combining(c)).upper()

    def _identites_reelles(self, options):
        """
        Les identités à ne surtout pas retomber dessus, lues dans LAMPS.

        Tirer un nom et un prénom au hasard dans les listes courantes finit
        par reconstituer une vraie personne : sur 675 fiches, c'est arrivé 36
        fois. Le risque n'est pas théorique - on attribuerait le parcours de
        soins d'une fiche anonymisée à quelqu'un qui porte vraiment ce nom.

        Sans option, aucune exclusion : la commande se comporte comme avant.
        """
        schema, base = options.get('eviter_schema'), options.get('eviter_base')
        if not schema and not base:
            return set()
        try:
            import psycopg
        except ImportError:  # pragma: no cover - dépend de l'environnement
            import psycopg2 as psycopg

        reglages = connection.get_connection_params()
        lien = {k: v for k, v in reglages.items() if k in ('host', 'port', 'user', 'password')}
        lien['dbname'] = base or reglages.get('dbname')
        if base:
            lien['user'] = lien.get('user') or 'ipm'
        prefixe = f'{schema}.' if schema else ''

        identites = set()
        with psycopg.connect(**lien) as cnx, cnx.cursor() as curseur:
            for table, colonne in ((f'{prefixe}participants', 'prenom'),
                                   (f'{prefixe}beneficiaires', 'prenoms')):
                curseur.execute(f'select nom, {colonne} from {table}')
                identites |= {self.cle_identite(n, p) for n, p in curseur.fetchall()}
        self.stdout.write(f'{len(identites)} identités réelles à éviter.')
        return identites

    @staticmethod
    def _effacer_traces(fiche):
        """
        Ce qui identifie une personne autant que son nom : sa date de
        naissance exacte, son lieu, son adresse - et sa photo, qui la désigne
        à elle seule.

        La date se DÉPLACE au lieu d'être effacée : l'âge reste juste, donc la
        limite d'âge des enfants et les tranches du barème continuent de
        tomber comme dans le réel, mais la date exacte ne permet plus de
        recouper avec un fichier du personnel.
        """
        if fiche.date_naissance:
            fiche.date_naissance += timedelta(
                days=random.randint(-JOURS_DECALAGE, JOURS_DECALAGE)
            )
        if fiche.lieu_naissance:
            fiche.lieu_naissance = random.choice(LIEUX)
        if fiche.adresse:
            fiche.adresse = '%s, %s' % (random.choice(QUARTIERS), random.choice(LIEUX))
        # Une photo ne s'anonymise pas : elle s'enlève.
        fiche.photo = ''

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

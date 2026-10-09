"""
Géolocalise les fournisseurs de soins qui n'ont pas encore de position.

    manage.py geolocaliser_structures              # simulation : ne change rien
    manage.py geolocaliser_structures --appliquer  # enregistre les positions sûres

La position sert au bouton « S'y rendre » de l'application mobile, qui guide
l'employé jusqu'à la structure. Une position fausse l'enverrait au mauvais
endroit, ce qui est pire que pas de position du tout : sans elle, le mobile
confie l'adresse écrite à la carte du téléphone, qui la cherche elle-même.

D'où deux preuves exigées avant d'écrire quoi que ce soit :
  1. la position est trouvée SOUS LE NOM de la structure (pas celle d'un
     quartier ou d'une rue), au Sénégal, et ce nom ressemble vraiment à celui
     de la fiche ;
  2. elle concorde avec l'ADRESSE écrite dans la fiche : à moins de 3,5 km du
     lieu que désigne cette adresse. Un même nom existe parfois deux fois
     (une « Pharmacie Mame Diarra » à Grand Yoff, une autre à 450 km).
Tout le reste est rapporté, jamais écrit - l'IPM le complète à la main dans
la fiche du fournisseur.

La source est le géocodeur d'OpenStreetMap (Nominatim), gratuit et sans clé.
Sa charte d'usage impose au plus une requête par seconde et un identifiant
d'application : les deux sont respectés ici.
"""

import json
import math
import time
import unicodedata
import urllib.parse
import urllib.request
from decimal import ROUND_HALF_UP, Decimal
from difflib import SequenceMatcher

from django.core.management.base import BaseCommand

from donnees_de_base.models import FournisseurDeSoins
from donnees_de_base.models.fournisseur_de_soins import CODE_FOURNISSEURS_DIVERS

URL = 'https://nominatim.openstreetmap.org/search'
# Identifiant d'application exigé par la charte de Nominatim : le nom de
# l'application, sans donnée personnelle.
AGENT = 'IPM-SAR-Mobile/1.0 (geolocalisation des structures conventionnees)'
PAUSE = 1.1  # secondes entre deux requêtes (charte : une par seconde au plus)

# Le Sénégal, large : une réponse hors de ce cadre est une homonymie lointaine.
SENEGAL = {'lat': (12.2, 16.8), 'lon': (-17.6, -11.3)}

# Mots trop génériques pour dire qu'un résultat désigne bien la structure :
# « Clinique du Cap » et « Clinique du Point E » partagent « clinique ».
GENERIQUES = {
    'pharmacie', 'clinique', 'cabinet', 'centre', 'hopital', 'laboratoire',
    'medical', 'medicale', 'sante', 'de', 'du', 'des', 'la', 'le', 'les', 'l',
    'd', 'et', 'dakar', 'senegal', 'analyses', 'biologie', 'dentaire',
    'imagerie', 'polyclinique',
}
# Écart toléré entre la position trouvée et le lieu que désigne l'adresse de la
# fiche : l'adresse ne se localise souvent qu'au quartier, pas à la porte.
ECART_MAX_KM = 3.5
# Sans adresse localisable, au moins la bonne ville : la presqu'île de Dakar
# (Rufisque, Mbao et Pikine compris) quand l'adresse la nomme.
VILLES = {
    ('DAKAR', 'RUFISQUE', 'MBAO', 'PIKINE', 'GUEDIAWAYE', 'YOFF'): {
        'lat': (14.60, 14.90), 'lon': (-17.56, -17.05),
    },
    ('THIES',): {'lat': (14.70, 14.88), 'lon': (-17.02, -16.84)},
}
SEUIL = 0.6  # ressemblance minimale des noms, une fois les mots génériques ôtés
SIX_DECIMALES = Decimal('0.000001')


def _net(texte):
    texte = unicodedata.normalize('NFD', texte or '')
    texte = ''.join(c for c in texte if unicodedata.category(c) != 'Mn').lower()
    for signe in "’'-,./()":
        texte = texte.replace(signe, ' ')
    return ' '.join(texte.split())


def _propre(texte):
    """Les mots qui distinguent la structure : « Madeleine », « Cap »…"""
    return ' '.join(m for m in _net(texte).split() if m not in GENERIQUES)


def ressemblance(nom_fiche, nom_trouve):
    a, b = _propre(nom_fiche), _propre(nom_trouve)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def chercher(requete):
    parametres = urllib.parse.urlencode(
        {'q': requete, 'format': 'json', 'limit': 3, 'countrycodes': 'sn', 'addressdetails': 0}
    )
    demande = urllib.request.Request(f'{URL}?{parametres}', headers={'User-Agent': AGENT})
    with urllib.request.urlopen(demande, timeout=20) as reponse:
        return json.loads(reponse.read().decode('utf-8'))


def distance_km(a, b):
    """Distance à vol d'oiseau entre deux résultats (formule de haversine)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (float(a['lat']), float(a['lon']), float(b['lat']), float(b['lon'])))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def dans_la_ville(resultat, adresse):
    """La ville que nomme l'adresse, si elle en nomme une connue ; sinon, vrai."""
    net = _net(adresse).upper()
    for noms, cadre in VILLES.items():
        if any(nom in net.split() for nom in noms):
            lat, lon = float(resultat['lat']), float(resultat['lon'])
            return cadre['lat'][0] <= lat <= cadre['lat'][1] and cadre['lon'][0] <= lon <= cadre['lon'][1]
    return True


def au_senegal(resultat):
    lat, lon = float(resultat['lat']), float(resultat['lon'])
    return SENEGAL['lat'][0] <= lat <= SENEGAL['lat'][1] and SENEGAL['lon'][0] <= lon <= SENEGAL['lon'][1]


class Command(BaseCommand):
    help = 'Géolocalise les fournisseurs de soins sans position (simulation par défaut).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--appliquer', action='store_true',
            help='Enregistre les positions sûres (sans cette option, rien n’est écrit).',
        )
        parser.add_argument(
            '--tous', action='store_true',
            help='Reprend aussi les fournisseurs qui ont déjà une position.',
        )

    def handle(self, *args, appliquer, tous, **options):
        fiches = FournisseurDeSoins.objects.filter(actif=True).exclude(code=CODE_FOURNISSEURS_DIVERS)
        if not tous:
            fiches = fiches.filter(latitude__isnull=True)
        fiches = list(fiches.order_by('code'))

        trouvees, douteuses, absentes = [], [], []
        for fiche in fiches:
            resultat, requete = self._localiser(fiche)
            if resultat is None:
                absentes.append(fiche)
                self.stdout.write(f'  --  {fiche.code} {fiche.libelle} : introuvable')
                continue
            score = ressemblance(fiche.libelle, resultat.get('name') or resultat['display_name'])
            ligne = (
                f'{fiche.code} {fiche.libelle} → {resultat["lat"]}, {resultat["lon"]} '
                f'« {resultat.get("name") or resultat["display_name"][:60]} » '
                f'(ressemblance {score:.2f}, requête « {requete} »)'
            )
            concorde, raison = self._concorde_avec_adresse(fiche, resultat) if score >= SEUIL else (False, 'nom différent')
            if concorde:
                trouvees.append((fiche, resultat))
                self.stdout.write(self.style.SUCCESS(f'  OK  {ligne} - {raison}'))
            else:
                douteuses.append((fiche, resultat))
                self.stdout.write(self.style.WARNING(f'  ??  {ligne} - {raison}'))

        if appliquer:
            for fiche, resultat in trouvees:
                fiche.latitude = Decimal(resultat['lat']).quantize(SIX_DECIMALES, ROUND_HALF_UP)
                fiche.longitude = Decimal(resultat['lon']).quantize(SIX_DECIMALES, ROUND_HALF_UP)
                fiche.save(update_fields=['latitude', 'longitude', 'modifie_le'])

        self.stdout.write('')
        self.stdout.write(
            f'{len(fiches)} fiches examinées : {len(trouvees)} localisées avec sûreté, '
            f'{len(douteuses)} douteuses (non écrites), {len(absentes)} introuvables (non écrites).'
        )
        self.stdout.write(
            'Positions ENREGISTRÉES.' if appliquer else 'Simulation : rien n’a été écrit (ajoutez --appliquer).'
        )

    def _concorde_avec_adresse(self, fiche, resultat):
        """
        La seconde preuve : la position trouvée tombe là où l'adresse de la
        fiche le dit. L'adresse est localisée à son tour ; si elle ne l'est
        pas, on exige au moins la bonne ville.
        """
        if not fiche.adresse:
            return True, 'sans adresse à comparer'
        time.sleep(PAUSE)
        try:
            lieux = [r for r in chercher(f'{fiche.adresse}, Sénégal') if au_senegal(r)]
        except OSError:
            lieux = []
        if lieux:
            ecart = distance_km(resultat, lieux[0])
            if ecart <= ECART_MAX_KM:
                return True, f'à {ecart:.1f} km de l’adresse de la fiche'
            return False, f'à {ecart:.1f} km de l’adresse de la fiche (« {fiche.adresse} »)'
        if dans_la_ville(resultat, fiche.adresse):
            return True, 'dans la ville de l’adresse (adresse elle-même introuvable)'
        return False, f'hors de la ville de l’adresse (« {fiche.adresse} »)'

    def _localiser(self, fiche):
        """
        Le nom seul d'abord, puis le nom et l'adresse : une adresse saisie
        approximativement (« Sacre Coeur 3 ») fait souvent échouer une
        recherche que le nom seul réussit. Jamais l'adresse seule : ce serait
        le centre d'un quartier, pas la porte de la structure.
        """
        requetes = [f'{fiche.libelle}, Sénégal']
        if fiche.adresse:
            requetes.append(f'{fiche.libelle}, {fiche.adresse}, Sénégal')
        # Faute de mieux, le premier résultat venu : il sera rapporté comme
        # douteux, jamais écrit.
        repli = None
        for requete in requetes:
            time.sleep(PAUSE)
            try:
                resultats = [r for r in chercher(requete) if au_senegal(r)]
            except OSError as erreur:
                self.stderr.write(f'  !!  {fiche.code} : service injoignable ({erreur})')
                return None, requete
            # Le premier résultat qui porte vraiment le nom de la structure.
            for resultat in resultats:
                nom = resultat.get('name') or resultat['display_name']
                if ressemblance(fiche.libelle, nom) >= SEUIL:
                    return resultat, requete
            if resultats and repli is None:
                repli = (resultats[0], requete)
        return repli if repli else (None, requetes[-1])

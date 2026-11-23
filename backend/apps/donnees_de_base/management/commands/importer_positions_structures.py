# -*- coding: utf-8 -*-
"""
Reprend les coordonnées RÉELLES des structures conventionnées depuis le
classeur Excel relevé par l'IPM.

    manage.py importer_positions_structures              # simulation
    manage.py importer_positions_structures --appliquer  # écrit

POURQUOI CETTE COMMANDE EXISTE
------------------------------
``importer_fournisseurs_soins`` reprend le champ ``coordgeo`` de LAMPS. Or ce
champ ne vaut rien : au 2026-11-20, les 376 fiches « positionnées » de la base
portaient **toutes la même position** (14.726840, -17.440989) - une seule
position distincte pour 376 structures. Sur la carte de l'application mobile,
les 376 points rouges se superposaient donc en un seul, à un endroit qui n'est
celui d'aucune structure.

Le classeur, lui, porte une position par structure, relevée une à une (fiche
Google Maps, adresse, ou repérage par les agents). C'est la seule source de
vérité pour ces coordonnées : ce que dit le classeur l'emporte sur la base.

CE QUI EST ÉCRIT
----------------
Pour chaque ligne appariée par son CODE : l'adresse, le téléphone et la
position. Une colonne vide dans le classeur n'efface PAS la valeur déjà en
base - sauf la position, cf. ci-dessous.

LA POSITION ABSENTE EST ÉCRITE COMME ABSENTE
--------------------------------------------
Les lignes marquées « Non trouvé » n'ont pas de coordonnées. On met alors
latitude et longitude à NULL, au lieu de laisser la fausse position héritée de
LAMPS. C'est la doctrine déjà posée par ``geolocaliser_structures`` : une
position fausse envoie l'employé au mauvais endroit, ce qui est pire que pas
de position du tout - sans elle, le mobile confie l'adresse écrite à la carte
du téléphone, qui la cherche elle-même.

LECTURE DU CLASSEUR
-------------------
Un ``.xlsx`` est une archive zip de fichiers XML : on la lit directement, sans
openpyxl, qui n'est pas dans les dépendances du projet.
"""

import zipfile
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree as ET

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from donnees_de_base.models import FournisseurDeSoins

CLASSEUR = r'C:\deploy\IPM\structures-conventionnees-coordonnees.xlsx'
FEUILLE = 'Structures'

NS = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
X = NS['x']

# Les colonnes attendues, et le champ du modèle qu'elles alimentent.
COLONNES = {
    'Code': 'code',
    'Adresse': 'adresse',
    'Téléphone': 'telephone',
    'Latitude': 'latitude',
    'Longitude': 'longitude',
}


def _indice_colonne(reference):
    """« BC12 » -> 54 (index 0) : la partie lettres est un nombre en base 26."""
    n = 0
    for caractere in reference:
        if not caractere.isalpha():
            break
        n = n * 26 + (ord(caractere.upper()) - 64)
    return n - 1


def lire_feuille(chemin, titre):
    """Rend (en-tête, lignes) de la feuille nommée, en texte brut."""
    try:
        archive = zipfile.ZipFile(chemin)
    except (OSError, zipfile.BadZipFile) as erreur:
        raise CommandError(f'Classeur illisible ({chemin}) : {erreur}') from erreur

    with archive:
        partages = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            racine = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            partages = [
                ''.join(t.text or '' for t in si.iter(f'{{{X}}}t'))
                for si in racine.findall('x:si', NS)
            ]

        classeur = ET.fromstring(archive.read('xl/workbook.xml'))
        titres = [f.get('name') for f in classeur.findall('.//x:sheet', NS)]
        if titre not in titres:
            raise CommandError(f'Feuille « {titre} » absente. Feuilles : {titres}')

        lignes = []
        chemin_feuille = f'xl/worksheets/sheet{titres.index(titre) + 1}.xml'
        for ligne in ET.fromstring(archive.read(chemin_feuille)).iter(f'{{{X}}}row'):
            cellules = {}
            for cellule in ligne.findall('x:c', NS):
                type_ = cellule.get('t')
                if type_ == 'inlineStr':
                    noeud = cellule.find('x:is', NS)
                    valeur = (
                        ''.join(t.text or '' for t in noeud.iter(f'{{{X}}}t'))
                        if noeud is not None else ''
                    )
                else:
                    noeud = cellule.find('x:v', NS)
                    valeur = noeud.text if noeud is not None else ''
                    if type_ == 's' and valeur:
                        valeur = partages[int(valeur)]
                cellules[_indice_colonne(cellule.get('r', 'A1'))] = (valeur or '').strip()
            largeur = max(cellules) + 1 if cellules else 0
            lignes.append([cellules.get(i, '') for i in range(largeur)])

    pleines = [l for l in lignes if any(l)]
    if not pleines:
        raise CommandError(f'Feuille « {titre} » vide.')
    return pleines[0], pleines[1:]


def _position(texte):
    """Rend une Decimal, ou None si la case est vide ou illisible."""
    if not texte:
        return None
    try:
        return Decimal(texte).quantize(Decimal('0.000001'))
    except (InvalidOperation, ValueError):
        return None


class Command(BaseCommand):
    help = 'Reprend les positions réelles des structures depuis le classeur Excel.'

    def add_arguments(self, parseur):
        parseur.add_argument('--fichier', default=CLASSEUR, help='Chemin du classeur .xlsx.')
        parseur.add_argument(
            '--appliquer', action='store_true',
            help='Écrit en base. Sans ce drapeau, la commande ne fait que rapporter.',
        )

    def handle(self, *args, **options):
        entete, lignes = lire_feuille(options['fichier'], FEUILLE)

        manquantes = [c for c in COLONNES if c not in entete]
        if manquantes:
            raise CommandError(
                f'Colonnes absentes du classeur : {manquantes}. En-tête lue : {entete}'
            )
        indices = {champ: entete.index(colonne) for colonne, champ in COLONNES.items()}

        def case(ligne, champ):
            i = indices[champ]
            return ligne[i] if i < len(ligne) else ''

        fiches = {f.code: f for f in FournisseurDeSoins.objects.all()}
        inconnus, modifiees = [], []
        compte = {'adresse': 0, 'telephone': 0, 'position': 0, 'position_effacee': 0}

        for ligne in lignes:
            code = case(ligne, 'code')
            if not code:
                continue
            fiche = fiches.get(code)
            if fiche is None:
                inconnus.append(code)
                continue

            changements = []

            adresse = case(ligne, 'adresse')
            if adresse and adresse != (fiche.adresse or '').strip():
                fiche.adresse = adresse
                changements.append('adresse')
                compte['adresse'] += 1

            telephone = case(ligne, 'telephone')
            if telephone and telephone != (fiche.telephone or '').strip():
                fiche.telephone = telephone
                changements.append('telephone')
                compte['telephone'] += 1

            latitude = _position(case(ligne, 'latitude'))
            longitude = _position(case(ligne, 'longitude'))
            if (latitude is None) != (longitude is None):
                # Une seule des deux : inexploitable, on n'écrit ni l'une ni l'autre.
                latitude = longitude = None
            if (latitude, longitude) != (fiche.latitude, fiche.longitude):
                fiche.latitude, fiche.longitude = latitude, longitude
                if latitude is None:
                    changements.append('position effacée')
                    compte['position_effacee'] += 1
                else:
                    changements.append('position')
                    compte['position'] += 1

            if changements:
                modifiees.append((fiche, changements))

        hors_classeur = sorted(set(fiches) - {case(l, 'code') for l in lignes})

        self.stdout.write(f'Classeur : {len(lignes)} lignes - Base : {len(fiches)} fiches')
        self.stdout.write(
            f'  adresses mises à jour   : {compte["adresse"]}\n'
            f'  téléphones mis à jour   : {compte["telephone"]}\n'
            f'  positions réelles posées: {compte["position"]}\n'
            f'  positions effacées      : {compte["position_effacee"]} '
            f'(« Non trouvé » : mieux vaut rien qu\'une fausse position)'
        )
        if inconnus:
            self.stdout.write(self.style.WARNING(
                f'  codes du classeur absents de la base : {len(inconnus)} -> {inconnus[:10]}'
            ))
        if hors_classeur:
            self.stdout.write(self.style.WARNING(
                f'  fiches de la base absentes du classeur : {len(hors_classeur)} '
                f'-> {hors_classeur[:10]} (laissées telles quelles)'
            ))

        if not options['appliquer']:
            self.stdout.write(self.style.WARNING(
                f'\nSIMULATION - {len(modifiees)} fiches seraient modifiées. '
                'Relancer avec --appliquer pour écrire.'
            ))
            return

        with transaction.atomic():
            for fiche, _ in modifiees:
                fiche.save(update_fields=['adresse', 'telephone', 'latitude', 'longitude'])

        distinctes = (
            FournisseurDeSoins.objects.filter(latitude__isnull=False)
            .values('latitude', 'longitude').distinct().count()
        )
        self.stdout.write(self.style.SUCCESS(
            f'\n{len(modifiees)} fiches mises à jour. '
            f'Positions distinctes en base : {distinctes}.'
        ))

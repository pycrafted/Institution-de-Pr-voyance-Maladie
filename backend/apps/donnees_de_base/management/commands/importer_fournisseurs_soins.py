"""
Reprise des fournisseurs de soins réels depuis le dump de l'application d'origine.

Lit ``lamps-fournisseurs.csv`` (export de la table ``fournisseurs`` de LAMPS,
encodé en latin-1) et crée ou met à jour chaque prestataire par son numéro. Les
champs sont repris à l'identique : coordonnées, banque, pièces, contact, dates
de convention et position géographique (``coordgeo`` → latitude/longitude, d'où
la carte de la fiche).

Idempotente : relancer la commande remet simplement les fiches à l'état du
fichier. Les numéros absents du fichier peuvent être retirés avec ``--purge``
(les fiches référencées ailleurs sont alors conservées, et signalées).

    python manage.py importer_fournisseurs_soins --fichier C:\\deploy\\lamps-fournisseurs.csv --purge
"""

import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.models.fournisseur_de_soins import (
    CODE_FOURNISSEURS_DIVERS,
    FournisseurDeSoins,
)
from donnees_de_base.models.specialite import Specialite

CHEMIN_DEFAUT = r'C:\deploy\lamps-fournisseurs.csv'


def _tronquer(valeur, longueur):
    return (valeur or '').strip()[:longueur]


def _date(brut):
    """« 2020-10-25 10:58:50.671301 » ou « 2020-10-25 » → date ; vide → None."""
    texte = (brut or '').strip()
    if not texte:
        return None
    texte = texte.split(' ')[0]
    try:
        return datetime.strptime(texte, '%Y-%m-%d').date()
    except ValueError:
        return None


def _coord(brut, borne):
    texte = (brut or '').strip().replace(',', '.')
    if not texte:
        return None
    try:
        valeur = Decimal(texte)
    except InvalidOperation:
        return None
    if not valeur.is_finite() or abs(valeur) > borne:
        return None
    return valeur.quantize(Decimal('0.000001'))


def _coordgeo(brut):
    """« 14.726840, -17.440989 » → (lat, lon). Le séparateur est la virgule."""
    texte = (brut or '').strip()
    if ',' not in texte:
        return None, None
    gauche, droite = texte.split(',', 1)
    return _coord(gauche, 90), _coord(droite, 180)


class Command(BaseCommand):
    help = "Importe les fournisseurs de soins réels depuis le CSV du dump LAMPS."

    def add_arguments(self, parser):
        parser.add_argument('--fichier', default=CHEMIN_DEFAUT)
        parser.add_argument(
            '--purge',
            action='store_true',
            help='Retire les fournisseurs dont le numéro est absent du fichier.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        with open(options['fichier'], encoding='latin-1', newline='') as flux:
            lignes = list(csv.DictReader(flux))

        specialites = {s.code: s for s in Specialite.objects.all()}
        crees = maj = sans_specialite = 0
        codes_vus = set()

        for ligne in lignes:
            numfourn = (ligne['numfourn'] or '').strip()
            if not numfourn:
                continue
            code = numfourn.zfill(4) if len(numfourn) <= 4 else numfourn
            codes_vus.add(code)

            codespe = (ligne['codespe'] or '').strip().zfill(2)
            specialite = specialites.get(codespe)
            if specialite is None:
                sans_specialite += 1
            compte = (ligne['compte'] or '').strip() or (f'4000{codespe}' if codespe else '')
            lat, lon = _coordgeo(ligne['coordgeo'])

            defauts = {
                'libelle': _tronquer(ligne['raisoc'], 255),
                'specialite': specialite,
                'compte': _tronquer(compte, 6),
                'adresse': _tronquer(ligne['adresse'], 255),
                'telephone': _tronquer(ligne['telfix'], 30),
                'mobile': _tronquer(ligne['portable'], 30),
                'email': _tronquer(ligne['email'], 254),
                'fax': _tronquer(ligne['fax'], 30),
                'bp': _tronquer(ligne['bp'], 50),
                'region': _tronquer(ligne['region'], 100),
                'pays': _tronquer(ligne['pays'], 100),
                'site_web': _tronquer(ligne['siteweb'], 255),
                'date_debut': _date(ligne['datedebspe']),
                'date_debut_convention': _date(ligne['datedebconv']),
                'date_fin_convention': _date(ligne['datefinconv']),
                'banque_nom': _tronquer(ligne['banque'], 100),
                'banque_code': _tronquer(ligne['codebque'], 5),
                'guichet_code': _tronquer(ligne['codeagence'], 5),
                'compte_bancaire': _tronquer(ligne['cptebque'], 34),
                'cle_rib': _tronquer(ligne['clerib'], 2),
                'contact_nom': _tronquer(ligne['contact_nom'], 100),
                'contact_prenoms': _tronquer(ligne['contact_prenom'], 100),
                'contact_fonction': _tronquer(ligne['contact_fonction'], 100),
                'contact_mobile': _tronquer(ligne['contact_portable'], 30),
                'latitude': lat,
                'longitude': lon,
                # statut/agree valent « A » pour toutes les lignes réelles.
                'actif': True,
            }

            _, cree = FournisseurDeSoins.objects.update_or_create(code=code, defaults=defauts)
            crees += 1 if cree else 0
            maj += 0 if cree else 1

        purges = proteges = 0
        if options['purge']:
            a_retirer = FournisseurDeSoins.objects.exclude(code__in=codes_vus).exclude(
                code=CODE_FOURNISSEURS_DIVERS
            )
            for fiche in a_retirer:
                try:
                    with transaction.atomic():
                        fiche.delete()
                    purges += 1
                except Exception:  # noqa: BLE001 - fiche référencée ailleurs : on la garde.
                    proteges += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Fournisseurs importés : {crees} créés, {maj} mis à jour '
                f'({sans_specialite} sans spécialité reconnue). '
                f'Purge : {purges} retirés, {proteges} conservés (référencés).'
            )
        )

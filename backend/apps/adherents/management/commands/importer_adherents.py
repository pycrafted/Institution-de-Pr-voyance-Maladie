"""
Reprise des valeurs réelles des adhérents depuis le dump de l'application
d'origine.

Dans LAMPS, les adhérents sont une vue sur la table ``plancompta`` (comptes
``463xxx``). On lit donc les quatre lignes ``463xxx`` du CSV du plan comptable
(encodé en latin-1) et on reporte leurs valeurs sur nos adhérents, par leur
numéro : cotisations, seuils, régime, adresse, téléphone, point focal, état.

Certaines fiches de l'original portent des valeurs de remplissage (une adresse
« xxxxxxxx », un numéro « 333333333 », un e-mail « test@email.com ») : ces
champs-là ne sont pas recopiés - on laisse le champ vide plutôt que d'importer
du bruit. Les vraies informations, elles, sont reprises à l'identique.

    python manage.py importer_adherents --fichier C:\\deploy\\lamps-plancompta.csv
"""

import csv

from django.core.management.base import BaseCommand
from django.db import transaction

from adherents.models import Adherent

CHEMIN_DEFAUT = r'C:\deploy\lamps-plancompta.csv'


def _factice(valeur):
    """Valeur de remplissage de l'original : « xxxx », « 333333333 », « test@… »."""
    texte = (valeur or '').strip()
    if not texte:
        return True
    bas = texte.lower()
    if 'test@' in bas:
        return True
    alnum = [c for c in texte if c.isalnum()]
    # Un seul caractère répété (xxxxxx, 3333333, XXXX) : pas une vraie donnée.
    return bool(alnum) and len({c.lower() for c in alnum}) == 1


def _texte(valeur):
    return '' if _factice(valeur) else (valeur or '').strip()


def _montant(valeur):
    """Montant tel que l'écran le manipule : du texte ; « 0 » reste « 0 »."""
    return (valeur or '').strip()


def _telephone(valeur):
    """Numéro local du dump (« 338490201 ») → « +221 33 849 02 01 »."""
    brut = _texte(valeur)
    chiffres = ''.join(c for c in brut if c.isdigit())
    if len(chiffres) == 9 and chiffres[0] in '73':
        g = f'{chiffres[0:2]} {chiffres[2:5]} {chiffres[5:7]} {chiffres[7:9]}'
        return f'+221 {g}'
    return brut


class Command(BaseCommand):
    help = "Reprend les valeurs réelles des adhérents depuis le CSV du plan comptable LAMPS."

    def add_arguments(self, parser):
        parser.add_argument('--fichier', default=CHEMIN_DEFAUT)

    @transaction.atomic
    def handle(self, *args, **options):
        with open(options['fichier'], encoding='latin-1', newline='') as flux:
            lignes = [
                x
                for x in csv.DictReader(flux)
                if str(x.get('souscpte', '')).startswith('463')
                and len(str(x.get('compte', '')).strip()) > 3
            ]

        maj = absents = 0
        for ligne in lignes:
            code = (ligne['codeadht'] or '').strip().zfill(2)
            adherent = Adherent.objects.filter(code=code).first()
            if adherent is None:
                absents += 1
                continue

            adherent.type = (ligne['type_soc'] or '').strip() or adherent.type
            adherent.adresse = _texte(ligne['adr'])
            adherent.telephone = _telephone(ligne['tel_fixe'])
            adherent.regul_systematique = (ligne['regul_system'] or '').strip().lower() in ('t', 'true', '1')
            adherent.cotisation_mss = _montant(ligne['montant_cotis_mut'])
            adherent.cotisation_ipm_salariale = _montant(ligne['montant_cotis_sal'])
            adherent.cotisation_ipm_patronale = _montant(ligne['montant_cotis_pat'])
            adherent.seuil_consommation = _montant(ligne['seuil_conso'])
            adherent.seuil_endettement = _montant(ligne['seuil_endet'])
            adherent.focal_nom = _texte(ligne['contact'])
            adherent.focal_telephone = _telephone(ligne['tel_contact'])
            adherent.focal_email = _texte(ligne['email'])
            # Un adhérent suspendu dans l'original l'est aussi chez nous.
            adherent.actif = (ligne['suspension_adht'] or '').strip().lower() not in ('t', 'true', '1')
            adherent.save()
            maj += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Adhérents mis à jour : {maj} ({absents} code(s) du dump absent(s) en base).'
            )
        )

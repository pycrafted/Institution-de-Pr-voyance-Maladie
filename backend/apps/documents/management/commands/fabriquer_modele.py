"""
Fabrique un modèle PDF à partir d'un bon ORIGINAL fourni par l'IPM.

Un « original » est un vrai document sorti de l'application d'origine : il
porte l'en-tête SAR, le cachet du gérant… et les valeurs d'un dossier réel.
Le modèle, lui, doit être le même document VIDE.

On en retire donc les valeurs. On les **efface** (redaction) plutôt que de les
recouvrir : un rectangle posé par-dessus laisse le texte dans le fichier, où
n'importe quel lecteur le retrouve - ce serait une fuite de données
nominatives sur chaque bon imprimé.

Les zones à effacer ne sont pas écrites ici : ce sont exactement celles que le
code d'impression repeint déjà (``A_COUVRIR``), puisque par construction ce
sont les cadres dont la valeur change.

    python manage.py fabriquer_modele optique "bon-original/xxx.pdf"
    python manage.py fabriquer_modele lettre  "bon-original/yyy.pdf"

La commande sauvegarde le modèle précédent, écrit le nouveau, et dit ce qu'il
reste de texte - l'occasion de vérifier qu'il ne subsiste que des intitulés.
"""

from datetime import datetime
from pathlib import Path
from shutil import copy2

import pymupdf
from django.core.management.base import BaseCommand, CommandError

from ...impression_lettre import A_COUVRIR as ZONES_LETTRE
from ...impression_optique import A_COUVRIR as ZONES_OPTIQUE
from ...modeles import DOSSIER_MODELES

DOCUMENTS = {
    'optique': ('bon_optique.pdf', ZONES_OPTIQUE),
    'lettre': ('lettre_garantie.pdf', ZONES_LETTRE),
}


class Command(BaseCommand):
    help = "Fabrique un modèle PDF vide à partir d'un bon original rempli."

    def add_arguments(self, parser):
        parser.add_argument('document', choices=sorted(DOCUMENTS))
        parser.add_argument('original', help='le PDF original fourni par l’IPM')

    def handle(self, *args, **options):
        nom, zones = DOCUMENTS[options['document']]
        source = Path(options['original'])
        if not source.is_file():
            raise CommandError(f'original introuvable : {source}')

        cible = DOSSIER_MODELES / nom
        if cible.is_file():
            horodatage = datetime.now().strftime('%Y%m%d-%H%M%S')
            sauvegarde = DOSSIER_MODELES.parent / f'modeles-avant-{horodatage}'
            sauvegarde.mkdir(parents=True, exist_ok=True)
            copy2(cible, sauvegarde / nom)
            self.stdout.write(f'ancien modèle sauvegardé dans {sauvegarde}')

        doc = pymupdf.open(source)
        for page in doc:
            for rect, _fond in zones:
                # Sans remplissage : peindre, même de la bonne couleur, recouvre
                # aussi la bordure du cadre dès que le rectangle la mord d'un
                # demi-point - les cadres des montants y perdent leurs traits.
                page.add_redact_annot(pymupdf.Rect(rect), fill=False)
            # Le texte seulement : l'en-tête SAR et le cachet (des images) et
            # les cadres eux-mêmes (des tracés) restent intacts.
            page.apply_redactions(
                images=pymupdf.PDF_REDACT_IMAGE_NONE,
                graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
            )
        doc.save(cible, garbage=4, deflate=True, clean=True)
        restant = ' '.join(page.get_text() for page in doc)
        doc.close()

        self.stdout.write(self.style.SUCCESS(f'{cible} écrit'))
        self.stdout.write('')
        self.stdout.write('Texte restant - il ne doit y avoir QUE des intitulés fixes :')
        for ligne in sorted({ligne.strip() for ligne in restant.splitlines() if ligne.strip()}):
            self.stdout.write(f'  {ligne}')

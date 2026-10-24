"""
Bon de pharmacie imprimé, au modèle de l'application d'origine.

Le PDF de l'origine (modeles/bon_pharmacie.pdf : l'original, puis la copie
destinée au fournisseur) sert de fond tel quel - logo, cadres, mentions,
cachet. Seules ses valeurs, celles du bon qui a servi de modèle, sont effacées
puis réécrites avec celles du bon demandé : même place, même police, même
taille. Les cadres qu'il laissait vides (prescripteur, ordonnance,
fournisseur) sont remplis quand le bon les porte ; le tableau des médicaments
et le montant total restent à la main du pharmacien, comme à l'origine.

Coordonnées en points PDF, relevées sur le modèle ; identiques sur les deux
pages.
"""

from pathlib import Path

import pymupdf
from django.utils import timezone

from .modeles import modele

MODELE = modele('bon_pharmacie.pdf')

# Polices du modèle :
#   - Times : la Times-Roman intégrée aux PDF, de mêmes dimensions que la Times
#     New Roman du modèle. La Times New Roman de Windows coderait les espaces
#     en insécables et les tirets en tirets conditionnels : le bon se lirait
#     juste, mais « 01-1303 » ne s'y copierait ni ne s'y chercherait ;
#   - Arial Black, pour l'en-tête : celle de Windows ; à défaut, Helvetica gras.
ARIAL_BLACK = r'C:\Windows\Fonts\ariblk.ttf'

# Valeurs du bon modèle, effacées avant réécriture (boîtes de leurs textes).
A_EFFACER = [
    (108.0, 33.9, 291.8, 44.9),  # société, en-tête
    (461.0, 29.9, 497.4, 37.9),  # créé le
    (444.6, 44.9, 507.4, 52.9),  # créé par
    (461.0, 64.9, 523.2, 72.9),  # édité le
    (444.6, 83.9, 488.5, 91.9),  # édité par
    (489.2, 119.4, 543.8, 131.4),  # numéro du bon
    (123.0, 183.4, 244.0, 195.4),  # participant
    (123.0, 207.6, 153.0, 216.6),  # matricule
    (274.0, 206.8, 430.0, 217.8),  # société, cadre du matricule
    (123.0, 231.6, 168.0, 240.6),  # bénéficiaire
    (374.8, 231.6, 433.2, 240.6),  # type de bénéficiaire
    (497.5, 231.2, 507.5, 241.2),  # âge
]


# Signes typographiques absents du codage de la police intégrée : sans cette
# table, « L’INDEPENDANCE » s'imprimerait « L·INDEPENDANCE ».
TYPOGRAPHIE = str.maketrans({
    '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '-': '-', '…': '...',
})


def _nommer(doc, titre):
    """
    Titre du document dans le lecteur PDF : son numéro. Sans cela, il
    garderait celui du modèle d'origine (« WebLAMPS - SAR ») et le nom de qui
    l'avait imprimé.
    """
    maintenant = pymupdf.get_pdf_now()
    doc.set_metadata({
        'title': titre, 'author': 'IPM SAR', 'subject': titre, 'keywords': '',
        'creator': 'IPM', 'producer': 'IPM', 'creationDate': maintenant, 'modDate': maintenant,
    })


def _fr(jour):
    return jour.strftime('%d/%m/%Y') if jour else ''


def _age(naissance, au):
    if not naissance or not au:
        return ''
    return str(au.year - naissance.year - ((au.month, au.day) < (naissance.month, naissance.day)))


def _valeurs(bon, edite_par):
    """
    Ce que le bon imprime, champ par champ. ``edite_par`` : qui l'imprime, tel
    qu'il s'écrit après « par : » - l'identifiant de l'utilisateur IPM, ou le
    matricule du participant quand il l'imprime depuis l'application mobile.
    """
    participant = bon.participant
    beneficiaire = bon.beneficiaire
    societe = bon.adherent.libelle.upper() if bon.adherent_id else ''
    personne = beneficiaire or participant
    pharmacie = bon.pharmacie
    prescripteur = bon.prescripteur
    return {
        'societe': societe,
        'cree_le': _fr(bon.date),
        'cree_par': f'par : {bon.cree_par.username}' if bon.cree_par_id else 'par :',
        'edite_le': timezone.localtime().strftime('%d/%m/%Y à %H:%M'),
        'edite_par': f'par : {edite_par}',
        'code': bon.code,
        'participant': participant.nom_complet.upper() if participant else '',
        'matricule': (
            f'{bon.adherent.code}-{participant.matricule}'
            if participant and bon.adherent_id
            else (participant.matricule if participant else '')
        ),
        # Le participant bénéficiaire de ses propres soins : « LUI-MÊME ».
        'beneficiaire': beneficiaire.nom_complet.upper() if beneficiaire else 'LUI-MÊME',
        'type': bon.type_benef.libelle if bon.type_benef_id else '',
        'age': _age(personne.date_naissance if personne else None, bon.date),
        'prescripteur_code': prescripteur.code if prescripteur else '',
        'prescripteur': prescripteur.libelle.upper() if prescripteur else '',
        'nb_articles': str(bon.nb_articles) if bon.nb_articles else '',
        'date_ordonnance': _fr(bon.date_ordonnance),
        'fournisseur_code': pharmacie.code if pharmacie else '',
        'fournisseur': pharmacie.libelle.upper() if pharmacie else '',
        'adresse': pharmacie.adresse if pharmacie else '',
        'tel': (pharmacie.telephone or pharmacie.mobile) if pharmacie else '',
    }


# Où écrire : (champ, police, taille, x, ligne de base, alignement, largeur).
# « centre » : x est le milieu du cadre ; la largeur borne le texte, qui
# rapetisse s'il ne tient pas.
EMPLACEMENTS = [
    ('societe', 'arb', 11, 108.0, 42.35, 'gauche', 300),
    ('cree_le', 'tnr', 8, 461.0, 36.04, 'gauche', 110),
    ('cree_par', 'tnr', 8, 444.58, 51.04, 'gauche', 125),
    ('edite_le', 'tnr', 8, 461.0, 71.04, 'gauche', 110),
    ('edite_par', 'tnr', 8, 444.58, 90.04, 'gauche', 125),
    ('code', 'tnr', 12, 516.5, 128.56, 'centre', 106),
    ('participant', 'tnr', 12, 123.0, 192.56, 'gauche', 292),
    ('matricule', 'tnr', 9, 123.0, 214.42, 'gauche', 90),
    ('societe', 'tnr', 11, 352.0, 215.18, 'centre', 264),
    ('beneficiaire', 'tnr', 9, 123.0, 238.42, 'gauche', 230),
    ('type', 'tnr', 9, 404.2, 238.42, 'centre', 90),
    ('age', 'tnr', 10, 502.4, 238.8, 'centre', 20),
    ('prescripteur_code', 'tnr', 9, 120.5, 262.42, 'gauche', 55),
    ('prescripteur', 'tnr', 9, 183.3, 262.42, 'gauche', 250),
    ('nb_articles', 'tnr', 9, 131.3, 284.42, 'centre', 26),
    ('date_ordonnance', 'tnr', 9, 269.1, 284.42, 'gauche', 102),
    ('fournisseur_code', 'tnr', 9, 70.8, 341.4, 'gauche', 52),
    ('fournisseur', 'tnr', 9, 130.0, 341.4, 'gauche', 332),
    ('adresse', 'tnr', 9, 130.0, 363.42, 'gauche', 332),
    ('tel', 'tnr', 9, 480.5, 363.42, 'gauche', 82),
]


def _polices(page):
    """Polices de la page : nom à employer, et de quoi mesurer le texte."""
    polices = {'tnr': ('tiro', pymupdf.Font('tiro'))}
    if Path(ARIAL_BLACK).exists():
        page.insert_font(fontname='arb', fontfile=ARIAL_BLACK)
        polices['arb'] = ('arb', pymupdf.Font(fontfile=ARIAL_BLACK))
    else:
        polices['arb'] = ('hebo', pymupdf.Font('hebo'))
    return polices


def bon_pharmacie_pdf(bon, edite_par):
    """Le bon imprimé (original et copie), en octets PDF."""
    valeurs = _valeurs(bon, edite_par)
    doc = pymupdf.open(MODELE)
    for page in doc:
        # 1. Effacer les valeurs du modèle, sans rien peindre par-dessus et sans
        #    toucher aux cadres, aux fonds colorés ni aux images.
        for rect in A_EFFACER:
            page.add_redact_annot(pymupdf.Rect(rect), fill=False)
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
        )

        # 2. Réécrire celles du bon, à la même place.
        polices = _polices(page)
        for champ, police, taille, x, y, alignement, largeur in EMPLACEMENTS:
            texte = valeurs[champ].translate(TYPOGRAPHIE)
            if not texte:
                continue
            nom_police, mesure = polices[police]
            # Un nom trop long pour son cadre rapetisse plutôt que de déborder.
            while taille > 6 and mesure.text_length(texte, fontsize=taille) > largeur:
                taille -= 0.5
            if alignement == 'centre':
                x -= mesure.text_length(texte, fontsize=taille) / 2
            page.insert_text((x, y), texte, fontname=nom_police, fontsize=taille, color=(0, 0, 0))
    _nommer(doc, bon.code)
    contenu = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return contenu

"""
Lettre de garantie imprimée, au modèle de l'application d'origine.

Même principe que le bon de pharmacie (cf. impression.py) : le PDF de l'origine
(modeles/lettre_garantie.pdf : l'original, puis la copie destinée au
fournisseur) sert de fond, et seules ses valeurs changent. Mais ce modèle-ci a
été imprimé par « Microsoft Print To PDF » : il ne contient aucun texte, ses
lettres sont dessinées. Les valeurs ne peuvent donc pas être effacées comme
du texte : l'intérieur de chaque cadre est repeint de son propre fond, sans
toucher à ses bordures, puis la valeur de la lettre y est écrite.

Coordonnées en points PDF, relevées sur les tracés du modèle ; identiques sur
les deux pages. Le tableau des actes, la remise et le montant total restent
vides, comme à l'origine.
"""

import pymupdf
from django.utils import timezone

from .modeles import modele
from .impression import TYPOGRAPHIE, _age, _fr, _nommer, _polices

MODELE = modele('lettre_garantie.pdf')

BLANC = (1, 1, 1)
GRIS_CLAIR = (0.96, 0.96, 0.96)
GRIS = (0.85, 0.85, 0.85)

# Intérieur des cadres dont la valeur change, et leur fond.
A_COUVRIR = [
    ((105.0, 31.0, 305.0, 45.2), BLANC),  # société, en-tête
    ((429.0, 28.0, 566.0, 39.5), BLANC),  # créé le
    ((442.0, 43.2, 566.0, 54.0), BLANC),  # créé par
    ((429.0, 63.0, 566.0, 74.5), BLANC),  # édité le
    ((442.0, 82.3, 566.0, 93.5), BLANC),  # édité par
    ((490.9, 107.4, 563.2, 125.8), GRIS),  # numéro de la lettre
    ((118.3, 173.4, 417.8, 187.9), BLANC),  # participant
    ((118.3, 196.5, 216.5, 210.9), BLANC),  # matricule
    ((218.3, 196.5, 487.0, 210.9), GRIS_CLAIR),  # société, cadre du matricule
    ((118.3, 220.5, 355.8, 234.9), BLANC),  # bénéficiaire
    ((357.6, 220.5, 452.0, 234.9), BLANC),  # type de bénéficiaire
    ((492.8, 220.5, 514.1, 234.9), BLANC),  # âge
    ((118.3, 242.5, 178.6, 257.0), BLANC),  # prescripteur, code
    ((180.4, 242.5, 453.0, 257.0), BLANC),  # prescripteur
    ((298.6, 261.6, 406.9, 276.0), BLANC),  # date de prescription
    ((183.4, 286.6, 471.1, 301.0), BLANC),  # nature de la prestation
    ((68.1, 327.7, 125.4, 342.1), BLANC),  # prestataire, code
    ((131.2, 327.6, 470.0, 342.0), GRIS_CLAIR),  # prestataire
    ((131.2, 348.7, 471.1, 363.1), BLANC),  # adresse
    ((476.8, 348.7, 568.2, 363.1), BLANC),  # téléphone
]

# Où écrire : (champ, police, taille, x, ligne de base, alignement, largeur).
EMPLACEMENTS = [
    ('societe', 'arb', 11, 108.0, 42.35, 'gauche', 195),
    ('cree_le_libelle', 'tnr', 8, 431.9, 36.04, 'gauche', 30),
    ('cree_le', 'tnr', 8, 461.0, 36.04, 'gauche', 100),
    ('cree_par', 'tnr', 8, 444.58, 51.04, 'gauche', 118),
    ('edite_le_libelle', 'tnr', 8, 431.5, 71.04, 'gauche', 30),
    ('edite_le', 'tnr', 8, 461.0, 71.04, 'gauche', 100),
    ('edite_par', 'tnr', 8, 444.58, 90.04, 'gauche', 118),
    ('code', 'tnr', 11, 527.05, 121.2, 'centre', 70),
    # Participant, société et prestataire : en gras dans le modèle.
    ('participant', 'tnrg', 12, 121.7, 184.6, 'gauche', 293),
    ('matricule', 'tnr', 9, 121.7, 207.3, 'gauche', 92),
    ('societe', 'tnrg', 11, 352.6, 207.9, 'centre', 264),
    ('beneficiaire', 'tnr', 9, 122.5, 231.3, 'gauche', 230),
    ('type', 'tnr', 9, 404.8, 231.3, 'centre', 90),
    ('age', 'tnr', 10, 503.4, 231.6, 'centre', 20),
    ('prescripteur_code', 'tnr', 9, 148.4, 253.3, 'centre', 58),
    ('prescripteur', 'tnr', 9, 184.6, 253.3, 'gauche', 265),
    ('date_prescription', 'tnr', 9, 301.7, 272.4, 'gauche', 102),
    ('nature', 'arb', 8.5, 327.25, 297.2, 'centre', 284),
    ('prestataire_code', 'tnr', 9, 96.75, 338.4, 'centre', 54),
    ('prestataire', 'tnrg', 12, 300.6, 338.9, 'centre', 334),
    ('adresse', 'tnr', 9, 135.0, 359.4, 'gauche', 332),
    ('tel', 'tnr', 9, 522.5, 359.4, 'centre', 88),
]


def _valeurs(lettre, edite_par):
    """Ce que la lettre imprime, champ par champ."""
    participant = lettre.participant
    beneficiaire = lettre.beneficiaire
    personne = beneficiaire or participant
    prestataire = lettre.prestataire
    prescripteur = lettre.prescripteur
    return {
        'societe': lettre.adherent.libelle.upper() if lettre.adherent_id else '',
        'cree_le_libelle': 'Crée le :',
        'cree_le': _fr(lettre.date),
        'cree_par': f'par : {lettre.cree_par.username}' if lettre.cree_par_id else 'par :',
        'edite_le_libelle': 'édité le :',
        'edite_le': timezone.localtime().strftime('%d/%m/%Y à %H:%M'),
        'edite_par': f'par : {edite_par}',
        'code': lettre.code,
        'participant': participant.nom_complet.upper() if participant else '',
        'matricule': (
            f'{lettre.adherent.code}-{participant.matricule}'
            if participant and lettre.adherent_id
            else (participant.matricule if participant else '')
        ),
        'beneficiaire': beneficiaire.nom_complet.upper() if beneficiaire else 'LUI-MÊME',
        'type': lettre.type_benef.libelle if lettre.type_benef_id else '',
        'age': _age(personne.date_naissance if personne else None, lettre.date),
        'prescripteur_code': prescripteur.code if prescripteur else '',
        'prescripteur': prescripteur.libelle.upper() if prescripteur else '',
        'date_prescription': _fr(lettre.date_prescription),
        'nature': lettre.nature_prestation.libelle.upper() if lettre.nature_prestation_id else '',
        'prestataire_code': prestataire.code if prestataire else '',
        'prestataire': prestataire.libelle.upper() if prestataire else '',
        'adresse': prestataire.adresse if prestataire else '',
        'tel': (prestataire.telephone or prestataire.mobile) if prestataire else '',
    }


def lettre_garantie_pdf(lettre, edite_par):
    """
    La lettre imprimée (original et copie), en octets PDF. ``edite_par`` :
    qui l'imprime - l'identifiant de l'utilisateur IPM, ou le matricule du
    participant quand c'est lui qui l'ouvre sur son téléphone.
    """
    valeurs = _valeurs(lettre, edite_par)
    doc = pymupdf.open(MODELE)
    for page in doc:
        # 1. Repeindre l'intérieur des cadres de leur fond : les valeurs du
        #    modèle disparaissent, les bordures restent.
        for rect, fond in A_COUVRIR:
            page.draw_rect(pymupdf.Rect(rect), color=None, fill=fond, width=0, overlay=True)

        # 2. Écrire celles de la lettre, à la même place.
        polices = {**_polices(page), 'tnrg': ('tibo', pymupdf.Font('tibo'))}
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
    _nommer(doc, lettre.code)
    contenu = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return contenu

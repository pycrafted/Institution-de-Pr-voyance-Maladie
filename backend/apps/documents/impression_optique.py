"""
Bon de commande optique imprimé, au modèle de l'application d'origine.

Même principe que la lettre de garantie (cf. impression_lettre.py) : le PDF de
l'origine (modeles/bon_optique.pdf : l'original, puis la copie destinée au
fournisseur) sert de fond, et seules ses valeurs changent. L'intérieur de
chaque cadre est repeint de son propre fond, sans toucher à ses bordures, puis
la valeur du bon y est écrite.

**Le modèle est en COULEUR depuis le 2026-11-25.** C'était jusque-là un tirage
en noir et blanc passé par « Microsoft Print To PDF » - rien que des images,
pas une lettre de texte. L'IPM a fourni le bon original en couleur : le logo
SAR est rouge, deux cadres sont bleutés, le cachet du gérant est bleu. Le
modèle en est tiré en EFFAÇANT les valeurs du bon d'exemple (vraies personnes)
plutôt qu'en les recouvrant - un rectangle posé par-dessus laisse le texte
dans le fichier.

Coordonnées en points PDF, relevées sur les tracés du modèle ; identiques sur
les deux pages. Polices et tailles étalonnées sur les lettres du modèle :
Times pour les valeurs, Arial Black pour la société et le fournisseur.
"""

import pymupdf
from django.utils import timezone

from .modeles import modele, ouvrir_modele
from .photo_bon import poser_photo
from .impression import TYPOGRAPHIE, _age, _fr, _nommer, _polices

MODELE = modele('bon_optique.pdf')

BLANC = (1, 1, 1)
# Le fond des deux cadres teintés, relevé sur le bon original en couleur
# fourni par l'IPM le 2026-11-25 : le cadre du numéro est d'un bleu soutenu,
# celui de la société (à droite du matricule) d'un bleu pâle.
#
# Ils étaient gris (0,85 et 0,96) : le modèle d'avant était un tirage en NOIR
# ET BLANC, et ces gris en étaient la trace. Repeints en gris sur le modèle en
# couleur, les deux cadres auraient fait une tache.
BLEU = (0.749, 0.878, 1.0)
BLEU_PALE = (0.941, 0.973, 1.0)

# Intérieur des cadres dont la valeur change, et leur fond.
A_COUVRIR = [
    ((105.0, 32.0, 340.0, 45.4), BLANC),  # société, en-tête
    ((430.0, 28.0, 590.0, 39.6), BLANC),  # créé le
    ((443.0, 44.0, 590.0, 54.6), BLANC),  # créé par
    ((430.0, 63.0, 590.0, 74.6), BLANC),  # édité le
    ((443.0, 82.5, 590.0, 94.0), BLANC),  # édité par
    ((499.7, 107.2, 572.6, 126.1), BLEU),  # numéro du bon
    ((136.1, 173.4, 436.2, 188.1), BLANC),  # participant
    ((136.1, 196.5, 234.8, 211.1), BLANC),  # matricule
    ((236.2, 196.3, 505.5, 211.3), BLEU_PALE),  # société, cadre du matricule
    ((136.1, 220.5, 374.0, 235.1), BLANC),  # bénéficiaire
    ((375.4, 220.5, 470.2, 235.1), BLANC),  # type de bénéficiaire
    ((506.7, 220.5, 528.4, 235.1), BLANC),  # âge
    ((136.1, 242.5, 196.8, 257.2), BLANC),  # prescripteur, code
    ((198.2, 242.5, 455.2, 257.2), BLANC),  # prescripteur
    ((298.4, 266.5, 407.1, 281.2), BLANC),  # date d'ordonnance
    ((69.9, 323.6, 127.7, 338.3), BLANC),  # fournisseur, code
    ((131.0, 323.6, 470.2, 338.3), BLANC),  # fournisseur
    ((131.0, 344.7, 470.2, 359.4), BLANC),  # adresse
    ((473.6, 344.7, 572.4, 359.4), BLANC),  # téléphone
    ((57.7, 414.7, 334.3, 428.7), BLANC),  # désignation
    ((335.1, 414.7, 379.4, 428.7), BLANC),  # quantité
    ((380.2, 414.7, 466.5, 428.7), BLANC),  # prix unitaire
    ((467.3, 414.7, 562.7, 428.7), BLANC),  # montant
    ((423.5, 448.9, 565.4, 467.4), BLANC),  # montant total
    ((423.5, 468.8, 565.4, 487.5), BLANC),  # montant remise
    ((423.5, 488.9, 565.4, 507.6), BLANC),  # montant net
]

# Les rectangles ci-dessus sont relevés au bord INTÉRIEUR des cadres, bordure
# comprise - ils l'étaient sur l'ancien modèle, un tirage en noir et blanc où
# les traits n'étaient que des pixels. Sur le modèle en couleur, ces traits
# sont de vrais tracés d'un point de large, centrés sur leur chemin : peindre
# jusqu'au bord en rongeait la moitié, et les cadres des montants ressortaient
# en filets gris là où l'original a des traits noirs francs.
#
# On rentre donc d'un point sur chaque côté. Le fond découvert est de la même
# couleur que celui qu'on peint - c'est invisible -, et la bordure reste
# entière.
RETRAIT = 1.0

# Où écrire : (champ, police, taille, x, ligne de base, alignement, largeur).
# « centre » : x est le milieu du cadre ; « droite » : son bord droit.
EMPLACEMENTS = [
    ('societe', 'arb', 11, 108.4, 42.9, 'gauche', 225),
    ('cree_le', 'tnr', 8, 432.8, 36.6, 'gauche', 150),
    ('cree_par', 'tnr', 8, 445.2, 51.7, 'gauche', 140),
    ('edite_le', 'tnr', 8, 432.4, 71.7, 'gauche', 155),
    ('edite_par', 'tnr', 8, 445.2, 90.7, 'gauche', 140),
    ('code', 'tnr', 10, 535.9, 120.5, 'centre', 70),
    ('participant', 'tnrg', 8.6, 140.3, 184.1, 'gauche', 292),
    ('matricule', 'tnr', 9, 140.3, 207.3, 'gauche', 92),
    ('societe', 'arb', 9, 370.9, 207.3, 'centre', 264),
    ('beneficiaire', 'tnr', 9, 140.3, 231.2, 'gauche', 230),
    ('type', 'tnr', 9, 422.9, 231.2, 'centre', 90),
    ('age', 'tnr', 9, 517.3, 231.3, 'centre', 20),
    ('prescripteur_code', 'tnr', 9, 166.6, 253.3, 'centre', 58),
    ('prescripteur', 'tnr', 9, 202.8, 253.2, 'gauche', 250),
    ('date_ordonnance', 'tnr', 9, 301.7, 277.4, 'gauche', 102),
    ('fournisseur_code', 'tnr', 9, 98.8, 334.5, 'centre', 54),
    ('fournisseur', 'arb', 9, 300.9, 334.6, 'centre', 334),
    ('adresse', 'tnr', 9, 135.4, 355.4, 'gauche', 332),
    ('tel', 'tnr', 9, 522.8, 355.5, 'centre', 95),
    ('designation', 'tnr', 10, 62.2, 425.6, 'gauche', 268),
    ('quantite', 'tnr', 10, 357.2, 425.5, 'centre', 40),
    # Les montants : en gras dans le modèle.
    ('prix_unitaire', 'tnrg', 10, 461.6, 425.6, 'droite', 82),
    ('montant', 'tnrg', 10, 557.8, 425.6, 'droite', 92),
    ('montant_total', 'tnrg', 10, 560.8, 462.1, 'droite', 138),
    ('montant_remise', 'tnrg', 10, 560.8, 482.1, 'droite', 138),
    ('montant_net', 'tnrg', 10, 560.8, 502.1, 'droite', 138),
]


def _montant(n):
    """263160 → « 263 160 », comme sur le bon."""
    return f'{n:,}'.replace(',', ' ')


def _valeurs(bon, utilisateur):
    """Ce que le bon imprime, champ par champ."""
    participant = bon.participant
    beneficiaire = bon.beneficiaire
    personne = beneficiaire or participant
    fournisseur = bon.fournisseur
    prescripteur = bon.prescripteur
    # La ligne commandée du bon imprimé : le premier article choisi (désignation
    # = libellé, PU = tarif). Les bons de l'origine n'en portent qu'un ; s'il y
    # en avait plusieurs, le total les additionne tous (cf. montant_total).
    articles = bon.actes or []
    premier = articles[0] if articles else None
    ligne = bool(premier)
    pu = int(premier.get('tarif') or 0) if premier else 0
    qte = int(premier.get('quantite') or 0) if premier else 0
    return {
        'societe': bon.adherent.libelle.upper() if bon.adherent_id else '',
        # « Crée le » : l'orthographe du modèle.
        'cree_le': f'Crée le : {_fr(bon.date)}',
        'cree_par': f'par : {bon.cree_par.username}' if bon.cree_par_id else 'par :',
        'edite_le': f"édité le : {timezone.localtime().strftime('%d/%m/%Y à %H:%M')}",
        # L'identifiant de l'utilisateur IPM, ou le matricule affiché du
        # participant quand c'est lui qui l'ouvre sur son téléphone (mobile).
        'edite_par': f"par : {getattr(utilisateur, 'username', utilisateur) or ''}",
        'code': bon.code,
        'participant': participant.nom_complet.upper() if participant else '',
        # Le matricule seul, sans le code de la société : « 0949 » à l'origine.
        'matricule': participant.matricule if participant else '',
        'beneficiaire': beneficiaire.nom_complet.upper() if beneficiaire else 'LUI-MÊME',
        # La photo du titulaire du bon, imprimée sous « Le PARTICIPANT ».
        'photo': personne.photo if personne else '',
        # « Participant » : ce bon imprime le type en minuscules.
        'type': bon.type_benef.libelle.capitalize() if bon.type_benef_id else '',
        'age': _age(personne.date_naissance if personne else None, bon.date),
        'prescripteur_code': prescripteur.code if prescripteur else '',
        'prescripteur': prescripteur.libelle.upper() if prescripteur else '',
        'date_ordonnance': _fr(bon.date_ordonnance),
        'fournisseur_code': fournisseur.code if fournisseur else '',
        'fournisseur': fournisseur.libelle.upper() if fournisseur else '',
        'adresse': fournisseur.adresse if fournisseur else '',
        'tel': (fournisseur.telephone or fournisseur.mobile) if fournisseur else '',
        'designation': premier.get('libelle', '') if premier else '',
        'quantite': str(qte) if ligne else '',
        'prix_unitaire': _montant(pu) if ligne else '',
        'montant': _montant(qte * pu) if ligne else '',
        'montant_total': _montant(bon.montant_total),
        'montant_remise': _montant(bon.montant_remise),
        'montant_net': _montant(bon.montant_net),
    }


def rendre(valeurs):
    """Le modèle rempli de ces valeurs (original et copie), en octets PDF."""
    doc = ouvrir_modele(MODELE)
    for page in doc:
        # 1. Repeindre l'intérieur des cadres de leur fond : les valeurs du
        #    modèle disparaissent, les bordures restent.
        for rect, fond in A_COUVRIR:
            page.draw_rect(
                pymupdf.Rect(rect) + (RETRAIT, RETRAIT, -RETRAIT, -RETRAIT),
                color=None,
                fill=fond,
                width=0,
                overlay=True,
            )

        # 2. Écrire celles du bon, à la même place.
        polices = {**_polices(page), 'tnrg': ('tibo', pymupdf.Font('tibo'))}
        for champ, police, taille, x, y, alignement, largeur in EMPLACEMENTS:
            texte = valeurs[champ].translate(TYPOGRAPHIE)
            if not texte:
                continue
            nom_police, mesure = polices[police]
            # Un nom trop long pour son cadre rapetisse plutôt que de déborder.
            while taille > 6 and mesure.text_length(texte, fontsize=taille) > largeur:
                taille -= 0.5
            longueur = mesure.text_length(texte, fontsize=taille)
            if alignement == 'centre':
                x -= longueur / 2
            elif alignement == 'droite':
                x -= longueur
            page.insert_text((x, y), texte, fontname=nom_police, fontsize=taille, color=(0, 0, 0))

        # 3. La photo du titulaire du bon, sous « Le PARTICIPANT ».
        if 'photo' in valeurs:
            poser_photo(
                page,
                valeurs['photo'],
                x=40.0,
                haut=536.0,
                largeur=132.0,
            )
    _nommer(doc, valeurs['code'])
    contenu = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return contenu


def bon_optique_pdf(bon, utilisateur):
    """
    Le bon imprimé (original et copie fournisseur), en octets PDF.
    ``utilisateur`` : qui l'imprime - l'utilisateur IPM, ou le matricule
    affiché du participant (chaîne) depuis l'application mobile.
    """
    return rendre(_valeurs(bon, utilisateur))

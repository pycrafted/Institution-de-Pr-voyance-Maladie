"""
Éditions des règlements (§17, captures 55-56) : états imprimés en PDF.

Deux listes, générées à la volée (sans modèle de fond, à la différence des bons) :
  - « Factures à Payer »   : les factures retenues pour paiement (drapeau A Payer).
  - « Factures non Payées » : les factures comptabilisées restant à régler.

Un tableau simple en paysage A4, paginé, avec le total en pied. Les lettres
chèque et ordres de virement (captures 57-58) dépendent d'un modèle de banque et
d'un chéquier non encore décrits : ils ne sont pas produits ici.
"""

from datetime import date

import pymupdf

# A4 paysage, en points PDF.
LARGEUR, HAUTEUR = 842, 595
MARGE = 36
HAUT_LIGNE = 18
BAS_TABLE = HAUTEUR - 48

GRIS = (0.42, 0.45, 0.5)
ENCRE = (0.07, 0.08, 0.11)
ROUGE = (0.90, 0.15, 0.13)
TRAIT = (0.86, 0.88, 0.92)
BANDE = (0.96, 0.97, 0.99)

# Colonnes : (clé, en-tête, largeur pt, alignement). La somme des largeurs tient
# dans LARGEUR - 2*MARGE (= 770).
COLONNES = [
    ('numero', 'N° F.', 55, 'left'),
    ('societe', 'Société', 55, 'left'),
    ('numeroFrs', 'N° F. Frs', 90, 'left'),
    ('dateFacture', 'Date fact.', 70, 'left'),
    ('echeance', 'Échéance', 70, 'left'),
    ('fournisseur', 'Fournisseur', 250, 'left'),
    ('specialite', 'Spécialité', 90, 'left'),
    ('montant', 'Montant', 90, 'right'),
]


def _fr_date(jour):
    return jour.strftime('%d/%m/%Y') if jour else ''


def _fr_montant(n):
    return f'{int(n or 0):,}'.replace(',', ' ')


def _ligne_facture(facture):
    """Les valeurs d'une facture, dans l'ordre des colonnes."""
    if facture.fournisseur_soins_id:
        fournisseur = facture.fournisseur_soins.libelle
    elif facture.fournisseur_divers_id:
        fournisseur = facture.fournisseur_divers.libelle
    else:
        fournisseur = ''
    return {
        'numero': str(facture.id),
        'societe': facture.adherent.code if facture.adherent_id else '',
        'numeroFrs': facture.numero_fournisseur or '',
        'dateFacture': _fr_date(facture.date_facture),
        'echeance': _fr_date(facture.echeance),
        'fournisseur': fournisseur,
        'specialite': facture.specialite.libelle if facture.specialite_id else '',
        'montant': _fr_montant(facture.montant_net),
    }


def _tronquer(texte, largeur, taille):
    """Coupe un texte trop long pour sa colonne, avec une ellipse."""
    if pymupdf.get_text_length(texte, fontsize=taille) <= largeur:
        return texte
    while texte and pymupdf.get_text_length(texte + '...', fontsize=taille) > largeur:
        texte = texte[:-1]
    return texte + '...'


def _ecrire_cellule(page, texte, x, y, largeur, aligne, taille=8.5, couleur=ENCRE, gras=False):
    police = 'helvetica-bold' if gras else 'helvetica'
    texte = _tronquer(str(texte), largeur - 6, taille)
    if aligne == 'right':
        pos = x + largeur - 3 - pymupdf.get_text_length(texte, fontname=police, fontsize=taille)
    else:
        pos = x + 3
    page.insert_text((pos, y), texte, fontname=police, fontsize=taille, color=couleur)


def _entete_page(page, titre, sous_titre):
    page.insert_text(
        (MARGE, MARGE + 2),
        'INSTITUTION DE PREVOYANCE MALADIE (IPM) - SAR',
        fontname='helvetica',
        fontsize=8,
        color=GRIS,
    )
    page.insert_text(
        (MARGE, MARGE + 22), titre, fontname='helvetica-bold', fontsize=15, color=ROUGE
    )
    page.insert_text(
        (MARGE, MARGE + 38), sous_titre, fontname='helvetica', fontsize=9, color=GRIS
    )
    edite = f'Édité le {date.today().strftime("%d/%m/%Y")}'
    page.insert_text(
        (LARGEUR - MARGE - pymupdf.get_text_length(edite, fontsize=8.5), MARGE + 2),
        edite,
        fontname='helvetica',
        fontsize=8.5,
        color=GRIS,
    )
    return MARGE + 58


def _entete_colonnes(page, y):
    page.draw_rect(
        pymupdf.Rect(MARGE, y - 12, LARGEUR - MARGE, y + 4), color=None, fill=ENCRE
    )
    x = MARGE
    for _, titre, largeur, aligne in COLONNES:
        _ecrire_cellule(page, titre, x, y, largeur, aligne, taille=8.5, couleur=(1, 1, 1), gras=True)
        x += largeur
    return y + HAUT_LIGNE


def editer_liste_factures(titre, sous_titre, factures):
    """Rend un PDF (bytes) : le tableau des factures, paginé, total en pied."""
    doc = pymupdf.open()
    lignes = [_ligne_facture(f) for f in factures]
    total = sum(int(f.montant_net or 0) for f in factures)

    page = doc.new_page(width=LARGEUR, height=HAUTEUR)
    y = _entete_page(page, titre, sous_titre)
    y = _entete_colonnes(page, y)

    for index, ligne in enumerate(lignes):
        if y > BAS_TABLE:
            page = doc.new_page(width=LARGEUR, height=HAUTEUR)
            y = _entete_page(page, titre, sous_titre)
            y = _entete_colonnes(page, y)
        if index % 2 == 1:
            page.draw_rect(
                pymupdf.Rect(MARGE, y - 12, LARGEUR - MARGE, y + 4), color=None, fill=BANDE
            )
        x = MARGE
        for cle, _, largeur, aligne in COLONNES:
            _ecrire_cellule(page, ligne[cle], x, y, largeur, aligne)
            x += largeur
        y += HAUT_LIGNE

    # Pied : trait puis total.
    y += 4
    page.draw_line(
        pymupdf.Point(MARGE, y - 12), pymupdf.Point(LARGEUR - MARGE, y - 12), color=TRAIT, width=0.8
    )
    resume = f'Total : {len(lignes)} facture(s) - {_fr_montant(total)}'
    _ecrire_cellule(
        page, resume, MARGE, y + 2, LARGEUR - 2 * MARGE, 'right', taille=10, couleur=ROUGE, gras=True
    )

    sortie = doc.tobytes()
    doc.close()
    return sortie

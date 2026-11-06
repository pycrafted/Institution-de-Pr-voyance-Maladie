"""
Extrait de compte imprimé - le bouton « Imprimer Extrait » de l'Interrogation
Compte (captures 74 à 78).

Un tableau paysage A4, paginé, avec l'en-tête du compte interrogé et le
contrôle « Débit / Crédit / Solde » en pied. Même facture que les éditions des
règlements (cf. editions.py) : rien d'autre à inventer, un extrait de compte
est une liste d'écritures.

Deux particularités de cet état :

* **L'onglet Charges Techniques imprime deux colonnes de plus** - Frais réel et
  Frais exclus -, parce que l'écriture porte sa liquidation. Les largeurs des
  colonnes s'ajustent à leur présence plutôt que de laisser deux trous.
* **Le solde est annoncé en pied, pas en tête.** Sur un extrait, on lit les
  écritures puis on conclut ; le total en tête obligerait à faire confiance
  avant d'avoir lu.
"""

from datetime import date

import pymupdf

# A4 paysage, en points PDF.
LARGEUR, HAUTEUR = 842, 595
MARGE = 36
HAUT_LIGNE = 16
BAS_TABLE = HAUTEUR - 70

GRIS = (0.42, 0.45, 0.5)
ENCRE = (0.07, 0.08, 0.11)
ROUGE = (0.90, 0.15, 0.13)
TRAIT = (0.86, 0.88, 0.92)
BANDE = (0.96, 0.97, 0.99)
BLANC = (1, 1, 1)

# Colonnes : (clé, en-tête, largeur, alignement). Deux jeux, selon que l'onglet
# porte la liquidation ou non ; chacun tient dans LARGEUR - 2*MARGE (= 770).
COLONNES_SIMPLES = [
    ('codeSoc', 'Soc.', 40, 'gauche'),
    ('cJl', 'C.JL', 42, 'gauche'),
    ('dCompta', 'Date Compta', 72, 'gauche'),
    ('moisTrait', 'Mois trait.', 68, 'gauche'),
    ('numPiece', 'N° pièce', 85, 'gauche'),
    ('numFactIpm', 'N° Fact.', 62, 'gauche'),
    ('compteGen', 'Cpte. Gen.', 68, 'gauche'),
    ('compteTiers', 'Cpte. Tiers', 72, 'gauche'),
    ('libelle', 'Libellé', 171, 'gauche'),
    ('debit', 'Débit', 45, 'droite'),
    ('credit', 'Crédit', 45, 'droite'),
]

COLONNES_LIQUIDATION = [
    ('codeSoc', 'Soc.', 38, 'gauche'),
    ('cJl', 'C.JL', 40, 'gauche'),
    ('dCompta', 'Date Compta', 70, 'gauche'),
    ('moisTrait', 'Mois trait.', 66, 'gauche'),
    ('numPiece', 'N° pièce', 80, 'gauche'),
    ('numFactIpm', 'N° Fact.', 60, 'gauche'),
    ('compteGen', 'Cpte. Gen.', 66, 'gauche'),
    ('libelle', 'Libellé', 130, 'gauche'),
    ('debit', 'Débit', 55, 'droite'),
    ('credit', 'Crédit', 55, 'droite'),
    ('fraisReel', 'Frais réel', 55, 'droite'),
    ('fraisExclus', 'Frais exclus', 55, 'droite'),
]

ABREGES = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]


def _fr_date(jour):
    return jour.strftime('%d/%m/%Y') if jour else ''


def _fr_mois(jour):
    """« janv.-2026 » : la colonne « Mois trait. » montre un mois, pas un jour."""
    return f'{ABREGES[jour.month - 1]}-{jour.year}' if jour else ''


def _fr_montant(n):
    return f'{int(n or 0):,}'.replace(',', ' ')


def _cellule_montant(n):
    """Une case à zéro reste vide : une écriture porte un débit OU un crédit."""
    return '' if int(n or 0) == 0 else _fr_montant(n)


def _tronquer(texte, largeur, taille):
    if pymupdf.get_text_length(texte, fontsize=taille) <= largeur:
        return texte
    while texte and pymupdf.get_text_length(texte + '...', fontsize=taille) > largeur:
        texte = texte[:-1]
    return texte + '...'


def _ecrire(page, texte, x, y, largeur, aligne, taille=8, couleur=ENCRE, gras=False):
    police = 'helvetica-bold' if gras else 'helvetica'
    texte = _tronquer(str(texte), largeur - 6, taille)
    if aligne == 'droite':
        pos = x + largeur - 3 - pymupdf.get_text_length(texte, fontname=police, fontsize=taille)
    else:
        pos = x + 3
    page.insert_text((pos, y), texte, fontname=police, fontsize=taille, color=couleur)


def _valeurs(ecriture):
    """Une écriture, dans l'ordre des colonnes."""
    return {
        'codeSoc': ecriture.codesoc or '',
        'cJl': ecriture.codej or '',
        'dCompta': _fr_date(ecriture.date_compta),
        'moisTrait': _fr_mois(ecriture.date_trait),
        'numPiece': ecriture.numpiece or '',
        'numFactIpm': ecriture.numfactipm or '',
        'compteGen': ecriture.comptegen or '',
        'compteTiers': ecriture.comptetiers or '',
        'libelle': ecriture.libelle or '',
        'debit': _cellule_montant(ecriture.debit),
        'credit': _cellule_montant(ecriture.credit),
        'fraisReel': _cellule_montant(ecriture.frais_reel),
        'fraisExclus': _cellule_montant(ecriture.frais_exclus),
    }


def _entete_page(page, contexte):
    """L'identité de l'extrait : le titre de l'onglet, le compte, la période."""
    page.insert_text(
        (MARGE, MARGE + 2),
        'INSTITUTION DE PREVOYANCE MALADIE (IPM) - SAR',
        fontname='helvetica', fontsize=8, color=GRIS,
    )
    page.insert_text(
        (MARGE, MARGE + 22), contexte['titre'],
        fontname='helvetica-bold', fontsize=14, color=ROUGE,
    )

    # Le compte interrogé, puis le tiers, puis la période.
    designation = ' - '.join(
        morceau for morceau in (
            contexte.get('compte') or '',
            contexte.get('intitule') or '',
            contexte.get('tiers') or '',
        ) if morceau
    ) or 'Tous les comptes de la famille'
    page.insert_text(
        (MARGE, MARGE + 38), designation, fontname='helvetica', fontsize=9.5, color=ENCRE,
    )

    periode = ''
    if contexte.get('du') or contexte.get('au'):
        periode = f'Période : {contexte.get("du") or "…"} au {contexte.get("au") or "…"}'
    elif contexte.get('exercice'):
        periode = f'Exercice {contexte["exercice"]}'
    if periode:
        page.insert_text(
            (MARGE, MARGE + 52), periode, fontname='helvetica', fontsize=8.5, color=GRIS,
        )

    edite = f'Édité le {date.today().strftime("%d/%m/%Y")}'
    page.insert_text(
        (LARGEUR - MARGE - pymupdf.get_text_length(edite, fontsize=8.5), MARGE + 2),
        edite, fontname='helvetica', fontsize=8.5, color=GRIS,
    )
    return MARGE + 72


def _entete_colonnes(page, colonnes, y):
    page.draw_rect(pymupdf.Rect(MARGE, y - 11, LARGEUR - MARGE, y + 4), color=None, fill=ENCRE)
    x = MARGE
    for _, titre, largeur, aligne in colonnes:
        _ecrire(page, titre, x, y, largeur, aligne, taille=8, couleur=BLANC, gras=True)
        x += largeur
    return y + HAUT_LIGNE


def extrait_de_compte_pdf(ecritures, contexte):
    """Rend l'extrait imprimé (bytes PDF)."""
    colonnes = COLONNES_LIQUIDATION if contexte.get('liquidation') else COLONNES_SIMPLES

    doc = pymupdf.open()
    page = doc.new_page(width=LARGEUR, height=HAUTEUR)
    y = _entete_page(page, contexte)
    y = _entete_colonnes(page, colonnes, y)

    for index, ecriture in enumerate(ecritures):
        if y > BAS_TABLE:
            page = doc.new_page(width=LARGEUR, height=HAUTEUR)
            y = _entete_page(page, contexte)
            y = _entete_colonnes(page, colonnes, y)
        if index % 2 == 1:
            page.draw_rect(
                pymupdf.Rect(MARGE, y - 11, LARGEUR - MARGE, y + 4), color=None, fill=BANDE,
            )
        valeurs = _valeurs(ecriture)
        x = MARGE
        for cle, _, largeur, aligne in colonnes:
            _ecrire(page, valeurs[cle], x, y, largeur, aligne)
            x += largeur
        y += HAUT_LIGNE

    if not ecritures:
        _ecrire(
            page, 'Aucune écriture sur cette période.', MARGE, y + 4,
            LARGEUR - 2 * MARGE, 'gauche', taille=9, couleur=GRIS,
        )
        y += HAUT_LIGNE

    # Le contrôle, en pied : débit, crédit, et le solde qui conclut.
    debit = int(contexte.get('debit') or 0)
    credit = int(contexte.get('credit') or 0)
    y += 4
    page.draw_line(
        pymupdf.Point(MARGE, y - 10), pymupdf.Point(LARGEUR - MARGE, y - 10),
        color=TRAIT, width=0.8,
    )
    resume = (
        f'Total débit : {_fr_montant(debit)}    '
        f'Total crédit : {_fr_montant(credit)}    '
        f'Solde : {_fr_montant(debit - credit)}'
    )
    _ecrire(
        page, resume, MARGE, y + 4, LARGEUR - 2 * MARGE, 'droite',
        taille=10, couleur=ROUGE, gras=True,
    )

    sortie = doc.tobytes()
    doc.close()
    return sortie

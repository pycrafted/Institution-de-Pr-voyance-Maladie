# -*- coding: utf-8 -*-
"""
Cotisations imprimées - le bouton « Imprimer » de l'écran Cotisations.

Deux états, la même page, parce qu'ils répondent à deux questions qui se
suivent :

* **L'état du mois** (bouton de l'onglet Saisie) : une ligne par appel, avec
  ses deux mouvements et son état. C'est ce qu'un comptable emporte pour
  pointer la recette du mois.
* **L'appel nominatif** (`detail=True`) : la liste des cotisants et ce que
  chacun doit. C'est la pièce justificative de l'appel.

Même facture que l'extrait de compte (`impression_extrait.py`) : en-tête IPM,
bandeau de colonnes à l'encre, lignes alternées, total en pied. Un état n'a
pas à inventer sa mise en page quand l'application en a déjà une.

A4 **paysage** pour l'état du mois (onze colonnes, comme à l'écran), A4
**portrait** pour l'appel nominatif (sept colonnes et beaucoup de lignes :
219 cotisants tiennent en cinq pages portrait, et le nom se lit mieux).
"""

from datetime import date

import pymupdf

MARGE = 36
HAUT_LIGNE = 16

GRIS = (0.42, 0.45, 0.5)
ENCRE = (0.07, 0.08, 0.11)
ROUGE = (0.90, 0.15, 0.13)
TRAIT = (0.86, 0.88, 0.92)
BANDE = (0.96, 0.97, 0.99)
BLANC = (1, 1, 1)

ABREGES = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]
MOIS_ENTIERS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

# L'état du mois, en paysage : les colonnes de l'onglet Saisie. La somme des
# largeurs tient dans 842 - 2*36 = 770.
COLONNES_ETAT = [
    ('cJl', 'C.JL', 44, 'gauche'),
    ('datePiece', 'Date pièce', 70, 'gauche'),
    ('dateSaisie', 'Date saisie', 70, 'gauche'),
    ('numPiece', 'N° pièce', 108, 'gauche'),
    ('compteGen', 'Cpte. Gen.', 66, 'gauche'),
    ('moisTrait', 'Mois trait', 66, 'gauche'),
    ('libelle', 'Libellé', 170, 'gauche'),
    ('societe', 'Société', 40, 'gauche'),
    ('debit', 'Mvts Débit', 66, 'droite'),
    ('credit', 'Mvts Crédit', 66, 'droite'),
    ('etat', 'Comptabilisé', 4, 'gauche'),
]

# L'appel nominatif, en portrait : 595 - 2*36 = 523.
COLONNES_APPEL = [
    ('matricule', 'Matricule', 62, 'gauche'),
    ('codeSoc', 'Code soc', 56, 'gauche'),
    ('prenoms', 'Prénom', 125, 'gauche'),
    ('nom', 'Nom', 90, 'gauche'),
    ('adresse', 'Adresse', 120, 'gauche'),
    ('montant', 'Cotisation Dûe', 70, 'droite'),
]


def _fr_date(jour):
    return jour.strftime('%d/%m/%Y') if jour else ''


def _fr_mois(jour):
    return f'{ABREGES[jour.month - 1]}-{jour.year}' if jour else ''


def _fr_montant(n):
    return f'{int(n or 0):,}'.replace(',', ' ')


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


def _entete_page(page, largeur_page, titre, sous_titre, precision=''):
    page.insert_text(
        (MARGE, MARGE + 2),
        'INSTITUTION DE PREVOYANCE MALADIE (IPM) - SAR',
        fontname='helvetica', fontsize=8, color=GRIS,
    )
    page.insert_text(
        (MARGE, MARGE + 22), titre, fontname='helvetica-bold', fontsize=14, color=ROUGE,
    )
    if sous_titre:
        page.insert_text(
            (MARGE, MARGE + 38), sous_titre, fontname='helvetica', fontsize=9.5, color=ENCRE,
        )
    if precision:
        page.insert_text(
            (MARGE, MARGE + 52), precision, fontname='helvetica', fontsize=8.5, color=GRIS,
        )
    edite = f'Édité le {date.today().strftime("%d/%m/%Y")}'
    page.insert_text(
        (largeur_page - MARGE - pymupdf.get_text_length(edite, fontsize=8.5), MARGE + 2),
        edite, fontname='helvetica', fontsize=8.5, color=GRIS,
    )
    return MARGE + (72 if precision else 60)


def _entete_colonnes(page, largeur_page, colonnes, y):
    page.draw_rect(
        pymupdf.Rect(MARGE, y - 11, largeur_page - MARGE, y + 4), color=None, fill=ENCRE,
    )
    x = MARGE
    for _, titre, largeur, aligne in colonnes:
        _ecrire(page, titre, x, y, largeur, aligne, taille=8, couleur=BLANC, gras=True)
        x += largeur
    return y + HAUT_LIGNE


def _lignes_etat(appels):
    """Un appel par ligne : ses deux mouvements portent le même total."""
    for appel in appels:
        total = appel.total
        yield {
            'cJl': appel.journal,
            'datePiece': _fr_date(appel.date_piece),
            'dateSaisie': _fr_date(appel.date_compta),
            'numPiece': appel.code,
            'compteGen': appel.adherent.compte if appel.adherent_id else '',
            'moisTrait': _fr_mois(appel.date_trait),
            'libelle': f'{appel.adherent.libelle} : {appel.periode}'
                       if appel.adherent_id else appel.periode,
            'societe': appel.adherent.code if appel.adherent_id else '',
            'debit': _fr_montant(total),
            'credit': _fr_montant(total),
            'etat': 'Oui' if appel.comptabilise else 'Non',
            '_total': total,
        }


def _lignes_appel(appel):
    for ligne in appel.lignes.select_related('participant'):
        participant = ligne.participant
        yield {
            'matricule': participant.matricule,
            'codeSoc': appel.adherent.code if appel.adherent_id else '',
            'prenoms': participant.prenoms or '',
            'nom': participant.nom or '',
            'adresse': participant.adresse or '',
            'montant': _fr_montant(ligne.montant),
            '_total': int(ligne.montant or 0),
        }


def _rendre(colonnes, lignes, largeur_page, hauteur_page, titre, sous_titre,
            precision, resume_pied):
    """La mécanique commune : pagination, bandes alternées, total en pied."""
    bas_table = hauteur_page - 70
    doc = pymupdf.open()
    page = doc.new_page(width=largeur_page, height=hauteur_page)
    y = _entete_page(page, largeur_page, titre, sous_titre, precision)
    y = _entete_colonnes(page, largeur_page, colonnes, y)

    lignes = list(lignes)
    for index, valeurs in enumerate(lignes):
        if y > bas_table:
            page = doc.new_page(width=largeur_page, height=hauteur_page)
            y = _entete_page(page, largeur_page, titre, sous_titre, precision)
            y = _entete_colonnes(page, largeur_page, colonnes, y)
        if index % 2 == 1:
            page.draw_rect(
                pymupdf.Rect(MARGE, y - 11, largeur_page - MARGE, y + 4),
                color=None, fill=BANDE,
            )
        x = MARGE
        for cle, _, largeur, aligne in colonnes:
            _ecrire(page, valeurs.get(cle, ''), x, y, largeur, aligne)
            x += largeur
        y += HAUT_LIGNE

    if not lignes:
        _ecrire(
            page, 'Aucune cotisation sur cette période.', MARGE, y + 4,
            largeur_page - 2 * MARGE, 'gauche', taille=9, couleur=GRIS,
        )
        y += HAUT_LIGNE

    y += 4
    page.draw_line(
        pymupdf.Point(MARGE, y - 10), pymupdf.Point(largeur_page - MARGE, y - 10),
        color=TRAIT, width=0.8,
    )
    _ecrire(
        page, resume_pied(lignes), MARGE, y + 4, largeur_page - 2 * MARGE, 'droite',
        taille=10, couleur=ROUGE, gras=True,
    )

    sortie = doc.tobytes()
    doc.close()
    return sortie


def etat_cotisations_pdf(appels, annee='', mois='', detail=False):
    """
    Rend l'état imprimé (bytes PDF).

    `detail=True` avec un seul appel imprime sa liste nominative ; sinon,
    l'état du mois, une ligne par appel.
    """
    if detail and appels:
        appel = appels[0]
        return _rendre(
            COLONNES_APPEL,
            _lignes_appel(appel),
            595, 842,
            'Appel de Cotisations',
            f'{appel.adherent.code} - {appel.adherent.libelle} - {appel.code}',
            f'{appel.periode}  -  {appel.cotisants} cotisants',
            lambda lignes: (
                f'{len(lignes)} cotisants    '
                f'Total Cotisé : {_fr_montant(sum(l["_total"] for l in lignes))}'
            ),
        )

    periode = ''
    if str(mois).isdigit() and 1 <= int(mois) <= 12:
        periode = MOIS_ENTIERS[int(mois) - 1]
    if str(annee).isdigit():
        periode = f'{periode} {annee}'.strip()

    return _rendre(
        COLONNES_ETAT,
        _lignes_etat(appels),
        842, 595,
        'Cotisations',
        periode or 'Toutes périodes',
        '',
        # Les deux soldes portent le même nombre : une cotisation est
        # équilibrée. Les imprimer tous les deux, c'est donner au lecteur le
        # moyen de le vérifier plutôt que de le lui demander sur parole.
        lambda lignes: (
            f'Solde débit : {_fr_montant(sum(l["_total"] for l in lignes))}    '
            f'Solde crédit : {_fr_montant(sum(l["_total"] for l in lignes))}'
        ),
    )

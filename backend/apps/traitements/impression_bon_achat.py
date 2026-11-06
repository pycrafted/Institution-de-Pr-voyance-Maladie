"""
Bon de commande d'achat imprimé (captures 79-80, modèle d'origine dans
docs/lamps/documents/bon-de-commande-BA000012.pdf).

À la différence des bons de pharmacie et optique, ce document n'a pas de fond
scanné à remplir : il se dessine ici, bloc par bloc. On garde la structure de
l'original - le cadre « BON DE COMMANDE » en haut à droite, les deux blocs
Bon / Fournisseur, l'adresse de livraison, le tableau des lignes, les
remarques en regard des quatre totaux, « Le GERANT » en pied - et on refait
la mise en page, comme partout ailleurs dans l'application.

Deux choix à connaître :

* **L'en-tête lit la fiche de l'IPM** (Paramètres → Informations Générales).
  L'original imprimait une adresse figée, celle de la SAR, qui ne correspond
  à aucun champ de cette fiche. Reprendre une adresse en dur aurait gelé la
  même erreur pour dix ans ; si la commande doit bien partir au nom de la SAR,
  c'est un second jeu d'identité qu'il faudra paramétrer, pas une constante
  dans ce fichier (cf. docs/lamps/bons-achats.md §3.1).
* **La colonne « Total » porte le TTC**, comme l'original. Inhabituel, mais
  exact : la charge prend le TTC, l'IPM ne récupérant pas la TVA.
"""

import base64
from datetime import date

import pymupdf

from parametres.models import InformationsIPM

# A4 portrait, en points PDF.
LARGEUR, HAUTEUR = 595, 842
MARGE = 40

ENCRE = (0.07, 0.08, 0.11)
GRIS = (0.42, 0.45, 0.5)
ROUGE = (0.90, 0.15, 0.13)
TRAIT = (0.84, 0.86, 0.90)
BANDE = (0.96, 0.97, 0.99)
BLANC = (1, 1, 1)

HAUT_LIGNE = 17
# Au-delà, on passe à la page suivante (en gardant la place du pied de page).
BAS_TABLE = HAUTEUR - 150

# Colonnes du tableau des lignes : (clé, en-tête, largeur, alignement).
# La somme des largeurs tient dans LARGEUR - 2*MARGE (= 515).
COLONNES = [
    ('code', 'Code Article', 70, 'gauche'),
    ('designation', 'Désignation Article', 160, 'gauche'),
    ('quantite', 'Qté', 40, 'droite'),
    ('prix', 'Prix Unitaire', 70, 'droite'),
    ('remise', 'Remise %', 60, 'droite'),
    ('tva', 'TVA %', 45, 'droite'),
    ('total', 'Total', 70, 'droite'),
]


def _fr_date(jour):
    return jour.strftime('%d/%m/%Y') if jour else ''


def _fr_montant(n):
    return f'{int(n or 0):,}'.replace(',', ' ')


def _tronquer(texte, largeur, taille, police='helvetica'):
    """Coupe un texte trop long pour sa place, avec une ellipse."""
    texte = str(texte)
    if pymupdf.get_text_length(texte, fontname=police, fontsize=taille) <= largeur:
        return texte
    while texte and pymupdf.get_text_length(
        texte + '...', fontname=police, fontsize=taille
    ) > largeur:
        texte = texte[:-1]
    return texte + '...'


def _ecrire(page, texte, x, y, taille=9, couleur=ENCRE, gras=False, largeur=None, aligne='gauche'):
    """Écrit un texte ; `aligne` vaut « gauche », « droite » ou « centre »."""
    police = 'helvetica-bold' if gras else 'helvetica'
    texte = str(texte or '')
    if largeur:
        texte = _tronquer(texte, largeur, taille, police)
    if aligne != 'gauche':
        long_texte = pymupdf.get_text_length(texte, fontname=police, fontsize=taille)
        x = x - long_texte if aligne == 'droite' else x - long_texte / 2
    page.insert_text((x, y), texte, fontname=police, fontsize=taille, color=couleur)


# ---------------------------------------------------------------------------
# Les valeurs du bon
# ---------------------------------------------------------------------------


def _valeurs(bon):
    """Ce que le bon imprime, bloc par bloc."""
    fournisseur = bon.fournisseur
    contact_frs = ' - '.join(
        valeur for valeur in (fournisseur.contact_nom, fournisseur.contact_telephone) if valeur
    )
    return {
        'bon': [
            ('N° Bon de Commande', bon.code),
            ('Statut', bon.statut),
            ('Date de Livraison Souhaitée', _fr_date(bon.date_livraison)),
            ('Contact', bon.contact),
            ('Email', bon.contact_email),
            ('Condition de Paiement', bon.condition_paiement),
        ],
        'fournisseur': [
            ('Code', fournisseur.code),
            ('Raison Sociale', fournisseur.libelle),
            ('Contact', contact_frs),
            # Champ du bon, imprimé dans le bloc du fournisseur : c'est la
            # place que lui donne le document d'origine, on la garde.
            ('N° Offre', bon.num_offre),
            ('Adresse', fournisseur.adresse),
        ],
        'lignes': [
            {
                'code': ligne.article.code,
                'designation': ligne.article.libelle,
                'quantite': _fr_montant(ligne.quantite),
                'prix': _fr_montant(ligne.prix_unitaire),
                'remise': str(ligne.taux_remise or 0),
                'tva': str(ligne.taux_tva or 0),
                'total': _fr_montant(ligne.montant_ttc),
            }
            for ligne in bon.lignes.all()
        ],
    }


# ---------------------------------------------------------------------------
# Les blocs
# ---------------------------------------------------------------------------


def _logo(page, infos, x, y):
    """Le logo de la fiche IPM, s'il y en a un. Rend la hauteur occupée."""
    if not infos.logo or ',' not in infos.logo:
        return 0
    try:
        image = base64.b64decode(infos.logo.split(',', 1)[1])
        page.insert_image(pymupdf.Rect(x, y, x + 54, y + 30), stream=image, keep_proportion=True)
    except Exception:
        # Un logo illisible ne doit pas empêcher d'imprimer la commande.
        return 0
    return 34


def _entete(page, bon, infos):
    """Identité de l'IPM à gauche, cadre « BON DE COMMANDE » à droite."""
    y = MARGE + 10
    decalage = _logo(page, infos, MARGE, MARGE - 4)
    y += decalage
    _ecrire(page, infos.intitule or "IPM DE LA SAR", MARGE, y, taille=12, gras=True)
    y += 14
    for texte in (
        infos.adresse,
        f'BP {infos.boite_postale}' if infos.boite_postale else '',
        ' / '.join(
            morceau
            for morceau in (
                f'TEL: {infos.telephone}' if infos.telephone else '',
                f'FAX: {infos.fax}' if infos.fax else '',
            )
            if morceau
        ),
    ):
        if texte:
            _ecrire(page, texte, MARGE, y, taille=8.5, couleur=GRIS, largeur=260)
            y += 11

    # Le cadre du titre, en haut à droite, comme l'original.
    cadre = pymupdf.Rect(LARGEUR - MARGE - 170, MARGE - 4, LARGEUR - MARGE, MARGE + 26)
    page.draw_rect(cadre, color=ENCRE, width=0.9, fill=None)
    _ecrire(
        page, 'BON DE COMMANDE', cadre.x0 + cadre.width / 2, cadre.y0 + 20,
        taille=13, gras=True, aligne='centre',
    )
    _ecrire(
        page, f'Edité le : {date.today().strftime("%d/%m/%y")}',
        cadre.x1, cadre.y1 + 12, taille=8.5, couleur=GRIS, aligne='droite',
    )
    return max(y, cadre.y1 + 20) + 10


def _bloc(page, titre, lignes, x, y, largeur):
    """
    Un bloc encadré : un titre facultatif, puis des couples libellé/valeur.

    La colonne des valeurs commence après le plus long libellé **du bloc** :
    le bloc Fournisseur n'a que des libellés courts, et lui imposer la marge
    du bloc voisin tronquerait des raisons sociales pour rien.
    """
    hauteur = 16 * len(lignes) + (20 if titre else 8) + 8
    page.draw_rect(
        pymupdf.Rect(x, y, x + largeur, y + hauteur), color=TRAIT, width=0.8, fill=BLANC,
    )
    colonne = 18 + max(
        pymupdf.get_text_length(f'{libelle} :', fontsize=8.5) for libelle, _ in lignes
    )
    curseur = y + 16
    if titre:
        _ecrire(page, titre, x + 10, curseur, taille=9.5, gras=True, couleur=ROUGE)
        curseur += 18
    for libelle, valeur in lignes:
        _ecrire(page, f'{libelle} :', x + 10, curseur, taille=8.5, couleur=GRIS)
        _ecrire(
            page, valeur, x + colonne, curseur, taille=9,
            gras=libelle == 'N° Bon de Commande', largeur=largeur - colonne - 10,
        )
        curseur += 16
    return y + hauteur


def _entete_colonnes(page, y):
    page.draw_rect(
        pymupdf.Rect(MARGE, y - 12, LARGEUR - MARGE, y + 5), color=None, fill=ENCRE,
    )
    x = MARGE
    for _, titre, largeur, aligne in COLONNES:
        position = x + 5 if aligne == 'gauche' else x + largeur - 5
        _ecrire(
            page, titre, position, y, taille=8.5, couleur=BLANC, gras=True,
            largeur=largeur - 10, aligne=aligne,
        )
        x += largeur
    return y + HAUT_LIGNE + 2


def _lignes(doc, page, lignes, y):
    """
    Le tableau des lignes commandées. Rend la page courante et le bas du
    tableau : une commande longue passe sur une seconde page, où l'en-tête des
    colonnes est redonné.
    """
    y = _entete_colonnes(page, y)
    for index, ligne in enumerate(lignes):
        if y > BAS_TABLE:
            page = doc.new_page(width=LARGEUR, height=HAUTEUR)
            y = _entete_colonnes(page, MARGE + 20)
        if index % 2 == 1:
            page.draw_rect(
                pymupdf.Rect(MARGE, y - 12, LARGEUR - MARGE, y + 5), color=None, fill=BANDE,
            )
        x = MARGE
        for cle, _, largeur, aligne in COLONNES:
            position = x + 5 if aligne == 'gauche' else x + largeur - 5
            _ecrire(
                page, ligne[cle], position, y, taille=8.5,
                largeur=largeur - 10, aligne=aligne,
            )
            x += largeur
        y += HAUT_LIGNE
    page.draw_line(
        pymupdf.Point(MARGE, y - 10), pymupdf.Point(LARGEUR - MARGE, y - 10),
        color=TRAIT, width=0.8,
    )
    return page, y + 8


def _pied(page, bon, y):
    """Remarques à gauche, les quatre totaux à droite, « Le GERANT » en bas."""
    largeur_totaux = 200
    largeur_remarque = LARGEUR - 2 * MARGE - largeur_totaux - 15

    cadre = pymupdf.Rect(MARGE, y, MARGE + largeur_remarque, y + 78)
    page.draw_rect(cadre, color=TRAIT, width=0.8, fill=BLANC)
    _ecrire(page, 'Remarques', cadre.x0 + 10, cadre.y0 + 15, taille=9, gras=True, couleur=GRIS)
    curseur = cadre.y0 + 32
    # La remarque est un texte libre : on la coupe en lignes de la largeur du
    # cadre, sans jamais déborder dessous.
    mots, courante = (bon.remarque or '').split(), ''
    for mot in mots:
        essai = f'{courante} {mot}'.strip()
        if pymupdf.get_text_length(essai, fontsize=8.5) > cadre.width - 20:
            _ecrire(page, courante, cadre.x0 + 10, curseur, taille=8.5)
            curseur += 12
            courante = mot
            if curseur > cadre.y1 - 8:
                courante = ''
                break
        else:
            courante = essai
    if courante:
        _ecrire(page, courante, cadre.x0 + 10, curseur, taille=8.5)

    x_totaux = LARGEUR - MARGE
    curseur = y + 15
    totaux = [
        ('Total HT', bon.total_ht, False),
        ('Montant Remise', bon.total_remise, False),
        ('Montant TVA', bon.total_tva, False),
        ('Total TTC', bon.total_ttc, True),
    ]
    for libelle, valeur, fort in totaux:
        if fort:
            page.draw_line(
                pymupdf.Point(x_totaux - largeur_totaux, curseur - 12),
                pymupdf.Point(x_totaux, curseur - 12),
                color=TRAIT, width=0.8,
            )
        _ecrire(
            page, f'{libelle} :', x_totaux - largeur_totaux, curseur,
            taille=9, couleur=ROUGE if fort else GRIS, gras=fort,
        )
        _ecrire(
            page, _fr_montant(valeur), x_totaux, curseur,
            taille=10 if fort else 9, gras=fort, aligne='droite',
        )
        curseur += 17

    # Emplacement de signature, sans nom - comme l'original. Posé en bas de
    # page : c'est là qu'on signe, et le bon se plie sous les totaux.
    bas = max(max(cadre.y1, curseur) + 34, HAUTEUR - 90)
    _ecrire(page, 'Le GERANT', LARGEUR - MARGE, bas, taille=9.5, gras=True, aligne='droite')
    page.draw_line(
        pymupdf.Point(LARGEUR - MARGE - 62, bas + 4),
        pymupdf.Point(LARGEUR - MARGE, bas + 4),
        color=ENCRE, width=0.7,
    )


def bon_achat_pdf(bon):
    """Rend le bon de commande imprimé (bytes PDF)."""
    infos = InformationsIPM.actuelles()
    valeurs = _valeurs(bon)

    doc = pymupdf.open()
    page = doc.new_page(width=LARGEUR, height=HAUTEUR)

    y = _entete(page, bon, infos)
    _ecrire(page, f'Emis le : {_fr_date(bon.date_bon)}', MARGE, y, taille=9)
    y += 16

    # Les deux blocs, côte à côte et de même hauteur de départ.
    largeur_bloc = (LARGEUR - 2 * MARGE - 15) / 2
    bas_gauche = _bloc(page, None, valeurs['bon'], MARGE, y, largeur_bloc)
    bas_droit = _bloc(
        page, 'Fournisseur', valeurs['fournisseur'],
        MARGE + largeur_bloc + 15, y, largeur_bloc,
    )
    y = max(bas_gauche, bas_droit) + 12

    _ecrire(page, 'Adresse de Livraison :', MARGE, y + 12, taille=8.5, couleur=GRIS)
    _ecrire(
        page, bon.adresse_livraison, MARGE + 120, y + 12, taille=9,
        largeur=LARGEUR - 2 * MARGE - 130,
    )
    y += 26

    page, y = _lignes(doc, page, valeurs['lignes'], y + 12)
    # Les remarques et les totaux ne se coupent pas : s'il ne reste pas la
    # place, ils vont sur une page à eux.
    if y > HAUTEUR - 170:
        page = doc.new_page(width=LARGEUR, height=HAUTEUR)
        y = MARGE + 20
    _pied(page, bon, y + 6)

    sortie = doc.tobytes()
    doc.close()
    return sortie

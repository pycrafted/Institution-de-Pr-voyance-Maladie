"""
Moteur de liquidation - **il consulte le barème**.

Répartir un frais réel entre la part de l'IPM et le ticket du bénéficiaire,
c'est appliquer trois choses, dans cet ordre :

1. le **taux** de la ligne de barème qui correspond à la clé
   *(société, nature de prestation, type de bénéficiaire)* ;
2. le **plafond** de cette même ligne, s'il y en a un ;
3. l'**arrondi**, au franc le plus proche, le demi-franc vers le haut.

Ce que les données imposent (vérifié sur `lamps_analyse`, cf.
`docs/lamps/regles-liquidation.md`) :

- **Le barème est la seule autorité.** 69 985 des 69 992 lignes de prestation
  réelles tombent sur une ligne de `matrice`, et le taux y est respecté :
  63 517 lignes à 85 quand le barème dit 85, 3 752 à 0 quand il dit 0, 196 à
  100 quand il dit 100. Le reste - 621 lignes, 0,9 % - sont les ajustements du
  liquidateur, qui reste maître acte par acte.
- **Notre barème est celui de LAMPS.** Les 806 lignes de `TauxPriseEnCharge`
  des sociétés 01 à 04 sont identiques à `matrice` : même taux, même plafond,
  même forfait, zéro différence, zéro manquante.
- **Il n'y a pas de taux « retraités ».** Les sociétés 03 et 04 sont à **85 %**
  au barème comme au paiement (2 525 lignes). Le 87 % que ce module appliquait
  n'existe nulle part : sur 68 000 lignes de LAMPS, 87 % apparaît **sept
  fois**. Corrigé le 2026-11-04.
- **Les plafonds comptent.** 26 lignes du barème en portent un, et ce sont les
  plus chères : optique à 100 % plafonnée (175 000 soc 01, 250 000 soc 02),
  accouchement à 100 % plafonné 500 000, actes opératoires et hospitalisation
  mutualiste à 60 % plafonnés 120 000 et 60 000. Les ignorer, c'était jusqu'à
  **54 000 F d'écart sur un seul acte**.
- **L'arrondi est au demi-franc supérieur.** Comparé sur 65 362 lignes :
  demi vers le haut 97,8 %, `round()` de Python (qui arrondit le demi vers le
  pair) 96,0 %, troncature 70,1 %. Les 2,2 % restants sont les ajustements.

Les montants rendus ici sont **proposés** : le liquidateur les corrige acte par
acte, comme dans l'application d'origine. C'est d'ailleurs ce que montrent les
621 lignes qui s'écartent du barème en production.
"""

import math

from parametres.models import TauxPriseEnCharge

# Le taux appliqué quand la clé n'a pas de ligne de barème. C'est le cas de
# **7 lignes sur 69 992** en production, et quatre d'entre elles ont été payées
# à 85 %. Ce n'est donc pas une règle, c'est un filet.
TAUX_DEFAUT = 85

# Types de bénéficiaire non couverts, utilisés **seulement** quand la nature de
# la prestation est inconnue et qu'on ne peut donc pas ouvrir le barème. Le
# barème, lui, est plus fin : il porte 82 lignes pour le type 5 (dont 81 à
# zéro) et 71 pour le type 6 (toutes à zéro).
TYPES_NON_COUVERTS = {'5', '6'}


def arrondi(valeur):
    """Au franc le plus proche, le demi-franc **vers le haut**."""
    return int(math.floor(float(valeur) + 0.5))


def bareme(code_soc, code_prestation, type_benef_code):
    """
    La ligne de barème d'une clé : `(taux, plafond)`.

    Trois champs forment la clé, et il en faut trois : la même prestation n'a
    ni le même taux ni le même plafond d'une société à l'autre (optique :
    100 % plafonné 175 000 en société 01, 250 000 en 02, 85 % sans plafond en
    03), et le type de bénéficiaire change tout (85 % pour un participant,
    0 % pour un ascendant).
    """
    ligne = (
        TauxPriseEnCharge.objects
        .filter(
            adherent__code=str(code_soc or ''),
            prestation__code=str(code_prestation or ''),
            type_benef__code=str(type_benef_code or ''),
        )
        .values('taux', 'plafond')
        .first()
    )
    if not ligne:
        return None, 0
    return int(ligne['taux'] or 0), int(ligne['plafond'] or 0)


def taux_et_plafond(code_soc, code_prestation, type_benef_code):
    """
    Ce que l'IPM prend en charge pour cette clé, filet compris.

    Sans nature de prestation, on ne peut pas ouvrir le barème : on retombe
    alors sur l'ancienne règle, le taux par défaut et les deux types non
    couverts. Cela n'arrive que pour un bon dont le document ne nomme pas sa
    nature.
    """
    if code_prestation:
        taux, plafond = bareme(code_soc, code_prestation, type_benef_code)
        if taux is not None:
            return taux, plafond
    if str(type_benef_code) in TYPES_NON_COUVERTS:
        return 0, 0
    return TAUX_DEFAUT, 0


def liquider(freel, code_soc, type_benef_code, fexclus=0, code_prestation=None):
    """
    Répartit un frais réel en part IPM (`qpipm`) et ticket (`qppart`).

    `fexclus` est la part écartée d'office (hors nomenclature, dépassement) :
    elle ne compte dans aucune des deux, mais reste au frais réel, donc elle
    gonfle le ticket. Le plafond, lui, s'applique **après** le taux : il borne
    ce que l'IPM verse, pas l'assiette.
    """
    freel = max(0, int(freel or 0))
    fexclus = max(0, min(int(fexclus or 0), freel))
    base = freel - fexclus

    taux, plafond = taux_et_plafond(code_soc, code_prestation, type_benef_code)
    qpipm = arrondi(taux * base / 100)
    if plafond:
        qpipm = min(qpipm, plafond)
    qpipm = min(qpipm, freel)
    qppart = freel - qpipm

    return {
        'freel': freel,
        'qpipm': qpipm,
        'qppart': qppart,
        'qpassur': 0,
        'fexclus': fexclus,
        'ajustement': 0,
        # Rendus avec le reste : l'écran peut dire d'où vient le montant plutôt
        # que de le laisser tomber du ciel.
        'taux': taux,
        'plafond': plafond,
    }

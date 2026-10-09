"""
Moteur de liquidation - formule décodée sur les données réelles (cf.
docs/lamps/regles-liquidation.md), en attendant le barème métier (grilles
optique/dentaire, plafond annuel pharmacie).

Règle de base, confirmée sur ~65 000 lignes :
    base   = freel − fexclus
    qpipm  = TAUX × base            (part IPM)
    qppart = freel − qpipm          (ticket : reste à charge)
avec TAUX = 85 % pour les actifs (sociétés 01/02) et 87 % pour les retraités
(03/04). Les bénéficiaires de type 5 (ascendant) et 6 (autre) ne sont pas
couverts (ticket 100 %). Ces montants sont **proposés** ; le liquidateur les
ajuste acte par acte (tranche 3), comme l'application d'origine.
"""

TAUX_ACTIF = 85
TAUX_RETRAITE = 87
SOCIETES_RETRAITE = {'03', '04'}
# Types de bénéficiaire non couverts (ascendant, autre) : ticket 100 %.
TYPES_NON_COUVERTS = {'5', '6'}


def taux_societe(code_soc):
    """Taux de prise en charge IPM selon la société (actifs 85 % / retraités 87 %)."""
    return TAUX_RETRAITE if code_soc in SOCIETES_RETRAITE else TAUX_ACTIF


def liquider(freel, code_soc, type_benef_code, fexclus=0):
    """
    Répartit un frais réel en part IPM (qpipm) et ticket (qppart), selon la
    formule décodée. Renvoie un dict {freel, qpipm, qppart, qpassur, fexclus,
    ajustement}.
    """
    freel = max(0, int(freel or 0))
    fexclus = max(0, min(int(fexclus or 0), freel))
    if str(type_benef_code) in TYPES_NON_COUVERTS:
        qpipm = 0
    else:
        base = freel - fexclus
        qpipm = round(taux_societe(str(code_soc)) * base / 100)
    qppart = freel - qpipm
    return {
        'freel': freel,
        'qpipm': qpipm,
        'qppart': qppart,
        'qpassur': 0,
        'fexclus': fexclus,
        'ajustement': 0,
    }

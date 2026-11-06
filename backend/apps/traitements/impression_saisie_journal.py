# -*- coding: utf-8 -*-
"""
Saisie Journal imprimée - le bouton « Imprimer » de la capture 84.

L'état reprend les colonnes de l'écran, dans le même ordre, et se clôt sur le
même bandeau que lui : `Solde débit` et `Solde crédit`. C'est ce qu'un
comptable emporte pour pointer sa saisie du mois avant de la comptabiliser.

A4 **paysage** : douze colonnes ne tiennent pas en portrait. La mise en page
(en-tête IPM, bandeau de colonnes à l'encre, lignes alternées, total en pied)
est celle de `impression_cotisations`, dont on réemploie la mécanique plutôt
que d'en réécrire une deuxième.
"""

from .impression_cotisations import (
    MOIS_ENTIERS,
    _fr_montant,
    _rendre,
)

# La somme des largeurs tient dans 842 - 2 * 36 = 770.
COLONNES = [
    ('cJl', 'C.JL', 34, 'gauche'),
    ('datePiece', 'Date pièce', 60, 'gauche'),
    ('numPiece', 'N° pièce', 76, 'gauche'),
    ('dateSaisie', 'Date saisie', 60, 'gauche'),
    ('moisTrait', 'Mois trait', 56, 'gauche'),
    ('compteGen', 'Cpte. Gen.', 56, 'gauche'),
    ('compteTiers', 'Cpte. Tiers', 60, 'gauche'),
    ('codeSoc', 'Code soc.', 44, 'gauche'),
    ('libelle', 'Libellé', 152, 'gauche'),
    ('debit', 'Débit', 60, 'droite'),
    ('credit', 'Crédit', 60, 'droite'),
    ('etat', 'Etat', 52, 'gauche'),
]

ABREGES = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]


def _jour(iso):
    """« 2026-11-03 » → « 03/11/2026 ». Les dates arrivent déjà sérialisées."""
    if not iso:
        return ''
    a, m, j = str(iso)[:10].split('-')
    return f'{j}/{m}/{a}'


def _mois(iso):
    """« 2026-11-01 » → « nov.-2026 », comme la colonne « Mois trait »."""
    if not iso:
        return ''
    a, m = str(iso)[:7].split('-')
    return f'{ABREGES[int(m) - 1]}-{a}'


def _lignes(ecritures):
    for e in ecritures:
        yield {
            'cJl': e.get('cJl') or '',
            'datePiece': _jour(e.get('datePiece')),
            'numPiece': e.get('numPiece') or '',
            'dateSaisie': _jour(e.get('dateSaisie')),
            'moisTrait': _mois(e.get('moisTrait')),
            'compteGen': e.get('compteGen') or '',
            'compteTiers': e.get('compteTiers') or '',
            'codeSoc': e.get('codeSoc') or '',
            'libelle': e.get('libelle') or '',
            'debit': _fr_montant(e.get('debit') or 0),
            'credit': _fr_montant(e.get('credit') or 0),
            'etat': e.get('etat') or '',
            '_debit': int(e.get('debit') or 0),
            '_credit': int(e.get('credit') or 0),
        }


def etat_saisie_journal_pdf(ecritures, exercice='', mois='', journal=''):
    """Rend l'état imprimé (bytes PDF) du périmètre affiché à l'écran."""
    periode = ''
    if str(mois).isdigit() and 1 <= int(mois) <= 12:
        periode = MOIS_ENTIERS[int(mois) - 1]
    if str(exercice).isdigit():
        periode = f'{periode} {exercice}'.strip()

    return _rendre(
        COLONNES,
        _lignes(ecritures),
        842, 595,
        'Saisie Journal',
        periode or 'Toutes périodes',
        f'Journal : {journal}' if journal and journal.upper() != 'TOUS' else 'Tous journaux',
        # Les deux soldes, comme le bandeau de l'écran : tant qu'ils sont
        # égaux, la saisie tient. Les imprimer séparément, c'est donner au
        # lecteur le moyen de le vérifier au lieu de le croire sur parole.
        lambda lignes: (
            f'Solde débit : {_fr_montant(sum(l["_debit"] for l in lignes))}    '
            f'Solde crédit : {_fr_montant(sum(l["_credit"] for l in lignes))}'
        ),
    )

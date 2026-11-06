"""
Écritures du remboursement à l'assuré (journaux RIB / RIC / Bx), relevées ligne
à ligne sur la table `compta` de LAMPS - cf. `docs/lamps/comptabilite-factures.md`.

Pour un bon de remboursement (facture « Remboursement ticket »), l'IPM rend au
PARTICIPANT la part qui lui revient (QP.IPM), en deux temps :

  a) comptabilisation (journal **RIB** si banque, **RIC** si compense), une
     paire de lignes PAR PRESTATION :
        Cr 4110+soc (le participant)  /  Dr 602xxx (la prestation) ;
  b) règlement, seulement si payé par la BANQUE (journal **Bx**) :
        Dr 4110+soc (le participant), une ligne par prestation.
     La contrepartie de banque (Cr 521xxx) n'appartient pas à la facture : un
     chèque en règle plusieurs d'un coup, et LAMPS n'écrit qu'UNE ligne 521
     pour tout le chèque. Elle est donc posée par la vue, pas ici.

Relevé de contrôle, facture 106226 de LAMPS (`numfactipm = 106226`) :

    RIB  411001  01-0868  C   4 250     VISITE
    RIB  602000           D   4 250     VISITE
    RIB  411001  01-0868  C  17 000     CONSULTATION  GYNÉCOLOGIE
    RIB  602007           D  17 000     CONSULTATION  GYNÉCOLOGIE
    B7   411001  01-0868  D  17 000     REMBT FRAIS MDCX : BADARA ALY KEITA
    B7   411001  01-0868  D   4 250     REMBT FRAIS MDCX : BADARA ALY KEITA
    B7   521700           C 1 131 155   REMBT FRAIS MDCX PAR CHQ N° : 0002137
                                        (le chèque : 16 factures d'un coup)

Trois points que ce relevé impose, et qu'on avait manqués :
  - le **numéro de pièce est celui de la FACTURE**, pas du bon : les 16 596
    lignes RIB de LAMPS se répartissent sur 6 506 numéros de pièce, soit très
    exactement le nombre de factures de remboursement ;
  - la charge se ventile **par prestation**, sur le compte 602 de chacune
    (602000 VISITE, 602006 PHARMACIE, 602007 GYNÉCOLOGIE...), pas en bloc ;
  - le crédit du participant vient **avant** le débit de la charge.

Différences avec le circuit prestataire (comptabilisation.py) : le tiers est le
**participant** (411+soc), pas le fournisseur (400) ; le journal est RIB/RIC, pas
IF ; seule la **QP.IPM** circule (le ticket reste à la charge de l'agent).
"""

from .comptabilisation import _compte_prestation, _libelle_prestation
from .models import (
    JOURNAL_REMB_BANQUE,
    JOURNAL_REMB_COMPENSE,
    PREFIXE_COMPTE_PARTICIPANT,
    EcritureCompta,
)

# Compte de prestation à défaut, pour un bon sans détail d'actes (bon manuel).
_COMPTE_PRESTATION_DEFAUT = '602000'


def _contexte(bon, date_piece):
    """Les valeurs communes à toutes les écritures d'un bon de remboursement."""
    facture = bon.facture
    return {
        'facture': facture,
        'date_piece': facture.date_facture or date_piece,
        'date_compta': date_piece,
        # Le mois comptable de la FACTURE, recopié tel quel : c'est l'axe du
        # Journal Central, et il ne suit pas la date du jour (facture 106640
        # de LAMPS, réglée le 13 juillet, écritures portées en juin).
        'date_trait': facture.date_trait or date_piece.replace(day=1),
        'numfactipm': str(facture.id),
        'numfourn': facture.fournisseur_code,
        'numdoc': bon.numero,
        'codesoc': bon.code_soc or '',
        'matri': bon.matricule_part.split('-')[-1] if bon.matricule_part else '',
    }


def _par_prestation(bon):
    """
    La part IPM du bon, ventilée par prestation :
    [(compte 602, libellé, montant, frais réel, frais exclus)].

    Un bon rattaché porte son détail acte par acte (`actes`, issu de
    lignesprest) : chaque prestation a son compte de charge et son libellé,
    comme dans LAMPS. Un **bon manuel** n'en a pas - il se saisit en un
    montant global - : on retombe alors sur une seule ligne au compte
    générique, libellée du nom de l'assuré.

    Le frais réel et le frais exclus suivent le même découpage : l'écriture
    les porte, et c'est ce que l'onglet « Charges Techniques » de
    l'Interrogation Compte affiche à côté du débit (capture 77).
    """
    groupes = {}
    for acte in bon.actes or []:
        code = str(acte.get('prestation', ''))
        montant = int(acte.get('qpipm') or 0)
        if montant <= 0:
            continue
        cumul, freel, fexclus = groupes.get(code, (0, 0, 0))
        groupes[code] = (
            cumul + montant,
            freel + int(acte.get('freel') or 0),
            fexclus + int(acte.get('fexclus') or 0),
        )
    if groupes:
        return [
            (_compte_prestation(code), _libelle_prestation(code), montant, freel, fexclus)
            for code, (montant, freel, fexclus) in groupes.items()
        ]
    montant = int(bon.qpipm or 0)
    if montant <= 0:
        return []
    nom = bon.participant or bon.beneficiaire or 'REMBOURSEMENT'
    return [(_COMPTE_PRESTATION_DEFAUT, nom, montant, int(bon.freel or 0), int(bon.fexclus or 0))]


def generer_ecritures_comptabilisation_remboursement(bon, date_compta, depart=0):
    """
    **Premier temps** : la reconnaissance de la dette, au journal RIB ou RIC.

        Cr 411+soc (la dette : l'IPM doit cette part au participant)
        Dr 602xxx  (la charge : la prestation coûte cette part à l'IPM)

    Rien d'autre. Pas de compte 400 - le prestataire a déjà été payé, par
    l'assuré lui-même -, et pas de ticket : il reste à la charge de l'agent,
    qui l'a acquitté au comptoir en avançant plus qu'on ne lui rend.

    Le journal est choisi dès la réception de la facture (case « Mode de
    remboursement ») : **RIB** si l'IPM paiera par la banque, **RIC** si elle
    compense sur le compte de l'agent.
    """
    par_banque = (bon.facture.type_remb or '') == 'banque'
    journal = JOURNAL_REMB_BANQUE if par_banque else JOURNAL_REMB_COMPENSE
    commun = _contexte(bon, date_compta)
    piece = str(bon.facture.id)
    compte_part = f'{PREFIXE_COMPTE_PARTICIPANT}{bon.code_soc or ""}'

    lignes = []
    rang = depart
    total = 0
    for compte_charge, libelle, montant, freel, fexclus in _par_prestation(bon):
        rang += 1
        lignes.append(EcritureCompta(
            rang=rang, codej=journal, numpiece=piece,
            comptegen=compte_part, comptetiers=bon.matricule_part,
            libelle=libelle[:120], debit=0, credit=montant,
            frais_reel=freel, frais_exclus=fexclus, **commun,
        ))
        rang += 1
        lignes.append(EcritureCompta(
            rang=rang, codej=journal, numpiece=piece,
            comptegen=compte_charge, comptetiers='',
            libelle=libelle[:120], debit=montant, credit=0,
            frais_reel=freel, frais_exclus=fexclus, **commun,
        ))
        total += montant
    return lignes, total


def generer_ecritures_reglement_remboursement(bon, banque, numero, date_reglement, depart=0):
    """
    **Second temps** : le paiement, au journal de la banque.

        Dr 411+soc (la dette envers l'agent s'éteint), une ligne par prestation

    La sortie d'argent (Cr 521xxx) n'est PAS ici : elle est unique pour le
    chèque entier, qui règle en général plusieurs assurés d'un coup. C'est la
    vue qui la pose, après la boucle - voir `ligne_banque_du_cheque`.

    En **compensation**, ce temps n'existe pas : aucun argent ne bouge, le
    crédit reste sur le compte de l'agent et viendra en déduction de ce qu'il
    doit. C'est ce que montre LAMPS - les écritures du journal RIC n'ont
    jamais de ligne de banque.
    """
    if (bon.facture.type_remb or '') != 'banque' or banque is None:
        return [], 0

    commun = _contexte(bon, date_reglement)
    piece = str(bon.facture.id)
    compte_part = f'{PREFIXE_COMPTE_PARTICIPANT}{bon.code_soc or ""}'
    nom = bon.participant or bon.beneficiaire or ''
    libelle = f'REMBT FRAIS MDCX : {nom}'[:120]

    lignes = []
    rang = depart
    total = 0
    for _compte_charge, _libelle, montant, _freel, _fexclus in _par_prestation(bon):
        rang += 1
        lignes.append(EcritureCompta(
            rang=rang, codej=banque.code, numpiece=piece, numcheque=numero,
            comptegen=compte_part, comptetiers=bon.matricule_part,
            libelle=libelle, debit=montant, credit=0, **commun,
        ))
        total += montant
    return lignes, total


def ligne_banque_du_cheque(banque, numero, date_reglement, total, rang=0):
    """
    La sortie d'argent, **une seule ligne pour tout le chèque** :

        Cr 521xxx  (le compte de la banque émettrice)

    Elle ne se rattache à aucune facture - son numéro de pièce est celui du
    chèque, pas d'une facture - parce qu'un même chèque solde plusieurs
    assurés. Dans LAMPS, le chèque 0002137 porte ainsi 16 factures au débit
    des comptes 411 et une unique ligne 521700 de 1 131 155 au crédit.
    """
    if banque is None or total <= 0:
        return None
    return EcritureCompta(
        facture=None, rang=rang, codej=banque.code,
        date_piece=date_reglement, date_compta=date_reglement,
        # Pas de facture derrière cette ligne : son mois est celui du chèque.
        date_trait=date_reglement.replace(day=1),
        numpiece=numero, numcheque=numero,
        comptegen=banque.compte or '521000', comptetiers='',
        libelle=f'REMBT FRAIS MDCX PAR CHQ N° : {numero}'[:120],
        debit=0, credit=total,
    )

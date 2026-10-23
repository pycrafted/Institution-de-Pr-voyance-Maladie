"""
Écritures du remboursement à l'assuré (journaux RIB / RIC / Bx), décodées sur la
table `compta` de LAMPS - cf. `docs/lamps/comptabilite-factures.md` Phase 3.

Pour un bon de remboursement (bon manuel sur une facture « Remboursement
ticket »), l'IPM rembourse au PARTICIPANT sa part (QP.IPM) :

  a) comptabilisation (journal **RIB** si banque, **RIC** si compense) :
        Dr 602xxx (prestation, QP.IPM)  /  Cr 4110+soc (le participant) ;
  b) règlement, seulement si payé par la BANQUE (journal **Bx** de la banque) :
        Dr 4110+soc (participant)  /  Cr 521xxx (banque).

La compensation s'arrête à (a) : le crédit 411 du participant se compense ailleurs
(cotisation / ticket futur), sans sortie de trésorerie.

Différences avec le circuit prestataire (comptabilisation.py) : le tiers est le
**participant** (411+soc), pas le fournisseur (400) ; le journal est RIB/RIC, pas
IF ; seule la **QP.IPM** circule (le ticket reste à la charge de l'agent).
"""

from .models import (
    JOURNAL_REMB_BANQUE,
    JOURNAL_REMB_COMPENSE,
    PREFIXE_COMPTE_PARTICIPANT,
    EcritureCompta,
)

# Faute de nature d'acte sur un bon manuel, la charge va au compte de prestation
# générique (602000), comme le fait LAMPS pour ces lignes RIB sans détail.
_COMPTE_PRESTATION_DEFAUT = '602000'


def generer_ecritures_remboursement(bon, banque, numero, date_reglement):
    """
    Construit (sans enregistrer) les écritures de remboursement d'un bon et le
    montant remboursé (QP.IPM). `banque` est l'instance Banque, ou None en
    compensation. Retourne (lignes, montant).
    """
    facture = bon.facture
    par_banque = (facture.type_remb or '') == 'banque' and banque is not None
    journal_compta = JOURNAL_REMB_BANQUE if par_banque else JOURNAL_REMB_COMPENSE
    soc = bon.code_soc or ''
    matri = bon.matricule_part.split('-')[-1] if bon.matricule_part else ''
    compte_part = f'{PREFIXE_COMPTE_PARTICIPANT}{soc}'
    montant = int(bon.qpipm or 0)
    nom = bon.beneficiaire or bon.participant or ''

    commun = {
        'facture': facture,
        'date_piece': facture.date_facture or date_reglement,
        'date_compta': date_reglement,
        'numfactipm': str(facture.id),
        'numfourn': facture.fournisseur_code,
        'numdoc': bon.numero,
        'codesoc': soc,
        'matri': matri,
    }
    lignes = []
    rang = 0

    # a) Comptabilisation (RIB / RIC) : Dr 602 (QP.IPM) / Cr 411 participant.
    rang += 1
    lignes.append(EcritureCompta(
        rang=rang, codej=journal_compta, numpiece=bon.numero,
        comptegen=_COMPTE_PRESTATION_DEFAUT, comptetiers='',
        libelle=(nom or 'REMBOURSEMENT')[:120], debit=montant, credit=0, **commun,
    ))
    rang += 1
    lignes.append(EcritureCompta(
        rang=rang, codej=journal_compta, numpiece=bon.numero,
        comptegen=compte_part, comptetiers=bon.matricule_part,
        libelle=(nom or 'REMBOURSEMENT')[:120], debit=0, credit=montant, **commun,
    ))

    # b) Règlement banque (journal Bx) : Dr 411 participant / Cr 521 banque.
    if par_banque:
        compte_banque = banque.compte or '521000'
        rang += 1
        lignes.append(EcritureCompta(
            rang=rang, codej=banque.code, numpiece=numero,
            comptegen=compte_part, comptetiers=bon.matricule_part,
            libelle=f'REMBT FRAIS MDCX : {nom}'[:120], debit=montant, credit=0, **commun,
        ))
        rang += 1
        lignes.append(EcritureCompta(
            rang=rang, codej=banque.code, numpiece=numero,
            comptegen=compte_banque, comptetiers='',
            libelle=f'REMBT FRAIS MDCX PAR CHQ N° : {numero}'[:120], debit=0, credit=montant, **commun,
        ))
    return lignes, montant

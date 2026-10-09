"""
Comptabilisation d'une facture de soins - écritures du journal IF, au modèle de
l'application d'origine (table `compta`, décodée sur les données réelles).

Pour une facture validée :
  - le **fournisseur** est **crédité** du total, sur le compte de sa spécialité
    (ex. 400006 PHARMACIES), tiers = son code ;
  - chaque **bon** débite, par prestation, le **compte de prestation** (602xxx)
    de la **part IPM** (QP.IPM), et le **compte participant** (« 4110 » + société,
    ex. 411003) du **ticket** (QP.PART), tiers = société-matricule.
L'ensemble est équilibré (Σ débits = Σ crédit = total des bons).

Les factures « divers » (administratives) suivent un autre circuit, non décodé :
leur comptabilisation reste à faire (cf. vue).
"""

from datetime import date

from donnees_de_base.models import TypePrestation

from .models import (
    JOURNAL_IMPUTATION,
    PREFIXE_COMPTE_PARTICIPANT,
    EcritureCompta,
)

# Compte des prestations à défaut (602 + code) ; compte d'assurance (QP.Assur).
_COMPTE_PRESTATION_DEFAUT = '602000'
_COMPTE_ASSURANCE = '467000'


def _prestation(code):
    return TypePrestation.objects.filter(code=code).first()


def _compte_prestation(code):
    presta = _prestation(code)
    if presta and presta.compte:
        return presta.compte
    return f'6020{code}' if code else _COMPTE_PRESTATION_DEFAUT


def _libelle_prestation(code):
    presta = _prestation(code)
    return presta.libelle if presta else (code or 'PRESTATION')


def generer_ecritures(facture):
    """Construit (sans enregistrer) les écritures d'une facture de soins, et le total."""
    specialite = facture.specialite
    compte_fournisseur = specialite.compte if (specialite and specialite.compte) else '400000'
    code_fournisseur = facture.fournisseur_code
    nom_fournisseur = (
        facture.fournisseur_soins.libelle if facture.fournisseur_soins_id else ''
    )
    aujourdhui = date.today()

    commun = {
        'codej': JOURNAL_IMPUTATION,
        'date_piece': facture.date_facture,
        'date_compta': aujourdhui,
        'numfactfrs': facture.numero_fournisseur,
        'numfactipm': str(facture.id),
        'numfourn': code_fournisseur,
    }

    lignes = []
    rang = 0
    total = 0

    for liq in facture.bons.all():
        soc = liq.code_soc or ''
        matri = liq.matricule_part.split('-')[-1] if liq.matricule_part else ''
        # Part IPM groupée par prestation ; ticket et assurance cumulés.
        par_prestation = {}
        qppart = 0
        qpassur = 0
        for acte in liq.actes or []:
            code_presta = str(acte.get('prestation', ''))
            par_prestation[code_presta] = par_prestation.get(code_presta, 0) + int(
                acte.get('qpipm') or 0
            )
            qppart += int(acte.get('qppart') or 0)
            qpassur += int(acte.get('qpassur') or 0)
        # Bon rattaché sans détail d'actes : on retombe sur ses agrégats.
        if not liq.actes:
            par_prestation[''] = liq.qpipm
            qppart = liq.qppart
            qpassur = liq.qpassur

        # Débit : part IPM, par prestation (compte 602xxx).
        for code_presta, qpipm in par_prestation.items():
            if qpipm <= 0:
                continue
            rang += 1
            lignes.append(
                EcritureCompta(
                    facture=facture, rang=rang,
                    numpiece=liq.numero, numdoc=liq.numero,
                    comptegen=_compte_prestation(code_presta), comptetiers='',
                    libelle=_libelle_prestation(code_presta),
                    debit=qpipm, credit=0,
                    codesoc=soc, matri=matri, **commun,
                )
            )
            total += qpipm

        # Débit : ticket (compte participant « 4110 » + société).
        if qppart > 0:
            rang += 1
            lignes.append(
                EcritureCompta(
                    facture=facture, rang=rang,
                    numpiece=liq.numero, numdoc=liq.numero,
                    comptegen=f'{PREFIXE_COMPTE_PARTICIPANT}{soc}',
                    comptetiers=liq.matricule_part,
                    libelle='TICKET MODERATEUR',
                    debit=qppart, credit=0,
                    codesoc=soc, matri=matri, **commun,
                )
            )
            total += qppart

        # Débit : quote-part assurance (rare).
        if qpassur > 0:
            rang += 1
            lignes.append(
                EcritureCompta(
                    facture=facture, rang=rang,
                    numpiece=liq.numero, numdoc=liq.numero,
                    comptegen=_COMPTE_ASSURANCE, comptetiers='',
                    libelle='QUOTE PART ASSURANCE',
                    debit=qpassur, credit=0,
                    codesoc=soc, matri=matri, **commun,
                )
            )
            total += qpassur

    # Crédit : le fournisseur, du total (compte de sa spécialité).
    rang += 1
    lignes.append(
        EcritureCompta(
            facture=facture, rang=rang,
            numpiece=str(facture.id),
            comptegen=compte_fournisseur, comptetiers=code_fournisseur,
            libelle=f'FACT N° {facture.id} : {nom_fournisseur}'[:120],
            debit=0, credit=total,
            codesoc=(facture.adherent.code if facture.adherent_id else ''),
            **commun,
        )
    )
    return lignes, total

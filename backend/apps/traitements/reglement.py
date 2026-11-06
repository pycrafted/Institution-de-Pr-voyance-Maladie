"""
Écritures du règlement d'une facture fournisseur (journaux B1..B10), relevées
sur la table `compta` de LAMPS et sur sa capture 60 (« Aperçu écritures au
journal »).

C'est le troisième et dernier temps du tiers payant :

  1. liquidation      -> ce que l'IPM prend en charge ;
  2. comptabilisation -> journal IF : Dr 602xxx la charge, Dr 411+soc le
     ticket, **Cr 400xxx le fournisseur** (la dette naît) ;
  3. **règlement**    -> journal **Bx** de la banque : **Dr 400xxx** (la dette
     s'éteint) / **Cr 521xxx** (l'argent sort).

Relevé de contrôle, facture **106685** (optique, ALAIN AFFLELOU, 209 535) :

    IF  602004          piece=BCI000842   D 209535           OPTIQUE
    IF  400004  0414    piece=106685              C 209535   FACT N° 106685 : ALAIN AFFLELOU
    B2  400004  0414    piece=106685      D 209535           RGLMT FACT N° : 106685 / ALAIN AFFLELOU
    B2  521200          piece=8917862             C ...      RGLMT FACT N° :  106671 106676 ...  / ALAIN AFFLELOU

Quatre règles que ce relevé impose :

  - **une ligne fournisseur par facture**, numéro de pièce = la facture ;
  - **une seule ligne de banque par fournisseur réglé**, numéro de pièce = le
    **chèque**, et son libellé énumère les factures payées. Un chèque solde
    plusieurs factures : le 8917862 en a payé onze ;
  - le **mois comptable reste celui de la facture**, jamais celui du paiement.
    La facture 106685 est réglée le 13 juillet, l'écriture est passée le
    21 septembre, et les deux lignes portent **juillet** - le mois de la
    facture. La capture 60 le montre plus crûment encore : réglée en 2026,
    comptabilisée le 09/10/26, mois de traitement **juin-2024** ;
  - **annuler un règlement ne supprime rien** : LAMPS repose les deux lignes
    en **négatif, du même côté**, libellées « ANNULATION RGLMT FACT N° : … ».
    Sur les 1 024 écritures négatives de la base, 47 sont de ce type.

La banque n'est demandée dans aucune des captures du modal de règlement
(52, 53, 54). Elle suit la société - 01 paie par B1 ou B7, 02 par B2 ou B8,
03 par B6, 04 par B10 - mais chacune en a deux, donc elle se choisit. Nous la
demandons au second geste, celui qui comptabilise, là où elle sert.
"""

from .models import EcritureCompta

# Compte fournisseur à défaut, quand la spécialité n'en porte pas.
_COMPTE_FOURNISSEUR_DEFAUT = '400000'


def _fournisseur(facture):
    """Le compte, le code et le nom du fournisseur de la facture."""
    if facture.type_fournisseur == 'divers':
        divers = facture.fournisseur_divers if facture.fournisseur_divers_id else None
        # Chez un fournisseur divers, le code EST le compte (401019).
        compte = (divers.code if divers else '') or '401000'
        return compte, (divers.code if divers else ''), (divers.libelle if divers else '')
    specialite = facture.specialite
    compte = specialite.compte if (specialite and specialite.compte) else _COMPTE_FOURNISSEUR_DEFAUT
    nom = facture.fournisseur_soins.libelle if facture.fournisseur_soins_id else ''
    return compte, facture.fournisseur_code, nom


def _montant_regle(facture):
    """Ce que le règlement fait sortir : le montant réglé, acompte compris."""
    return int(facture.montant_reglement or 0)


def generer_ecritures_reglement(factures, banque, date_compta):
    """
    Construit (sans enregistrer) les écritures du règlement d'un lot de
    factures, dans l'ordre de LAMPS : les lignes fournisseur d'abord, la ligne
    de banque de chacun ensuite.

    Les factures sont regroupées **par fournisseur** : un libellé de banque ne
    nomme jamais deux fournisseurs. Le chèque 0000059 de LAMPS, qui en payait
    deux, porte bien deux lignes 521.
    """
    if banque is None:
        return [], 0

    compte_banque = banque.compte or '521000'
    lignes = []
    rang = 0
    total = 0
    # {code fournisseur: [compte, nom, montant, [n° factures], mois comptable]}
    par_fournisseur = {}

    for facture in factures:
        montant = _montant_regle(facture)
        if montant <= 0:
            continue
        compte, code, nom = _fournisseur(facture)
        numero = facture.numero_reglement or ''
        rang += 1
        lignes.append(EcritureCompta(
            facture=facture, rang=rang, codej=banque.code,
            date_piece=facture.date_reglement, date_compta=date_compta,
            date_trait=facture.date_trait,
            numpiece=str(facture.id), numcheque=numero,
            comptegen=compte, comptetiers=code,
            libelle=f'RGLMT FACT N° : {facture.id} / {nom}'[:120],
            debit=montant, credit=0,
            numfactfrs=facture.numero_fournisseur, numfactipm=str(facture.id),
            numfourn=facture.fournisseur_code,
            codesoc=(facture.adherent.code if facture.adherent_id else ''),
        ))
        total += montant

        lot = par_fournisseur.setdefault(
            code, {'nom': nom, 'montant': 0, 'factures': [], 'numero': numero,
                   'date_trait': facture.date_trait, 'date_piece': facture.date_reglement}
        )
        lot['montant'] += montant
        lot['factures'].append(str(facture.id))

    # La sortie d'argent : une ligne par fournisseur réglé, au numéro du chèque.
    for code, lot in par_fournisseur.items():
        rang += 1
        numeros = ' '.join(lot['factures'])
        lignes.append(EcritureCompta(
            facture=None, rang=rang, codej=banque.code,
            date_piece=lot['date_piece'], date_compta=date_compta,
            date_trait=lot['date_trait'],
            numpiece=lot['numero'], numcheque=lot['numero'],
            comptegen=compte_banque, comptetiers='',
            libelle=f"RGLMT FACT N° :  {numeros}  / {lot['nom']}"[:120],
            debit=0, credit=lot['montant'],
            numfourn=code,
        ))
    return lignes, total


def generer_ecritures_annulation_reglement(facture):
    """
    Annule le règlement **sans rien effacer** : chaque écriture du règlement
    est reposée à l'identique, montant négatif, du même côté.

    C'est la manière de LAMPS, et elle se défend : une écriture passée ne
    disparaît pas, sinon le journal ment sur ce qui s'est réellement fait. Le
    solde revient au même point, la trace reste.

    La ligne de banque n'appartient à aucune facture (elle en solde
    plusieurs) : on ne contre-passe donc que la part de celle-ci, au compte de
    banque que le règlement a utilisé.
    """
    # `debit__gt=0` : on ne contre-passe pas une contre-passation, si le
    # règlement a déjà été annulé puis repassé.
    ecritures = list(
        facture.ecritures.filter(
            codej=facture.banque_reglement, debit__gt=0
        ).order_by('rang')
    ) if facture.banque_reglement else []
    if not ecritures:
        return []

    _compte, _code, nom = _fournisseur(facture)
    libelle = f'ANNULATION RGLMT FACT N° : {facture.id} / {nom}'[:120]
    rang = max(e.rang for e in ecritures)
    contre = []
    for source in ecritures:
        rang += 1
        contre.append(EcritureCompta(
            facture=facture, rang=rang, codej=source.codej,
            date_piece=source.date_piece, date_compta=source.date_compta,
            date_trait=source.date_trait,
            numpiece=source.numpiece, numcheque=source.numcheque,
            comptegen=source.comptegen, comptetiers=source.comptetiers,
            libelle=libelle,
            debit=-source.debit, credit=-source.credit,
            numfactfrs=source.numfactfrs, numfactipm=source.numfactipm,
            numfourn=source.numfourn, codesoc=source.codesoc,
        ))

    # La contrepartie de banque : la part de cette facture dans le chèque.
    montant = _montant_regle(facture)
    rang += 1
    contre.append(EcritureCompta(
        facture=facture, rang=rang, codej=facture.banque_reglement,
        date_piece=facture.date_reglement, date_compta=facture.date_compta,
        date_trait=facture.date_trait,
        numpiece=facture.numero_reglement, numcheque=facture.numero_reglement,
        comptegen=_compte_banque_du_reglement(facture), comptetiers='',
        libelle=libelle, debit=0, credit=-montant,
        numfourn=facture.fournisseur_code,
    ))
    return contre


def _compte_banque_du_reglement(facture):
    """Le compte 521xxx de la banque qui a payé, retrouvé sur son journal."""
    from .models import Banque

    banque = Banque.objects.filter(code=facture.banque_reglement).first()
    return (banque.compte if banque else '') or '521000'

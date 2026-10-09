"""
Les journaux comptables repris à l'identique de l'application d'origine.

Le jeu précédent était en partie inventé : caisses « siège » / « antenne nord »,
journaux d'achat AC, banques B11/B12/B13, cotisations C1/C2/C3 en comptes
431xxx, retenues R1/R2, transferts T1/T2, « ventes » V1/V2/V3, clôture ZZ… et un
journal IF typé ACHAT. La table `journaux` de LAMPS dit autre chose, vérifiée
sur le dump : 32 journaux précis, IF de type **RETENUE**, cotisations en comptes
de produits **701xxx**, banques **B1 à B10** (521xxx), et beaucoup de journaux
sans type ni compte (remboursements, salaires, ordre de paiement, avoir).

Cette migration aligne la base sur ces 32 journaux : chaque journal réel est
créé ou mis à jour, et les journaux inventés qui ne s'y trouvent pas sont
supprimés. Aucun document ne référence un code journal (la comptabilisation
n'est pas encore implémentée), la substitution est donc sans effet de bord.
"""

from django.db import migrations

JOURNAUX = [
    ('IF', 'IMPUTATION FACTURE', 'RETENUE', ''),
    ('RAN', 'REPORT A NOUVEAU', 'REPORT', ''),
    ('RIB', 'REMBOURSEMENT PAR BANQUE', '', ''),
    ('RIC', 'REMBOURSEMENT PAR COMPENSE', '', ''),
    ('OM', 'ORANGE MONEY', 'TRANSFERT', '571200'),
    ('RP', 'REMBT FRAIS MEDICAUX PARTICIPANT', '', ''),
    ('SAL', 'JOURNAL DES SALAIRES', '', ''),
    ('RA', 'JOURNAL DES REMBOURSEMENTS ASSURANCES', '', ''),
    ('02', 'JOURNAL CAISSE LOCALE', 'CAISSE', '571000'),
    ('OD', 'JOURNAL DES OPERATIONS DIVERSES', '', ''),
    ('FG', 'JOURNAL DES FRAIS GENERAUX', 'ACHAT', ''),
    ('OP', 'ORDRE DE PAIEMENT', '', ''),
    ('C500', 'COTISATION SALARIALE IPM', 'COTISATION', '701500'),
    ('C510', 'COTISATION SALARIALE CSM', 'COTISATION', '701510'),
    ('C530', 'COTISATION SALARIALE CMMC', 'COTISATION', '701530'),
    ('C651', 'COTISATION CMMCR', 'COTISATION', '701651'),
    ('C662', 'COTISATION MSRNC-SAR', 'COTISATION', '701662'),
    ('C900', 'COTISATION PATRONALE IPM', 'COTISATION', '701900'),
    ('C910', 'COTISATION PATRONALE CSM', 'COTISATION', '701910'),
    ('C920', 'COTISATION PATRONALE CSM', 'COTISATION', '701920'),
    ('C930', 'COTISATION PATRONALE CMMC', 'COTISATION', '701930'),
    ('B1', 'CREDIT DU SENEGAL IPM', 'BANQUE', '521100'),
    ('B2', 'CREDIT DU SENEGAL CMMC', 'BANQUE', '521200'),
    ('B3', 'CREDIT DU SENEGAL CSM', 'BANQUE', '521300'),
    ('B4', 'ECOBANK IPM', 'BANQUE', '521400'),
    ('B5', 'ECOBANK CMMC', 'BANQUE', '521500'),
    ('B6', 'CREDIT DU SENEGAL CMMCR-SAR', 'BANQUE', '521600'),
    ('B7', 'ECOBANK IPM FONCTIONNEMENT', 'BANQUE', '521700'),
    ('B8', 'ECOBANK CMMC FONCTIONNEMENT', 'BANQUE', '521800'),
    ('B9', 'ECOBANK CSM', 'BANQUE', '521900'),
    ('B10', 'ECOBANK MSRNC', 'BANQUE', '521610'),
    ('AV', 'JOURNAL AVOIR', '', ''),
]


def poser_journaux_reels(apps, _schema_editor):
    JournalComptable = apps.get_model('donnees_de_base', 'JournalComptable')
    codes_reels = {code for code, *_ in JOURNAUX}
    for code, libelle, type_, compte in JOURNAUX:
        JournalComptable.objects.update_or_create(
            code=code,
            defaults={'libelle': libelle, 'type': type_, 'compte': compte, 'actif': True},
        )
    # Les journaux inventés qui ne sont pas dans la table d'origine disparaissent.
    JournalComptable.objects.exclude(code__in=codes_reels).delete()


class Migration(migrations.Migration):
    dependencies = [('donnees_de_base', '0017_journal_code_quatre_caracteres')]

    operations = [migrations.RunPython(poser_journaux_reels, migrations.RunPython.noop)]

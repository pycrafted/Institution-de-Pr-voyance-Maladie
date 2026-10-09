"""
Spécialités, types de prestations et fournisseurs divers repris à l'identique de
LAMPS.

Source : le plan comptable réel de l'application d'origine (table `plancompta`,
extraite du dump en UTF-8). Les comptes 400xx portent les spécialités, 602xx les
natures de prestation, 401xxx les fournisseurs divers - avec leurs intitulés
exacts, accents compris, et leur numérotation réelle (qui a des trous : pas de
spécialité 24 ni 29, saut de 23 à 25, etc.).

Le jeu précédent était générique (00..29 inventés). On réaligne :
  - spécialités : 37 réelles. Les fiches démo portant une spécialité hors-LAMPS
    (24, 29, 30, 31) sont d'abord rebasculées sur « 40 - AUTRES FOURNISSEURS »,
    puis ces spécialités disparaissent - aucune clé étrangère ne casse ;
  - prestations : 63 réelles (toutes les anciennes existent chez LAMPS, donc les
    taux du barème restent valides : on met à jour et on complète) ;
  - fournisseurs divers : 16 réels (avec adresse, téléphone, email), le reste
    (démo) est retiré.
"""

from django.db import migrations

SPECIALITES = [
    ('00', 'GENERALISTES'),
    ('01', 'BIOLOGISTES'),
    ('02', 'RADIOLOGUES'),
    ('03', 'HOPITAUX'),
    ('04', 'OPTIQUE MEDICALE'),
    ('05', 'CHIRURGIENS DENTISTES'),
    ('06', 'PHARMACIES'),
    ('07', 'GYNECOLOGUES'),
    ('08', 'CLINIQUES'),
    ('09', 'PEDIATRES'),
    ('10', 'DERMATOLOGUES'),
    ('11', 'CARDIOLOGUES'),
    ('12', 'GASTEROLOGUES'),
    ('13', 'OPHTALMOLOGUES'),
    ('14', 'ALLERGOLOGUES'),
    ('15', 'ORL'),
    ('16', 'CHIRURGIENS'),
    ('17', 'TRANSPORT DE MALADES'),
    ('18', 'NEUROLOGUES'),
    ('19', 'RHUMATOLOGUES/ORTHOPEDISTES'),
    ('20', 'UROLOGUES'),
    ('21', 'PNEUMOLOGUES'),
    ('22', 'ORTHOPHONISTE'),
    ('23', 'PODOLOGUES'),
    ('25', 'ONCOLOGUES'),
    ('26', 'ORTHOPEDISTES'),
    ('27', 'ENDOCRINOLOGUES'),
    ('28', 'PSYCHIATRES'),
    ('40', 'AUTRES FOURNISSEURS'),
    ('47', 'KINESITHERAPEUTES'),
    ('49', 'ETHIOPATHES'),
    ('51', 'NEPHROLOGUES'),
    ('52', 'DIALYSE'),
    ('53', 'AUDIOPROTHESISTE'),
    ('54', 'CENTRES DE SANTE'),
    ('98', 'VALIDATION IPM'),
    ('99', 'FOURN. DIVERS SOINS MDX'),
]

PRESTATIONS = [
    ('00', 'VISITE'),
    ('01', 'ANALYSES BIO-MEDICALES'),
    ('02', 'RADIOLOGIE'),
    ('03', 'SEJOUR HOSPITAL-CLINIQUE'),
    ('04', 'OPTIQUE'),
    ('05', 'CONSULTATION DENTAIRE'),
    ('06', 'PHARMACIE'),
    ('07', 'CONSULTATION GYNÉCOLOGIE'),
    ('08', 'ACCOUCHEMENT-MATERNITE'),
    ('09', 'CONSULTATION PÉDIATRIE'),
    ('10', 'CONSULTATION DERMATOLOGIE'),
    ('11', 'CONSULTATION CARDIOLOGIE'),
    ('12', 'CONSULTATION GASTROLOGIE-ENDOSCOPIE'),
    ('13', 'CONSULTATION OPHTALMOLOGIE'),
    ('14', 'ECHOGRAPHIE'),
    ('15', 'CONSULTATION O.R.L'),
    ('16', 'CONSULTATION CHIRURGIE'),
    ('17', 'TRANSPORT MALADES'),
    ('18', 'CONSULTATION NEUROLOGIE'),
    ('19', 'CONSULTATION RHUMATOLOGIE/ORTHOPEDIE'),
    ('20', 'CONSULTATION UROLOGIE'),
    ('21', 'CONSULTATION PNEUMO-ALLERGOLOGIE'),
    ('22', 'SCANNER'),
    ('23', 'EVACUATION SANITAIRE EXT.'),
    ('24', 'IRM'),
    ('25', 'CONSULTATION ONCOLOGIE'),
    ('26', 'CONSULTATION ORTHOPEDIE'),
    ('27', 'ENDOCRINOLOGIE'),
    ('28', 'CONSULTATION PSYCHIATRIE'),
    ('29', 'NEO NATALOGIE'),
    ('30', 'SOINS GENERALISTES'),
    ('31', 'SOINS DENTAIRES'),
    ('32', 'SOINS / GYNECOLOGIE'),
    ('33', 'SOINS / PEDIATRIE'),
    ('34', 'SOINS / DERMATOLOGIE'),
    ('35', 'SOINS CARDIOLOGIE'),
    ('36', 'SOINS / GASTROLOGIE - ENDOSCOPIE'),
    ('37', 'SOINS / OPHTALMOLOGIE'),
    ('38', 'SOINS / NEUROLOGIE'),
    ('39', 'SOINS / RHUMATOLOGIE'),
    ('40', 'SOINS / UROLOGIE'),
    ('41', 'SOINS / PNEUMO-ALLERGOLOGIE'),
    ('42', 'SOINS / PSYCHIATRIE'),
    ('43', 'SOINS / O.R.L.'),
    ('44', 'ACTES OPERATOIRES'),
    ('45', 'SEANCES D’ORTHOPHONIE'),
    ('46', 'SOINS ONCOLOGIE'),
    ('47', 'SEANCES DE KINESI'),
    ('48', 'CONSULTATION ORTHOPHONIE'),
    ('49', 'CONSULTATION ETIOPATHIE'),
    ('50', 'CONSULTATION PODOLOGIE'),
    ('51', 'CONSULTATION NEPHROLOGIE'),
    ('52', 'SEANCES DE DIALYSE'),
    ('53', 'AUDIOPROTHESISTE'),
    ('54', 'HEMATOLOGIE'),
    ('55', 'HOSPITALISATION ADHERENT MUTUELLE'),
    ('56', 'consultation'),
    ('57', 'SEANCES DE KINESI'),
    ('58', 'SEANCES DE REEDUCATION'),
    ('59', 'MAMMOGRAPHIE'),
    ('91', 'FACTURES A RECEVOIR IPM'),
    ('92', 'FACTURES A RECEVOIR CMMC'),
    ('99', 'SOINS DIVERS'),
]

DIVERS = [
    ('401001', 'RECEVEUR DES POSTES / DAKAR COLIS POSTAUX', 'AVENUE MALICK SY / DAKAR', '', ''),
    ('401003', 'SENEGALAISE DE LIMPRIMERIE', '51 RUE ST MICHEL EX DR. THEZE', '', ''),
    ('401004', 'B.I.C. BUREAUTIQUE', '21 RUE MOUSSE X ESCARFAIT', '', ''),
    ('401005', 'IMPRIMERIE SAINT - PAUL', '4, RUE ELH MBAYE GUEYE X RUE ST -MICHEL DAKAR', '', ''),
    ('401006', 'A2SM INFORMATIQUE', 'KM 3,5 BLD DU CENTENAIRE DAKAR', '', ''),
    ('401007', 'G-DIS/ GALAS DISTRIBUTION INTERNATIONALE ET SERVICES', 'USINE BEN TALLY VILLA N2469 BP 10892 HLM5 DAKAR', '', ''),
    ('401008', 'BUROTIC DIFFUSION', 'RUE HUART X A. Le DANTEC BP 3749 - DAKAR', '', ''),
    ('401011', 'SONATEL', '', '', ''),
    ('401012', 'MASTER OFFICE /ESPACE SA', '27, Avenue G. POMPIDOU - DAKAR', '', 'senelec@orange.sn'),
    ('401014', 'SDE', 'Centre de Hann, Route du Front de Terre, BP : 224 Dakar (Sénégal)', '338393705', 'eau@sde.sn'),
    ('401015', 'SENELEC', '28, rue Vincens, BP 93 Dakar; Sénégal', '', ''),
    ('401017', 'SENEGALAISE DE DISTRIBUTION ET D’IMPRESSION', 'LIBERTE 6 EXT VILLA 35', '', ''),
    ('401018', 'IMPRIMERIE MBOUP ET FILS', 'GUEDIAWAYE DAKAR', '', ''),
    ('401019', 'SIPREX SARL', '48 RUE MOUHAMED V', '', 'siprex@orange.sn'),
    ('401020', 'AMERICAN HOSPITAL OF PARIS', '63, boulevard victor hugo', '', 'information@ahparis.org'),
    ('401021', 'GUSTAVE ROUSS', '114, RUE EDOUARD-VAILLANT 94805 VILLE JUIF CEDEX-FRANCE', '', 'pascale.le-collen@gustavetoussy.fr'),]

SPE_DEFAUT = '40'  # AUTRES FOURNISSEURS - refuge des fiches démo hors-LAMPS


def aligner(apps, _schema):
    Specialite = apps.get_model('donnees_de_base', 'Specialite')
    TypePrestation = apps.get_model('donnees_de_base', 'TypePrestation')
    FournisseurDivers = apps.get_model('donnees_de_base', 'FournisseurDivers')
    FournisseurDeSoins = apps.get_model('donnees_de_base', 'FournisseurDeSoins')
    DemandeAgrement = apps.get_model('donnees_de_base', 'DemandeAgrement')

    codes_spe = {c for c, _ in SPECIALITES}

    # 1. La spécialité refuge doit exister avant toute réassignation.
    refuge, _ = Specialite.objects.update_or_create(
        code=SPE_DEFAUT,
        defaults={'libelle': dict(SPECIALITES)[SPE_DEFAUT], 'compte': '4000' + SPE_DEFAUT, 'actif': True},
    )
    # 2. Rebasculer les fiches démo portant une spécialité hors-LAMPS.
    for modele in (FournisseurDeSoins, DemandeAgrement):
        for fiche in modele.objects.exclude(specialite=None).select_related('specialite'):
            if fiche.specialite.code not in codes_spe:
                fiche.specialite = refuge
                fiche.save(update_fields=['specialite'])
    # 3. Poser les 37 spécialités réelles.
    for code, libelle in SPECIALITES:
        Specialite.objects.update_or_create(
            code=code, defaults={'libelle': libelle, 'compte': '4000' + code, 'actif': True})
    # 4. Retirer les spécialités hors-LAMPS (désormais inutilisées).
    Specialite.objects.exclude(code__in=codes_spe).delete()

    # 5. Prestations : poser les 63 réelles.
    codes_prest = {c for c, _ in PRESTATIONS}
    for code, libelle in PRESTATIONS:
        TypePrestation.objects.update_or_create(
            code=code, defaults={'libelle': libelle, 'compte': '6020' + code, 'actif': True})
    # Retirer celles hors-LAMPS si aucune n'est référencée (taux/médicaments).
    for p in TypePrestation.objects.exclude(code__in=codes_prest):
        try:
            p.delete()
        except Exception:
            pass  # référencée : on la laisse plutôt que de casser une clé

    # 6. Fournisseurs divers : poser les 16 réels, retirer le reste.
    codes_div = {c for c, *_ in DIVERS}
    for code, libelle, adresse, tel, email in DIVERS:
        FournisseurDivers.objects.update_or_create(
            code=code,
            defaults={'libelle': libelle, 'adresse': adresse, 'telephone': tel,
                      'email': email, 'delai_reglement': '15', 'actif': True})
    FournisseurDivers.objects.exclude(code__in=codes_div).delete()


class Migration(migrations.Migration):
    dependencies = [('donnees_de_base', '0018_journaux_reels_lamps')]
    operations = [migrations.RunPython(aligner, migrations.RunPython.noop)]

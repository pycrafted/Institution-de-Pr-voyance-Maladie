"""
Remplit la base de données de démonstration complètes : tout champ que les
formulaires de l'application font saisir porte une valeur.

  - crée des participants et leurs familles, quelques demandes d'agrément
    en attente et des bons de pharmacie, s'ils n'existent pas encore ;
  - complète les fiches existantes - fournisseurs de soins et divers,
    adhérents, journaux - sans jamais écraser une valeur déjà saisie.

Valeurs fictives mais plausibles, et déterministes : relancer la commande ne
crée aucun doublon et ne touche pas à ce qui est déjà rempli. Les fiches
créées passent par les serializers de l'API : elles obéissent aux mêmes
règles qu'une saisie à l'écran (champs obligatoires, formats, doublons).

Seules exceptions, par cohérence : les dates de résiliation et de radiation
d'un participant ne sont posées que si son contrat est fermé ou radié, et le
numéro de facture d'un bon que s'il est traité.

    python manage.py remplir_donnees_demo
"""

import base64
import unicodedata
from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from adherents.models import Adherent
from donnees_de_base.models import (
    DemandeAgrement,
    FournisseurDeSoins,
    FournisseurDivers,
    JournalComptable,
    StructureEntite,
    TypeBeneficiaire,
    TypePrestation,
)
from documents.models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation
from documents.serializers import (
    BonOptiqueSerializer,
    BonPharmacieSerializer,
    LettreGarantieSerializer,
    LettreHospitalisationSerializer,
)
from donnees_de_base.models.fournisseur_de_soins import CODE_FOURNISSEURS_DIVERS
from donnees_de_base.serializers import DemandeAgrementSerializer
from parametres.models import TauxExceptionnel, TauxPriseEnCharge
from participants.models import Beneficiaire, Participant
from participants.serializers import BeneficiaireSerializer, ParticipantSerializer

NOMS = [
    'NDIAYE', 'DIOP', 'FALL', 'SOW', 'BA', 'SALL', 'GUEYE', 'SECK', 'FAYE', 'CISSE',
    'DIALLO', 'KANE', 'THIAM', 'SY', 'MBAYE', 'NDOYE', 'DIENG', 'TOURE', 'SARR', 'LO',
    'WADE', 'DIAGNE', 'BADJI', 'GOUDIABY', 'MANE', 'SANE', 'CAMARA', 'DIATTA', 'NIANG',
    'SAMB', 'DIOUF', 'TALL', 'DRAME', 'KEITA', 'BALDE', 'BARRY', 'SOUMARE', 'TRAORE',
    'MBODJ', 'NDIONE',
]
PRENOMS_M = [
    'Moustapha', 'Ibrahima', 'Cheikh', 'Abdoulaye', 'Mamadou', 'Ousmane', 'Modou', 'Alioune',
    'Babacar', 'Serigne', 'Papa', 'Souleymane', 'Malick', 'Amadou', 'Idrissa', 'Lamine',
    'Assane', 'Moussa',
]
PRENOMS_F = [
    'Awa', 'Fatou', 'Mariama', 'Aïssatou', 'Khady', 'Ndeye', 'Sokhna', 'Adja', 'Bineta',
    'Coumba', 'Rokhaya', 'Maimouna', 'Seynabou', 'Yacine', 'Dieynaba', 'Oumou', 'Astou',
    'Aminata',
]
QUARTIERS = [
    'PARCELLES ASSAINIES U26', 'GRAND YOFF', 'SICAP LIBERTE 6', 'MERMOZ', 'OUAKAM', 'MBAO',
    'RUFISQUE', 'GUEDIAWAYE', 'PIKINE', 'YOFF', 'HLM GRAND MEDINE', 'KEUR MASSAR',
]
VILLES = [
    'DAKAR', 'THIES', 'SAINT-LOUIS', 'KAOLACK', 'ZIGUINCHOR', 'RUFISQUE', 'MBOUR',
    'DIOURBEL', 'TOUBA', 'LOUGA',
]
# Valeurs des listes de l'écran (participants/config.js).
REGIONS = ['Dakar', 'Dakar', 'Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Diourbel']
SITUATIONS = ['MARIE', 'MARIE', 'CELIBATAIRE', 'MARIE', 'DIVORCE', 'MARIE', 'VEUF']
FONCTIONS = ['Responsable administratif', 'Directeur médical', 'Gérant', 'Comptable', 'Secrétaire']
BANQUES = [
    ('CBAO', 'SN012'), ('SGBS', 'SN011'), ('BICIS', 'SN010'),
    ('ECOBANK', 'SN094'), ('BOA SENEGAL', 'SN169'), ('BHS', 'SN039'),
]
# Journaux techniques sans type ni compte : valeurs prises dans les listes de
# l'écran (TYPES_JOURNAL, plan comptable).
# Les journaux sont désormais seedés fidèlement (type et compte réels, souvent
# vides) ; la démo n'a plus rien à compléter sans contredire l'original.
JOURNAUX = {}
DEMANDES = [
    ('CABINET MEDICAL DE OUAKAM', '00', 'OUAKAM - DAKAR'),
    ('PHARMACIE DE LA CORNICHE', '06', 'CORNICHE OUEST - DAKAR'),
    ('LABORATOIRE D’ANALYSES DE PIKINE', '28', 'PIKINE - DAKAR'),
    ('CABINET DENTAIRE DE YOFF', '05', 'YOFF - DAKAR'),
    ('CENTRE D’OPTIQUE DE THIES', '04', 'AVENUE LEOPOLD SEDAR SENGHOR - THIES'),
]
TEINTES = ['#6b7280', '#1d1d1b', '#8a1c1c', '#374151', '#4b5563']
# Exercices passés : des bons tous traités, avec leur facture.
ANNEES_HISTORIQUE = (2025, 2024)
BONS_PAR_EXERCICE = 24
BONS_OPTIQUE_PAR_EXERCICE = 12
LETTRES_HOSPITALISATION_PAR_EXERCICE = 12

# Barème de démonstration, par nature de prestation : (taux, plafond, forfait).
# L'optique reprend l'exemple donné : couverte à 100 %, plafonnée à 250 000 -
# au-delà, le reste est à la charge du participant. Les autres valeurs sont
# plausibles mais inventées : elles sont là pour que l'écran ait de quoi
# montrer, et se corrigent à l'écran.
BAREME_PRESTATIONS = {
    '04': (100, 250_000, 0),      # OPTIQUE
    '19': (100, 150_000, 0),      # VERRES CORRECTEURS
    '20': (100, 100_000, 0),      # MONTURE OPTIQUE
    '21': (80, 100_000, 0),       # LENTILLES DE CONTACT
    '17': (50, 200_000, 0),       # PROTHESE DENTAIRE
    '18': (50, 150_000, 0),       # ORTHODONTIE
    '28': (50, 300_000, 0),       # PROTHESE AUDITIVE
    '29': (50, 300_000, 0),       # APPAREILLAGE ORTHOPEDIQUE
    '16': (80, 1_000_000, 0),     # CHIRURGIE LOURDE
    '03': (80, 500_000, 0),       # SEJOUR HOSPITAL-CLINIQUE
    '25': (80, 200_000, 0),       # HOSPITALISATION DE JOUR
    '24': (80, 1_500_000, 0),     # EVACUATION SANITAIRE
    '22': (80, 0, 5_000),         # SOINS INFIRMIERS
    '23': (70, 0, 15_000),        # TRANSPORT SANITAIRE
}
# Toute prestation absente du barème : couverte à 80 %, sans plafond ni forfait.
BAREME_DEFAUT = (80, 0, 0)
# Les ayants droit indirects sont moins couverts que le foyer proche.
TYPES_REDUITS = {'ASCENDANT', 'AUTRE'}
TAUX_REDUIT = 50
# Chaque société a son propre barème : le sien s'écarte de la référence d'un
# nombre de points et d'un coefficient de plafond. (Valeurs de démonstration,
# à corriger à l'écran société par société.)
BAREME_SOCIETES = {
    '01': (0, 1.0),     # IPM SAR PERSONNEL MOO - la référence
    '02': (5, 1.5),     # IPM SAR PERSONNEL CADRES - mieux couverts
    '03': (-5, 0.9),    # CMM CR-SAR
    '04': (-10, 0.8),   # CMM NCR-SAR
}
# Taux ciblés sur une personne, pour la démonstration.
TAUX_EXCEPTIONNELS = [('04', 100, 400_000), ('16', 100, 2_000_000), ('17', 80, 350_000)]
# Actes de la liste « Rechercher acte » de l'origine, avec un tarif de
# démonstration.
ACTES_HOSPITALISATION = [
    ('TRAITEMENTS MEDICAUX / CHIRURGICAUX', 150_000),
    ('ANALYSE BIO-MEDICALES', 35_000),
    ('CONSULTATION CHIRURGIEN', 25_000),
    ('SOINS / UROLOGIE', 60_000),
]
# Types de structure de l'origine et la spécialité de leurs prestataires.
STRUCTURES_SANTE = [('HOPITAL', 'HOPITAUX'), ('CLINIQUE', 'CLINIQUES'), ('CENTRE DE SANTE', 'CENTRES DE SANTE')]


def valeurs_du_bareme(code_societe, code_prestation, libelle_type):
    """Taux, plafond et forfait d'une société pour une prestation et une qualité."""
    taux, plafond, forfait = BAREME_PRESTATIONS.get(code_prestation, BAREME_DEFAUT)
    if libelle_type in TYPES_REDUITS:
        taux = min(taux, TAUX_REDUIT)
    points, coefficient = BAREME_SOCIETES.get(code_societe, (0, 1.0))
    taux = max(0, min(100, taux + points))
    # Plafonds arrondis au millier le plus proche : un barème se lit.
    plafond = int(round(plafond * coefficient / 5_000) * 5_000) if plafond else 0
    return taux, plafond, forfait


def ascii_minuscule(texte):
    return unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode().lower()


def identifiant(texte, longueur=24):
    """« CLINIQUE DU CAP » → « cliniqueducap » : pour une adresse électronique."""
    return ''.join(c for c in ascii_minuscule(texte) if c.isalnum())[:longueur] or 'contact'


def telephone(i, prefixe='33', indicatif=True):
    """Numéro sénégalais à 9 chiffres ; « +221 » devant, comme l'amorce de l'écran."""
    numero = f'{prefixe} {800 + (i * 37) % 199:03d} {10 + (i * 13) % 89:02d} {10 + (i * 29) % 89:02d}'
    return f'+221 {numero}' if indicatif else numero


def jour(annee, i):
    return date(annee, 1 + i % 12, 1 + (i * 7) % 28).isoformat()


def photo(prenoms, nom, i):
    """Vignette aux initiales, au format d'une photo d'identité (3/4)."""
    initiales = f'{prenoms[:1]}{nom[:1]}'.upper()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">'
        f'<rect width="240" height="320" fill="{TEINTES[i % len(TEINTES)]}"/>'
        '<text x="120" y="192" font-family="Arial, sans-serif" font-size="96" '
        f'fill="#ffffff" text-anchor="middle">{initiales}</text></svg>'
    )
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode('utf-8')).decode()


def fiche_professionnelle(i, libelle, code_specialite):
    """Pièces, contact et banque d'un prestataire (camelCase, pour l'API)."""
    autorite = {
        '06': 'Ordre des Pharmaciens du Sénégal',
        '05': 'Ordre des Chirurgiens-Dentistes du Sénégal',
    }.get(code_specialite, 'Ordre des Médecins du Sénégal')
    banque, code_banque = BANQUES[i % len(BANQUES)]
    return {
        'email': f'contact@{identifiant(libelle)}.sn',
        'contactNom': NOMS[(i * 3) % len(NOMS)],
        'contactPrenoms': (PRENOMS_F if i % 2 else PRENOMS_M)[i % 18],
        'contactFonction': FONCTIONS[i % len(FONCTIONS)],
        'contactTelephone': telephone(i + 202, '33'),
        'contactMobile': telephone(i + 303, '77'),
        'carteNumero': f'CO/{2400 + i * 7}',
        'carteDate': jour(2005 + i % 15, i),
        'carteAutorite': autorite,
        'rcNumero': f'SN-DKR-{2008 + i % 15}-B-{1000 + i * 37}',
        'rcDate': jour(2008 + i % 15, i + 3),
        'ninea': f'00{4500000 + i * 131}',
        'autorisationNumero': f'MSAS/DES/{900 + i}',
        'autorisationDate': jour(2006 + i % 15, i + 5),
        'banqueNom': banque,
        'banqueCode': code_banque,
        'guichetCode': f'{1000 + (i * 17) % 9000:05d}',
        'compteBancaire': f'{100000000000 + i * 91733:012d}',
        'cleRib': f'{10 + (i * 7) % 89:02d}',
    }


# camelCase de l'API → champ du modèle, pour compléter une fiche existante.
VERS_MODELE = {
    'contactNom': 'contact_nom', 'contactPrenoms': 'contact_prenoms',
    'contactFonction': 'contact_fonction', 'contactTelephone': 'contact_telephone',
    'contactMobile': 'contact_mobile', 'carteNumero': 'carte_numero', 'carteDate': 'carte_date',
    'carteAutorite': 'carte_autorite', 'rcNumero': 'rc_numero', 'rcDate': 'rc_date',
    'autorisationNumero': 'autorisation_numero', 'autorisationDate': 'autorisation_date',
    'banqueNom': 'banque_nom', 'banqueCode': 'banque_code', 'guichetCode': 'guichet_code',
    'compteBancaire': 'compte_bancaire', 'cleRib': 'cle_rib',
}


class Command(BaseCommand):
    help = 'Remplit la base de données de démonstration complètes (sans rien écraser).'

    def handle(self, *args, **options):
        with transaction.atomic():
            self.completer_fournisseurs_de_soins()
            self.completer_fournisseurs_divers()
            self.completer_adherents()
            self.completer_journaux()
            self.creer_demandes()
            self.creer_participants()
            self.creer_bons()
            self.creer_bons_historiques()
            self.completer_bons()
            self.creer_lettres_garantie()
            self.creer_bons_optique()
            self.creer_lettres_hospitalisation()
            self.creer_taux_prise_en_charge()

    # --- Outils ----------------------------------------------------------------

    def remplir(self, objet, valeurs):
        """Pose chaque valeur dans un champ encore vide ; renvoie le nombre posé."""
        remplis = [c for c, v in valeurs.items() if getattr(objet, c) in ('', None)]
        for champ in remplis:
            setattr(objet, champ, valeurs[champ])
        if remplis:
            objet.save(update_fields=remplis + ['modifie_le'])
        return len(remplis)

    def dire(self, texte):
        self.stdout.write(self.style.SUCCESS(texte))

    # --- Fiches existantes -----------------------------------------------------

    def completer_fournisseurs_de_soins(self):
        total = 0
        for i, f in enumerate(FournisseurDeSoins.objects.select_related('specialite').order_by('code')):
            code_specialite = f.specialite.code if f.specialite else ''
            fiche = fiche_professionnelle(i, f.libelle, code_specialite)
            valeurs = {VERS_MODELE.get(cle, cle): valeur for cle, valeur in fiche.items()}
            valeurs['carte_date'] = date.fromisoformat(valeurs['carte_date'])
            valeurs['rc_date'] = date.fromisoformat(valeurs['rc_date'])
            valeurs['autorisation_date'] = date.fromisoformat(valeurs['autorisation_date'])
            valeurs['adresse'] = f'{QUARTIERS[i % len(QUARTIERS)]} - DAKAR'
            valeurs['telephone'] = telephone(i, '33')
            valeurs['mobile'] = telephone(i + 101, '77')
            total += self.remplir(f, valeurs)
        self.dire(f'Fournisseurs de soins : {total} champ(s) complété(s).')

    def completer_fournisseurs_divers(self):
        total = 0
        for i, f in enumerate(FournisseurDivers.objects.order_by('code')):
            banque, code_banque = BANQUES[i % len(BANQUES)]
            nom = NOMS[(i * 7) % len(NOMS)]
            prenom = (PRENOMS_M if i % 2 else PRENOMS_F)[i % 18]
            # Téléphones sans indicatif : l'écran l'affiche, figé, devant le champ.
            total += self.remplir(f, {
                'adresse': f'{QUARTIERS[i % len(QUARTIERS)]} - DAKAR',
                'telephone': telephone(i + 404, '33', indicatif=False),
                'email': f'contact@{identifiant(f.libelle)}.sn',
                'ninea': f'00{5100000 + i * 173}',
                'delai_reglement': str([30, 45, 60, 15][i % 4]),
                'contact_nom': f'{prenom} {nom}',
                'contact_telephone': telephone(i + 505, '77', indicatif=False),
                'banque_nom': banque,
                'banque_code': code_banque,
                'guichet_code': f'{2000 + (i * 23) % 8000:05d}',
                'compte_bancaire': f'{200000000000 + i * 71317:012d}',
                'cle_rib': f'{11 + (i * 5) % 88:02d}',
            })
        self.dire(f'Fournisseurs divers : {total} champ(s) complété(s).')

    def completer_adherents(self):
        total = 0
        for i, a in enumerate(Adherent.objects.order_by('code')):
            cadres = 'CADRES' in a.libelle.upper()
            nom = NOMS[(i * 5) % len(NOMS)]
            prenom = PRENOMS_F[(i * 3) % 18]
            # Montants en francs CFA, comme la saisie (texte, sans séparateur).
            total += self.remplir(a, {
                'adresse': 'KM 18 ROUTE DE RUFISQUE - MBAO',
                'telephone': telephone(i + 606, '33'),
                'cotisation_ipm_salariale': '8500' if cadres else '5000',
                'cotisation_ipm_patronale': '25500' if cadres else '15000',
                'cotisation_mss': '3500' if a.type == 'MSS' else '2500',
                'seuil_endettement': '1000000' if cadres else '500000',
                'seuil_consommation': '1500000' if cadres else '750000',
                'focal_nom': f'{prenom} {nom}',
                'focal_telephone': telephone(i + 707, '77'),
                'focal_email': f'{ascii_minuscule(prenom)}.{ascii_minuscule(nom)}@sar.sn',
            })
        self.dire(f'Adhérents : {total} champ(s) complété(s).')

    def completer_journaux(self):
        total = 0
        for journal in JournalComptable.objects.filter(code__in=JOURNAUX):
            type_, compte = JOURNAUX[journal.code]
            total += self.remplir(journal, {'type': type_, 'compte': compte})
        self.dire(f'Journaux comptables : {total} champ(s) complété(s).')

    # --- Nouvelles fiches ------------------------------------------------------

    def creer_demandes(self):
        crees = 0
        for i, (libelle, specialite, adresse) in enumerate(DEMANDES):
            if DemandeAgrement.objects.filter(libelle=libelle).exists():
                continue
            donnees = {
                'dateDemande': date(2026, 9, 1 + i * 2).isoformat(),
                'specialite': specialite,
                'libelle': libelle,
                'adresse': adresse,
                **fiche_professionnelle(100 + i, libelle, specialite),
            }
            serializer = DemandeAgrementSerializer(data=donnees)
            serializer.is_valid(raise_exception=True)
            serializer.save(code=DemandeAgrement.prochain_code())
            crees += 1
        self.dire(f'Demandes d’agrément en attente : {crees} créée(s).')

    def enchainements_structure(self):
        """Direction → département → service qui existent vraiment en base."""
        entites = {e.code: e for e in StructureEntite.objects.filter(actif=True)}
        chaines = []
        for code, service in sorted(entites.items()):
            if service.type != 'SRV':
                continue
            departement = entites.get(service.parent)
            direction = entites.get(departement.parent) if departement else None
            if direction:
                chaines.append((direction.code, departement.code, service.code))
        if not chaines:
            raise SystemExit('Aucun service rattaché à une direction : remplissez la structure.')
        return chaines

    def creer_participants(self):
        chaines = self.enchainements_structure()
        adherents = list(Adherent.objects.order_by('code'))
        if not adherents:
            raise SystemExit('Aucun adhérent en base : lancez d’abord seed_adherents.')
        emails = set(Participant.objects.values_list('email', flat=True))
        crees = beneficiaires = 0

        for i in range(40):
            # Quatre chiffres, comme l'application d'origine (« 0949 »).
            matricule = f'{1204 + i * 3:04d}'
            if Participant.objects.filter(matricule=matricule).exists():
                continue
            sexe = 'M' if i % 2 == 0 else 'F'
            nom = NOMS[i % len(NOMS)]
            prenoms = (PRENOMS_M if sexe == 'M' else PRENOMS_F)[(i // 2) % 18]
            # Surtout du personnel MOO, puis des cadres, et les deux mutuelles.
            adherent = adherents[[0, 0, 1, 0, 2, 0, 1, 3][i % 8] % len(adherents)]
            # Collège : les cadres d'un côté (PERSONNEL CADRES, et CMM CR-SAR
            # qui en est la suite à la retraite), le personnel MOO de l'autre.
            jetons = adherent.libelle.upper().replace('-', ' ').split()
            cadre = 'CADRES' in jetons or 'CR' in jetons
            # Retraité : couvert par une mutuelle (régime MSS) et non plus par
            # l'IPM. Ce n'est pas une case à part, c'est la société.
            retraite = adherent.type == 'MSS'
            naissance = 1955 + i % 8 if retraite else 1962 + (i * 7) % 36
            embauche = min(naissance + 24 + i % 6, 2024)
            situation = SITUATIONS[i % len(SITUATIONS)]

            # État du dossier, et contrat qui va avec : un dossier résilié a son
            # contrat fermé, un dossier radié son contrat radié.
            etat = ['Actif'] * 6 + ['En Attente', 'Suspendu', 'Résilié', 'Radié']
            etat = etat[i % 10]
            contrat = {'Résilié': 'Fermeture', 'Radié': 'Radiation'}.get(etat, 'Ouverture')

            email = f'{ascii_minuscule(prenoms)}.{ascii_minuscule(nom)}@sar.sn'
            if email in emails:
                email = email.replace('@', f'{i}@')
            emails.add(email)
            direction, departement, service = chaines[i % len(chaines)]

            donnees = {
                'matricule': matricule,
                'nom': nom,
                'prenoms': prenoms,
                'sexe': sexe,
                'photo': photo(prenoms, nom, i),
                # Un participant sur dix est malien, avec un passeport.
                'nationalite': 'SEN' if i % 10 else 'MLI',
                'typePiece': 'CIN' if i % 10 else 'PASSEPORT',
                'numeroPiece': f'{1 if sexe == "M" else 2}{750 + i:03d}{naissance}{(i * 9731) % 100000:05d}',
                'situationFamiliale': situation,
                'dateNaissance': jour(naissance, i),
                'lieuNaissance': VILLES[i % len(VILLES)],
                'adresse': QUARTIERS[i % len(QUARTIERS)],
                'mobile': telephone(i + 808, ['77', '76', '78', '70'][i % 4]),
                'region': REGIONS[i % len(REGIONS)],
                'email': email,
                'dateEmbauche': jour(embauche, i + 2),
                'typeContrat': 'CDD' if i % 9 == 4 else 'CDI',
                'categorie': 'CADRE' if cadre else ['MAITRISE', 'EMPLOYE', 'OUVRIER'][i % 3],
                'direction': direction,
                'departement': departement,
                'service': service,
                'adherent': adherent.code,
                'numeroFiche': str(1001 + i),
                'numeroContrat': f'IPM-{2015 + i % 10}-{100 + i:04d}',
                'dateSouscription': jour(max(embauche, 2015 + i % 10), i + 4),
                'etatContrat': contrat,
                'dateResiliation': jour(2025, i) if contrat == 'Fermeture' else '',
                'dateRadiation': jour(2025, i + 1) if contrat == 'Radiation' else '',
                'etat': etat,
            }
            serializer = ParticipantSerializer(data=donnees)
            serializer.is_valid(raise_exception=True)
            participant = serializer.save()
            crees += 1
            beneficiaires += self.creer_famille(participant, i, situation)

        self.dire(f'Participants : {crees} créé(s), avec {beneficiaires} bénéficiaire(s).')

    def creer_famille(self, p, i, situation):
        """Conjoint, enfants, parfois un ascendant ou un autre ayant droit."""
        membres = []
        if situation == 'MARIE':
            epouse = p.sexe == 'M'
            membres.append((
                'EPOUSE' if epouse else 'EPOUX',
                (PRENOMS_F if epouse else PRENOMS_M)[(i + 5) % 18],
                NOMS[(i + 11) % len(NOMS)],
                'F' if epouse else 'M',
                p.date_naissance.year + (3 if epouse else -3),
            ))
        nb_enfants = {'MARIE': 1 + i % 4, 'DIVORCE': 1 + i % 2, 'VEUF': 2}.get(situation, i % 2)
        # Les enfants portent le nom du père : le participant, ou son époux.
        nom_enfants = p.nom if p.sexe == 'M' or not membres else membres[0][2]
        for e in range(nb_enfants):
            fille = e % 2 == 1
            membres.append((
                'ENFANT',
                (PRENOMS_F if fille else PRENOMS_M)[(i + e * 4) % 18],
                nom_enfants,
                'F' if fille else 'M',
                min(p.date_naissance.year + 26 + e * 3, 2024),
            ))
        if i % 6 == 0:
            membres.append(('ASCENDANT', PRENOMS_F[(i + 3) % 18], p.nom, 'F', p.date_naissance.year - 26))
        if i % 11 == 0:
            membres.append(('AUTRE', PRENOMS_M[(i + 2) % 18], p.nom, 'M', min(p.date_naissance.year + 30, 2012)))

        for rang, (type_, prenoms, nom, sexe, annee) in enumerate(membres, start=1):
            # Matricule composé par le serveur : « 01-1204-21 ».
            serializer = BeneficiaireSerializer(data={
                'typeBenef': type_,
                'prenoms': prenoms,
                'nom': nom,
                'matriculePart': p.matricule,
                'adresse': p.adresse,
                'dateNaissance': jour(annee, i + rang),
                'lieuNaissance': VILLES[(i + rang) % len(VILLES)],
                'sexe': sexe,
                'etat': 'Radié' if p.etat == 'Radié' else 'Actif',
            })
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return len(membres)

    def creer_bons(self):
        """Bons de pharmacie complets : participant, ayant droit, pharmacie, prescripteur."""
        if BonPharmacie.objects.exists():
            self.dire('Bons de pharmacie : déjà présents, aucun créé.')
            return
        participants = list(Participant.objects.select_related('adherent').filter(etat='Actif'))
        pharmacies = list(
            FournisseurDeSoins.objects.filter(specialite__code='06', actif=True).order_by('code')
        )
        prescripteurs = list(
            FournisseurDeSoins.objects.filter(actif=True)
            .exclude(specialite__code='06')
            .exclude(code=CODE_FOURNISSEURS_DIVERS)
            .select_related('specialite')
            .order_by('code')
        )
        crees = 0
        for i in range(30):
            p = participants[(i * 7) % len(participants)]
            famille = list(Beneficiaire.objects.filter(participant=p).select_related('type_benef'))
            # Un bon sur quatre pour le participant lui-même (type PARTICIPANT).
            if i % 4 == 0 or not famille:
                type_code, matricule_benef = '1', p.matricule
            else:
                ayant_droit = famille[i % len(famille)]
                type_code, matricule_benef = ayant_droit.type_benef.code, ayant_droit.matricule_benef
            prescripteur = prescripteurs[(i * 5) % len(prescripteurs)]
            traite = i % 3 == 0
            serializer = BonPharmacieSerializer(data={
                'codeSoc': p.adherent.code,
                'matriculePart': p.matricule,
                'typeBenef': type_code,
                'matriculeBenef': matricule_benef,
                'codeFournisseur': pharmacies[i % len(pharmacies)].code,
                'specialite': prescripteur.specialite.code,
                'prescripteur': prescripteur.code,
                'nbArticles': 1 + i % 5,
                'dateOrdonnance': jour(2026 if i % 6 else 2025, i),
                'remboursementIntegral': i % 9 == 0,
                'traite': traite,
                'numeroFacture': f'FAC{20250 + i * 7:06d}' if traite else '',
            })
            serializer.is_valid(raise_exception=True)
            bon = serializer.save(code=BonPharmacie.prochain_code())
            # Émis le jour de l'ordonnance : les deux exercices ont leurs bons.
            BonPharmacie.objects.filter(pk=bon.pk).update(date=bon.date_ordonnance)
            crees += 1
        self.dire(f'Bons de pharmacie : {crees} créé(s).')

    def completer_bons(self):
        """Auteur des bons qui n'en ont pas : il figure sur le bon imprimé."""
        auteur = get_user_model().objects.filter(is_active=True).order_by('id').first()
        poses = BonPharmacie.objects.filter(cree_par__isnull=True).update(cree_par=auteur) if auteur else 0
        self.dire(f'Bons de pharmacie : auteur posé sur {poses} bon(s).')

    def creer_bons_historiques(self):
        """
        Bons des exercices passés, tous traités : leur facture est arrivée et
        porte son numéro. De quoi donner un contenu au filtre « Exercice ». Un
        dossier encore en attente n'a pas pu en recevoir : il est écarté.
        """
        auteur = get_user_model().objects.filter(is_active=True).order_by('id').first()
        participants = list(
            Participant.objects.select_related('adherent').exclude(etat='En Attente').order_by('matricule')
        )
        pharmacies = list(
            FournisseurDeSoins.objects.filter(specialite__code='06', actif=True).order_by('code')
        )
        prescripteurs = list(
            FournisseurDeSoins.objects.filter(actif=True)
            .exclude(specialite__code='06')
            .exclude(code=CODE_FOURNISSEURS_DIVERS)
            .select_related('specialite')
            .order_by('code')
        )
        for annee in ANNEES_HISTORIQUE:
            deja = BonPharmacie.objects.filter(date__year=annee).count()
            crees = 0
            for i in range(deja, BONS_PAR_EXERCICE):
                graine = annee + i * 7
                p = participants[graine % len(participants)]
                famille = list(Beneficiaire.objects.filter(participant=p).select_related('type_benef'))
                if i % 4 == 0 or not famille:
                    type_code, matricule_benef = '1', p.matricule
                else:
                    ayant_droit = famille[i % len(famille)]
                    type_code, matricule_benef = ayant_droit.type_benef.code, ayant_droit.matricule_benef
                prescripteur = prescripteurs[(graine * 5) % len(prescripteurs)]
                jour_bon = date(annee, 1 + i % 12, 1 + (i * 5) % 28)
                serializer = BonPharmacieSerializer(data={
                    'codeSoc': p.adherent.code,
                    'matriculePart': p.matricule,
                    'typeBenef': type_code,
                    'matriculeBenef': matricule_benef,
                    'codeFournisseur': pharmacies[graine % len(pharmacies)].code,
                    'specialite': prescripteur.specialite.code,
                    'prescripteur': prescripteur.code,
                    'nbArticles': 1 + i % 5,
                    'dateOrdonnance': jour_bon.isoformat(),
                    'remboursementIntegral': i % 9 == 0,
                    'traite': True,
                    'numeroFacture': f'FAC{annee % 100:02d}{i + 1:04d}',
                })
                serializer.is_valid(raise_exception=True)
                bon = serializer.save(code=BonPharmacie.prochain_code(), cree_par=auteur)
                # Émis le jour de l'ordonnance, dans l'exercice voulu.
                BonPharmacie.objects.filter(pk=bon.pk).update(date=jour_bon)
                crees += 1
            self.dire(f'Bons de pharmacie {annee} : {crees} créé(s), traités avec leur facture.')

    def creer_lettres_garantie(self):
        """
        Lettres de garantie complètes, par exercice : participant, ayant droit,
        prestataire et nature de la prestation, prescripteur, actes. Celles
        des exercices passés sont traitées, avec leur facture ; un tiers de
        celles de l'exercice en cours aussi.
        """
        auteur = get_user_model().objects.filter(is_active=True).order_by('id').first()
        participants = list(
            Participant.objects.select_related('adherent').exclude(etat='En Attente').order_by('matricule')
        )
        # Les prestataires d'une lettre : tout fournisseur de soins hors
        # pharmacie (le bon de pharmacie y pourvoit).
        prestataires = list(
            FournisseurDeSoins.objects.filter(actif=True)
            .exclude(specialite__code='06')
            .exclude(specialite=None)
            .exclude(code=CODE_FOURNISSEURS_DIVERS)
            .select_related('specialite')
            .order_by('code')
        )
        natures = list(TypePrestation.objects.filter(actif=True).order_by('code'))
        if not (participants and prestataires and natures):
            self.dire('Lettres de garantie : participants, prestataires ou natures manquants, aucune créée.')
            return
        courant = date.today().year
        for annee in (courant, *ANNEES_HISTORIQUE):
            deja = LettreGarantie.objects.filter(date__year=annee).count()
            crees = 0
            for i in range(deja, BONS_PAR_EXERCICE):
                graine = annee + i * 11
                p = participants[graine % len(participants)]
                famille = list(Beneficiaire.objects.filter(participant=p).select_related('type_benef'))
                if i % 4 == 0 or not famille:
                    type_code, matricule_benef = '1', p.matricule
                else:
                    ayant_droit = famille[i % len(famille)]
                    type_code, matricule_benef = ayant_droit.type_benef.code, ayant_droit.matricule_benef
                prestataire = prestataires[graine % len(prestataires)]
                prescripteur = prestataires[(graine * 5) % len(prestataires)]
                # L'exercice en cours s'arrête à aujourd'hui.
                mois = 1 + i % (date.today().month if annee == courant else 12)
                jour_lettre = date(annee, mois, 1 + (i * 5) % 28)
                if jour_lettre > date.today():
                    jour_lettre = date.today()
                traite = annee != courant or i % 3 == 0
                serializer = LettreGarantieSerializer(data={
                    'codeSoc': p.adherent.code,
                    'matriculePart': p.matricule,
                    'typeBenef': type_code,
                    'matriculeBenef': matricule_benef,
                    'specialitePrestataire': prestataire.specialite.code,
                    'codePrestataire': prestataire.code,
                    'naturePrestation': natures[graine % len(natures)].code,
                    'specialite': prescripteur.specialite.code,
                    'prescripteur': prescripteur.code,
                    'nbArticles': 1 + i % 4,
                    'datePrescription': jour_lettre.isoformat(),
                    'remboursementIntegral': i % 9 == 0,
                    'traite': traite,
                    'numeroFacture': f'FLG{annee % 100:02d}{i + 1:04d}' if traite else '',
                })
                serializer.is_valid(raise_exception=True)
                lettre = serializer.save(code=LettreGarantie.prochain_code(), cree_par=auteur)
                # Établie le jour de la prescription, dans l'exercice voulu.
                LettreGarantie.objects.filter(pk=lettre.pk).update(date=jour_lettre)
                crees += 1
            self.dire(f'Lettres de garantie {annee} : {crees} créée(s).')

    def creer_bons_optique(self):
        """
        Bons optique complets, par exercice : participant, ayant droit,
        opticien, prescripteur ophtalmologue, ordonnance, la ligne commandée
        - « Montures & Verres », seule désignation connue de l'origine - et sa
        remise. Ceux des exercices passés sont traités, avec leur facture ; un
        tiers de ceux de l'exercice en cours aussi.
        """
        auteur = get_user_model().objects.filter(is_active=True).order_by('id').first()
        participants = list(
            Participant.objects.select_related('adherent').exclude(etat='En Attente').order_by('matricule')
        )
        opticiens = list(
            FournisseurDeSoins.objects.filter(actif=True, specialite__code='04').order_by('code')
        )
        prescripteurs = list(
            FournisseurDeSoins.objects.filter(actif=True, specialite__libelle='OPHTALMOLOGUES')
            .select_related('specialite')
            .order_by('code')
        )
        if not (participants and opticiens and prescripteurs):
            self.dire('Bons optique : participants, opticiens ou ophtalmologues manquants, aucun créé.')
            return
        courant = date.today().year
        for annee in (courant, *ANNEES_HISTORIQUE):
            deja = BonOptique.objects.filter(date__year=annee).count()
            crees = 0
            for i in range(deja, BONS_OPTIQUE_PAR_EXERCICE):
                graine = annee + i * 7
                p = participants[graine % len(participants)]
                famille = list(Beneficiaire.objects.filter(participant=p).select_related('type_benef'))
                if i % 3 == 0 or not famille:
                    type_code, matricule_benef = '1', p.matricule
                else:
                    ayant_droit = famille[i % len(famille)]
                    type_code, matricule_benef = ayant_droit.type_benef.code, ayant_droit.matricule_benef
                prescripteur = prescripteurs[graine % len(prescripteurs)]
                mois = 1 + i % (date.today().month if annee == courant else 12)
                jour_bon = min(date(annee, mois, 1 + (i * 3) % 28), date.today())
                prix = 95_000 + (graine * 13_795) % 190_000 // 5 * 5
                traite = annee != courant or i % 3 == 0
                serializer = BonOptiqueSerializer(data={
                    'codeSoc': p.adherent.code,
                    'matriculePart': p.matricule,
                    'typeBenef': type_code,
                    'matriculeBenef': matricule_benef,
                    'codeFournisseur': opticiens[graine % len(opticiens)].code,
                    'specialite': prescripteur.specialite.code,
                    'prescripteur': prescripteur.code,
                    'dateOrdonnance': jour_bon.isoformat(),
                    'designation': 'Montures & Verres',
                    'quantite': 1,
                    'prixUnitaire': prix,
                    'montantRemise': 10_000 if i % 5 == 0 else 0,
                    'traite': traite,
                    'numeroFacture': f'FBO{annee % 100:02d}{i + 1:04d}' if traite else '',
                })
                serializer.is_valid(raise_exception=True)
                bon = serializer.save(code=BonOptique.prochain_code(), cree_par=auteur)
                # Établi le jour de l'ordonnance, dans l'exercice voulu.
                BonOptique.objects.filter(pk=bon.pk).update(date=jour_bon)
                crees += 1
            self.dire(f'Bons optique {annee} : {crees} créé(s).')

    def creer_lettres_hospitalisation(self):
        """
        Lettres de garantie hospitalisation complètes, par exercice :
        participant, ayant droit, structure de santé (type, catégorie,
        prestataire du type, nature), prescripteur généraliste, remise et un à
        trois actes. Celles des exercices passés sont traitées, avec leur
        facture ; un tiers de celles de l'exercice en cours aussi.
        """
        auteur = get_user_model().objects.filter(is_active=True).order_by('id').first()
        participants = list(
            Participant.objects.select_related('adherent').exclude(etat='En Attente').order_by('matricule')
        )
        structures = {
            type_structure: list(
                FournisseurDeSoins.objects.filter(actif=True, specialite__libelle=specialite).order_by('code')
            )
            for type_structure, specialite in STRUCTURES_SANTE
        }
        # Natures d'une hospitalisation, parmi les types de prestation.
        natures = list(
            TypePrestation.objects.filter(
                actif=True, libelle__in=['SEJOUR HOSPITAL-CLINIQUE', 'HOSPITALISATION DE JOUR', 'CHIRURGIE LOURDE'],
            ).order_by('code')
        )
        prescripteurs = list(
            FournisseurDeSoins.objects.filter(actif=True, specialite__libelle='GENERALISTES')
            .select_related('specialite')
            .order_by('code')
        )
        if not (participants and natures and prescripteurs and all(structures.values())):
            self.dire('Lettres hospitalisation : données de base manquantes, aucune créée.')
            return
        courant = date.today().year
        for annee in (courant, *ANNEES_HISTORIQUE):
            deja = LettreHospitalisation.objects.filter(date__year=annee).count()
            crees = 0
            for i in range(deja, LETTRES_HOSPITALISATION_PAR_EXERCICE):
                graine = annee + i * 13
                p = participants[graine % len(participants)]
                famille = list(Beneficiaire.objects.filter(participant=p).select_related('type_benef'))
                if i % 3 == 0 or not famille:
                    type_code, matricule_benef = '1', p.matricule
                else:
                    ayant_droit = famille[i % len(famille)]
                    type_code, matricule_benef = ayant_droit.type_benef.code, ayant_droit.matricule_benef
                type_structure = STRUCTURES_SANTE[i % len(STRUCTURES_SANTE)][0]
                prestataires = structures[type_structure]
                prescripteur = prescripteurs[graine % len(prescripteurs)]
                mois = 1 + i % (date.today().month if annee == courant else 12)
                jour_lettre = min(date(annee, mois, 1 + (i * 5) % 28), date.today())
                traite = annee != courant or i % 3 == 0
                actes = [
                    {
                        'acte': ACTES_HOSPITALISATION[(graine + k) % len(ACTES_HOSPITALISATION)][0],
                        'quantite': 1 + (i + k) % 2,
                        'tarif': ACTES_HOSPITALISATION[(graine + k) % len(ACTES_HOSPITALISATION)][1],
                    }
                    for k in range(1 + i % 3)
                ]
                serializer = LettreHospitalisationSerializer(data={
                    'codeSoc': p.adherent.code,
                    'matriculePart': p.matricule,
                    'typeBenef': type_code,
                    'matriculeBenef': matricule_benef,
                    'typeStructure': type_structure,
                    'categorie': str(1 + i % 4),
                    'codePrestataire': prestataires[graine % len(prestataires)].code,
                    'naturePrestation': natures[graine % len(natures)].code,
                    'specialite': prescripteur.specialite.code,
                    'prescripteur': prescripteur.code,
                    'datePrescription': jour_lettre.isoformat(),
                    'remise': 10_000 if i % 4 == 0 else 0,
                    'actes': actes,
                    'remboursementIntegral': i % 7 == 0,
                    'traite': traite,
                    'numeroFacture': f'FLH{annee % 100:02d}{i + 1:04d}' if traite else '',
                })
                serializer.is_valid(raise_exception=True)
                lettre = serializer.save(code=LettreHospitalisation.prochain_code(), cree_par=auteur)
                LettreHospitalisation.objects.filter(pk=lettre.pk).update(date=jour_lettre)
                crees += 1
            self.dire(f'Lettres hospitalisation {annee} : {crees} créée(s).')

    def creer_taux_prise_en_charge(self):
        """
        Barème de chaque société : un taux par nature de prestation et par
        qualité de bénéficiaire, puis quelques taux ciblés sur une personne.
        Rien n'est écrasé : seules les combinaisons absentes sont créées.
        """
        societes = list(Adherent.objects.filter(actif=True).order_by('code'))
        prestations = list(TypePrestation.objects.filter(actif=True).order_by('code'))
        # « AUTRES » fait double emploi avec « AUTRE » : on ne barème que le premier.
        types = [t for t in TypeBeneficiaire.objects.filter(actif=True).order_by('code')
                 if t.libelle != 'AUTRES']
        if not (societes and prestations and types):
            self.dire('Taux de prise en charge : données de base manquantes, aucun créé.')
            return

        existants = {
            (t.adherent_id, t.prestation_id, t.type_benef_id)
            for t in TauxPriseEnCharge.objects.all()
        }
        a_creer = []
        for societe in societes:
            for prestation in prestations:
                for type_benef in types:
                    if (societe.id, prestation.id, type_benef.id) in existants:
                        continue
                    taux, plafond, forfait = valeurs_du_bareme(
                        societe.code, prestation.code, type_benef.libelle,
                    )
                    a_creer.append(TauxPriseEnCharge(
                        adherent=societe,
                        prestation=prestation,
                        type_benef=type_benef,
                        taux=taux,
                        plafond=plafond,
                        forfait=forfait,
                    ))
        TauxPriseEnCharge.objects.bulk_create(a_creer)

        # Les taux posés par une version précédente de ce barème - le même pour
        # toutes les sociétés - sont réalignés. Ce qui a été retouché à l'écran
        # ne l'est pas : on ne reconnaît que les valeurs exactes d'alors.
        a_revoir = []
        for ligne in TauxPriseEnCharge.objects.select_related(
            'adherent', 'prestation', 'type_benef',
        ):
            ancien_taux, ancien_plafond, ancien_forfait = BAREME_PRESTATIONS.get(
                ligne.prestation.code, BAREME_DEFAUT,
            )
            if ligne.type_benef.libelle in TYPES_REDUITS:
                ancien_taux = min(ancien_taux, TAUX_REDUIT)
            if (ligne.taux, ligne.plafond, ligne.forfait) != (
                ancien_taux, ancien_plafond, ancien_forfait,
            ):
                continue
            taux, plafond, forfait = valeurs_du_bareme(
                ligne.adherent.code, ligne.prestation.code, ligne.type_benef.libelle,
            )
            if (taux, plafond, forfait) == (ligne.taux, ligne.plafond, ligne.forfait):
                continue
            ligne.taux, ligne.plafond, ligne.forfait = taux, plafond, forfait
            a_revoir.append(ligne)
        if a_revoir:
            TauxPriseEnCharge.objects.bulk_update(a_revoir, ['taux', 'plafond', 'forfait'])

        self.dire(f'Taux de prise en charge : {len(a_creer)} créé(s), '
                  f'{len(a_revoir)} ajusté(s) au barème de leur société, '
                  f'{TauxPriseEnCharge.objects.count()} en base.')

        # --- Taux ciblés sur une personne -----------------------------------
        participants = list(
            Participant.objects.filter(etat='Actif').select_related('adherent').order_by('matricule')
        )
        crees = 0
        for i, (code, taux, plafond) in enumerate(TAUX_EXCEPTIONNELS):
            prestation = next((p for p in prestations if p.code == code), None)
            if not prestation or i >= len(participants):
                continue
            participant = participants[i * 3 % len(participants)]
            _, nouveau = TauxExceptionnel.objects.get_or_create(
                participant=participant,
                prestation=prestation,
                defaults={'taux': taux, 'plafond': plafond, 'forfait': 0},
            )
            crees += int(nouveau)
        self.dire(f'Taux exceptionnels : {crees} créé(s), '
                  f'{TauxExceptionnel.objects.count()} en base.')

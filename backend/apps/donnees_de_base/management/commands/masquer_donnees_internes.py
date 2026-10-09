"""
Masque les référentiels qui contiennent de **vraies données internes de la SAR**,
pour les présentations : on remplace les libellés (et, pour les fournisseurs,
les coordonnées) par des équivalents **fictifs**, sans rien réduire - même
nombre de lignes, mêmes codes, même structure (hiérarchie, comptes). On ne
touche QUE les données, jamais le schéma.

Trois référentiels seulement, les seuls qui exposent du réel :
  - Structures      : l'organigramme réel (directions / départements / services).
  - Fournisseurs divers : vrais fournisseurs nommés (télécom, électricité...).
  - Journaux comptables  : vrais noms de banques.

La nomenclature médicale standard (spécialités, types de prestations,
médicaments, articles) n'est **pas** touchée : elle n'a rien de confidentiel et
doit rester identique à LAMPS.

    python manage.py masquer_donnees_internes
    python manage.py masquer_donnees_internes --seed 42   # reproductible
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction

from donnees_de_base.models import FournisseurDivers, JournalComptable, StructureEntite

# --- Organigramme fictif -----------------------------------------------------
# Un libellé par entité, assigné dans l'ordre des codes (la hiérarchie, portée
# par les codes/parents, reste intacte). Style sans préfixe, comme l'original.
DIRECTIONS = [
    'Direction Générale',
    'Direction Administrative et Financière',
    'Direction des Ressources Humaines',
    'Direction des Opérations',
    'Direction Commerciale et Marketing',
    'Direction Qualité et Sécurité',
    'Direction des Systèmes d’Information',
    'Direction des Achats et Approvisionnements',
    'Direction Juridique et Conformité',
    'Direction de l’Audit Interne',
    'Direction de la Stratégie et du Développement',
    'Direction du Patrimoine',
    'Direction de l’Innovation',
]
DEPARTEMENTS = [
    'Comptabilité',
    'Budget et Contrôle de Gestion',
    'Trésorerie',
    'Gestion du Personnel',
    'Formation',
    'Recrutement',
    'Maintenance Industrielle',
    'Production',
    'Laboratoire Central',
    'Informatique',
    'Approvisionnements',
    'Logistique',
    'Sécurité des Sites',
    'Environnement',
    'Communication',
    'Marchés et Contrats',
    'Études Techniques',
    'Planification',
    'Documentation',
    'Qualité',
]
SERVICES = [
    'Exploitation',
    'Support aux Utilisateurs',
    'Développement',
    'Infrastructure',
    'Centre de Services',
    'Applications Métier',
    'Gestion IPM',
    'Reporting',
    'Préparation',
    'Inspection',
    'Métrologie',
    'Magasin Central',
    'Ordonnancement',
    'Facturation',
    'Recouvrement',
    'Projets',
    'Sécurité Informatique',
    'Supervision',
    'Accueil',
    'Archives',
]
POOLS_STRUCTURE = {'DIR': DIRECTIONS, 'DEP': DEPARTEMENTS, 'SRV': SERVICES}

# --- Fournisseurs divers fictifs ---------------------------------------------
FOURNISSEURS_DIVERS = [
    'ATLANTIQUE BUREAUTIQUE SARL',
    'SAHEL DISTRIBUTION',
    'IMPRIMERIE DU FLEUVE',
    'TELECOM SERVICES SA',
    'ENERGIE SERVICES SA',
    'SOCIETE DES EAUX URBAINES',
    'PAPETERIE MODERNE',
    'BUREAU PLUS SARL',
    'INFORMATIQUE ET RESEAUX SA',
    'GALAXY DISTRIBUTION',
    'OFFICE CENTER SENEGAL',
    'EDITIONS DU BAOBAB',
    'FOURNITURES GENERALES SARL',
    'CLINIQUE INTERNATIONALE PARTENAIRE',
    'CENTRE MEDICAL EUROPEEN',
    'MATERIEL ET SERVICES SA',
    'COMPTOIR COMMERCIAL DU SENEGAL',
    'NEGOCE ET SERVICES SARL',
    'TECHNOLOGIES ET SOLUTIONS SA',
    'DISTRIBUTION OUEST AFRICAINE',
]

# --- Banques fictives : les vrais noms de banques des journaux sont remplacés.
# On garde les libellés comptables génériques (caisse, avoir, imputation...).
BANQUES_REELLES = {
    'CREDIT DU SENEGAL': 'BANQUE DU LITTORAL',
    'ECOBANK': 'BANQUE DE L’UNION',
}

PRENOMS_M = ['Mamadou', 'Ibrahima', 'Ousmane', 'Cheikh', 'Moussa', 'Alioune', 'Babacar']
PRENOMS_F = ['Awa', 'Fatou', 'Aminata', 'Ndeye', 'Khady', 'Aissatou', 'Coumba']
NOMS = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Diallo', 'Gueye', 'Sarr', 'Faye', 'Niang']
BANQUES = ['CBAO', 'SGBS', 'BICIS', 'BOA SENEGAL', 'BHS', 'ORABANK', 'CORIS BANK']


class Command(BaseCommand):
    help = "Remplace par du fictif les référentiels internes réels (structures, fournisseurs divers, journaux)."

    def add_arguments(self, parser):
        parser.add_argument('--seed', type=int, default=None)

    def handle(self, *args, **options):
        if options['seed'] is not None:
            random.seed(options['seed'])

        with transaction.atomic():
            n_struct = self._structures()
            n_fourn = self._fournisseurs_divers()
            n_journ = self._journaux()

        self.stdout.write(
            self.style.SUCCESS(
                f'Masqué (données uniquement) : {n_struct} structures, '
                f'{n_fourn} fournisseurs divers, {n_journ} journaux comptables. '
                'Nomenclature médicale non touchée.'
            )
        )

    @staticmethod
    def _unique(base, pris):
        nom, n = base, 1
        while nom.upper() in pris:
            n += 1
            nom = f'{base} {n}'
        pris.add(nom.upper())
        return nom

    def _structures(self):
        """Renomme chaque entité par un libellé fictif de son type (DIR/DEP/SRV)."""
        entites = list(StructureEntite.objects.order_by('code'))
        curseurs = {'DIR': 0, 'DEP': 0, 'SRV': 0}
        pris = set()
        for e in entites:
            type_code = (e.type or e.code[:3]).upper()
            pool = POOLS_STRUCTURE.get(type_code, SERVICES)
            i = curseurs.get(type_code, 0)
            base = pool[i % len(pool)]
            curseurs[type_code] = i + 1
            e.libelle = self._unique(base, pris)
            e.save(update_fields=['libelle'])
        return len(entites)

    def _fournisseurs_divers(self):
        """Noms + coordonnées fictifs ; on garde le code (compte 401xxx)."""
        def tel():
            return f'33 8{random.randint(0, 99):02d} {random.randint(0, 99):02d} {random.randint(0, 99):02d}'

        def mobile():
            return (
                f'{random.choice(["70", "75", "76", "77", "78"])} '
                f'{random.randint(100, 999)} {random.randint(0, 99):02d} {random.randint(0, 99):02d}'
            )

        def slug(nom):
            return ''.join(c for c in nom.lower() if c.isalnum())

        fournisseurs = list(FournisseurDivers.objects.order_by('code'))
        pris = set()
        lieux = ['PLATEAU', 'MEDINA', 'FANN', 'POINT E', 'MERMOZ', 'HLM', 'ALMADIES', 'YOFF']
        for i, f in enumerate(fournisseurs):
            base = FOURNISSEURS_DIVERS[i % len(FOURNISSEURS_DIVERS)]
            f.libelle = self._unique(base, pris)
            lieu = random.choice(lieux)
            f.adresse = f'{lieu}, DAKAR'
            f.telephone = tel()
            f.email = f'contact@{slug(f.libelle)[:24]}.sn'
            f.ninea = f'{random.randint(0, 10**9 - 1):09d}'
            masculin = random.random() < 0.5
            f.contact_nom = (
                f'{random.choice(PRENOMS_M if masculin else PRENOMS_F)} {random.choice(NOMS)}'
            )
            f.contact_telephone = mobile()
            f.banque_nom = random.choice(BANQUES)
            f.banque_code = f'SN{random.randint(1, 199):03d}'
            f.guichet_code = f'{random.randint(0, 99999):05d}'
            f.compte_bancaire = f'{random.randint(0, 10**12 - 1):012d}'
            f.cle_rib = f'{random.randint(1, 99):02d}'
            f.save()
        return len(fournisseurs)

    def _journaux(self):
        """Remplace les vrais noms de banques ; garde les libellés comptables."""
        journaux = list(JournalComptable.objects.all())
        for j in journaux:
            libelle = j.libelle or ''
            for reel, fictif in BANQUES_REELLES.items():
                if reel in libelle.upper():
                    # Remplacement insensible à la casse, en gardant le suffixe.
                    haut = libelle.upper()
                    pos = haut.index(reel)
                    libelle = libelle[:pos] + fictif + libelle[pos + len(reel):]
            if libelle != j.libelle:
                j.libelle = libelle
                j.save(update_fields=['libelle'])
        return len(journaux)

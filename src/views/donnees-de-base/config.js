/**
 * Description des référentiels de la section « Données de base ».
 *
 * Tous les référentiels partagent la même mécanique (une liste de codes que
 * l'on consulte, complète et désactive). Un seul composant <Referentiel />
 * les affiche tous : ajouter un référentiel = ajouter une entrée ici,
 * aucun composant à écrire.
 *
 * Champ d'un référentiel :
 *   cle         identifiant technique, sert d'URL et de clé de stockage
 *   libelle     nom affiché dans la liste de gauche
 *   famille     regroupement dans la liste de gauche
 *   icone       icône CoreUI
 *   nouveau     libellé du bouton et du panneau de création
 *   modifier    titre du panneau de modification
 *   colonnes    définition de tous les champs de l'entrée
 *
 *   segments    { champ, valeurs } : un sélecteur segmenté partage la table
 *               selon ce champ ; le formulaire hérite du segment ouvert
 *   genererCode (valeurs, entrees) => string : calcule le champ marqué
 *               `calcule` au moment de la création
 *   selection   cases à cocher et actions groupées sur le tableau
 *   taillePage  nombre de lignes par page (10 par défaut)
 *   fiche       `false` retire l'œil de consultation ; présent partout sinon
 *
 * Deux options pour les référentiels riches (fiche fournisseur, adhérent…) :
 *   colonnesTableau  noms des champs affichés dans le tableau ; sans elle,
 *                    toutes les colonnes sont affichées
 *   formulaire       découpage de la saisie en onglets → sections → lignes,
 *                    chaque ligne portant un ou deux champs côte à côte.
 *                    Sans elle, les champs s'enchaînent un par ligne.
 *
 * Colonne :
 *   nom         clé dans l'enregistrement
 *   libelle     en-tête de colonne
 *   libelleForm label du champ dans le formulaire
 *   placeholder exemple de valeur affiché dans le champ vide
 *   largeur     largeur CSS de la colonne (facultatif, sinon flexible)
 *   mono        rendu en chasse fixe (codes, numéros de compte)
 *   type        type HTML de l'input : 'tel', 'email', 'number'…
 *   prefixe     affixe figé devant la saisie (indicatif téléphonique)
 *   options     le champ devient une liste déroulante. Tableau de chaînes,
 *               tableau de { valeur, libelle }, ou fonction
 *               (valeurs, entrees) => options pour une liste qui dépend de la
 *               saisie en cours
 *   visible     (valeurs) => bool : champ conditionnel
 *   dependDe    nom d'un champ dont ce champ dépend ; le modifier remet
 *               celui-ci à zéro
 *   calcule     engendré par l'application : absent du formulaire de saisie
 *   requis      obligatoire à la saisie ; accepte (valeurs) => bool
 *   unique      doit être unique dans le référentiel
 *   majuscules  la saisie est mise en majuscules
 *   maxLength   longueur maximale
 */

import {
  cilMedicalCross,
  cilHospital,
  cilCart,
  cilCalculator,
  cilTruck,
  cilPeople,
  cilSitemap,
  cilHealing,
} from '@coreui/icons'

import { PLAN_COMPTABLE } from './planComptable'

/** Natures possibles d'un journal comptable, proposées en liste déroulante. */
export const TYPES_JOURNAL = [
  'CAISSE',
  'TRANSFERT',
  'ACHAT',
  'BANQUE',
  'COTISATION',
  'REPORT',
  'RETENUE',
]

/**
 * Comptes d'achat proposés pour le rattachement d'un article (menu « Compte
 * rattaché »). Les libellés sont indicatifs : à confirmer avec la comptabilité,
 * seuls les numéros comptent à l'enregistrement.
 */
export const COMPTES_ACHAT = [
  ['604160', 'ACHATS DE PAPIER ET CARTON'],
  ['604700', 'FOURNITURES DE BUREAU'],
  ['604800', 'FOURNITURES CONSOMMABLES DIVERSES'],
  ['605500', 'FOURNITURES INFORMATIQUES'],
].map(([valeur, libelle]) => ({ valeur, libelle }))

/**
 * Structure interne de la SAR. Un seul référentiel, partitionné par le type :
 * le code est engendré à partir du préfixe du segment (DIR001, DEP014, SRV009).
 */
export const SEGMENTS_STRUCTURE = [
  {
    valeur: 'DIR',
    libelle: 'Directions',
    nouveau: 'Nouvelle direction',
    // Une direction est au sommet : pas de colonne de rattachement, elle
    // resterait vide sur toutes les lignes.
    colonnesTableau: ['code', 'libelle'],
  },
  {
    valeur: 'DEP',
    libelle: 'Départements',
    nouveau: 'Nouveau département',
    parent: 'DIR',
    colonnesTableau: ['code', 'libelle', 'parent'],
  },
  {
    valeur: 'SRV',
    libelle: 'Services',
    nouveau: 'Nouveau service',
    parent: 'DEP',
    colonnesTableau: ['code', 'libelle', 'parent'],
  },
]

/** Type d'entité auquel se rattache un type donné, ou null s'il est au sommet. */
const typeParent = (type) => SEGMENTS_STRUCTURE.find((s) => s.valeur === type)?.parent || null

export const FAMILLES = [
  { cle: 'organisation', libelle: 'Organisation' },
  { cle: 'adherents', libelle: 'Adhérents' },
  { cle: 'medical', libelle: 'Médical' },
  { cle: 'achats', libelle: 'Achats & fournisseurs' },
  { cle: 'comptabilite', libelle: 'Comptabilité' },
]

export const REFERENTIELS = [
  {
    cle: 'structure',
    libelle: 'Structure',
    famille: 'organisation',
    icone: cilSitemap,
    nouveau: 'Nouvelle entité',
    modifier: 'Modifier l’entité',

    // Le sélecteur segmenté partage la table selon ce champ. Le formulaire
    // hérite du segment ouvert, et le code s'en déduit.
    segments: { champ: 'type', valeurs: SEGMENTS_STRUCTURE },

    /**
     * Codes engendrés : préfixe du segment + rang sur trois chiffres. On repart
     * du plus grand numéro existant pour ne jamais réattribuer un code libéré
     * par une suppression — un code déjà cité ailleurs ne doit pas resservir.
     */
    genererCode: (valeurs, entrees) => {
      const prefixe = valeurs.type
      if (!prefixe) return ''
      const dernier = entrees
        .filter((e) => e.type === prefixe)
        .map((e) => Number(String(e.code).slice(prefixe.length)) || 0)
        .reduce((max, n) => Math.max(max, n), 0)
      return `${prefixe}${String(dernier + 1).padStart(3, '0')}`
    },

    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        largeur: '110px',
        mono: true,
        // Engendré à l'enregistrement : absent du formulaire de saisie.
        calcule: true,
      },
      {
        nom: 'libelle',
        libelle: 'Libellé',
        libelleForm: 'Libellé',
        placeholder: 'Service Info Centre',
        requis: true,
        // Seul référentiel dont les libellés ne sont pas en capitales.
      },
      {
        nom: 'type',
        libelle: 'Type',
        libelleForm: 'Type',
        largeur: '110px',
        mono: true,
        requis: true,
        options: SEGMENTS_STRUCTURE.map((s) => ({ valeur: s.valeur, libelle: s.libelle })),
      },
      {
        // Rattachement hiérarchique. Les valeurs proposées se déduisent du
        // type saisi : un département choisit parmi les directions, un service
        // parmi les départements, une direction n'a pas de parent.
        nom: 'parent',
        libelle: 'Rattachement',
        libelleForm: 'Rattaché à',
        visible: (valeurs) => Boolean(typeParent(valeurs.type)),
        requis: (valeurs) => Boolean(typeParent(valeurs.type)),
        // Changer le type invalide le parent : un département de la DSI n'est
        // pas un rattachement valide pour un service.
        dependDe: 'type',
        options: (valeurs, entrees) => {
          const cible = typeParent(valeurs.type)
          if (!cible) return []
          return entrees
            .filter((e) => e.type === cible && e.actif)
            .map((e) => ({ valeur: e.code, libelle: e.libelle }))
        },
      },
    ],
  },
  {
    cle: 'types-beneficiaires',
    libelle: 'Type Bénéficiaire',
    famille: 'adherents',
    icone: cilPeople,
    nouveau: 'Nouveau type',
    modifier: 'Modifier le type',

    // Rang séquentiel attribué par l'application, comme les autres codes de
    // la section : on repart du plus grand existant, jamais du nombre
    // d'entrées — un code libéré par une suppression ne doit pas resservir,
    // il est peut-être encore cité dans un dossier.
    genererCode: (valeurs, entrees) =>
      String(entrees.reduce((max, e) => Math.max(max, Number(e.code) || 0), 0) + 1),

    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        largeur: '90px',
        mono: true,
        // Engendré à l'enregistrement : absent du formulaire de saisie.
        calcule: true,
      },
      {
        nom: 'libelle',
        libelle: 'Libellé',
        libelleForm: 'Libellé du type',
        placeholder: 'CONCUBIN',
        requis: true,
        majuscules: true,
      },
    ],
  },
  {
    cle: 'types-prestations',
    libelle: 'Types de Prestations',
    famille: 'medical',
    icone: cilMedicalCross,
    nouveau: 'Nouvelle prestation',
    modifier: 'Modifier la prestation',

    // Code engendré : simple numéro d'ordre séquentiel sur deux chiffres, à
    // partir du plus grand existant. Le compte, lui, reste saisi : c'est une
    // imputation comptable réelle (OHADA), pas une déduction du code.
    genererCode: (valeurs, entrees) => {
      const dernier = entrees
        .map((e) => Number(e.code) || 0)
        .reduce((max, n) => Math.max(max, n), -1)
      return String(dernier + 1).padStart(2, '0')
    },

    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        largeur: '90px',
        mono: true,
        // Engendré à l'enregistrement : absent du formulaire de saisie.
        calcule: true,
      },
      {
        nom: 'libelle',
        libelle: 'Libellé',
        libelleForm: 'Libellé de la prestation',
        placeholder: 'KINESITHERAPIE',
        requis: true,
        majuscules: true,
      },
      {
        nom: 'compte',
        libelle: 'Compte',
        libelleForm: 'Compte de la prestation',
        placeholder: '602009',
        largeur: '160px',
        mono: true,
        requis: true,
        maxLength: 6,
      },
    ],
  },
  {
    cle: 'specialites',
    libelle: 'Spécialités',
    famille: 'medical',
    icone: cilHospital,
    nouveau: 'Nouvelle spécialité',
    modifier: 'Modifier la spécialité',
    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        libelleForm: 'Code de la spécialité',
        placeholder: '30',
        largeur: '90px',
        mono: true,
        requis: true,
        unique: true,
        maxLength: 2,
      },
      {
        nom: 'libelle',
        libelle: 'Spécialité',
        libelleForm: 'Nom de la spécialité',
        placeholder: 'CENTRES D’IMAGERIE',
        requis: true,
        majuscules: true,
      },
      {
        nom: 'compte',
        libelle: 'Compte',
        libelleForm: 'Compte de la spécialité',
        placeholder: '400030',
        largeur: '160px',
        mono: true,
        requis: true,
        maxLength: 6,
      },
    ],
  },
  {
    cle: 'medicaments',
    libelle: 'Médicaments',
    famille: 'medical',
    icone: cilHealing,
    nouveau: 'Nouveau médicament',
    modifier: 'Modifier le médicament',

    // Cases à cocher : on agit ici sur plusieurs lignes à la fois — exclure du
    // remboursement, réintégrer ou désactiver une sélection de médicaments.
    selection: true,
    actionsLot: [
      { libelle: 'Exclure', champs: { exclus: true }, message: 'exclus du remboursement' },
      { libelle: 'Réintégrer', champs: { exclus: false }, message: 'réintégrés' },
      { libelle: 'Désactiver', champs: { actif: false }, message: 'désactivés', danger: true },
    ],

    // Filtre sur un booléen, donc par prédicat et non par égalité de champ.
    // « Tous » d'abord : c'est la vue neutre, celle où rien ne se cache.
    segments: {
      valeurs: [
        { valeur: 'tous', libelle: 'Tous' },
        { valeur: 'inclus', libelle: 'Non exclus', filtre: (e) => !e.exclus },
        { valeur: 'exclus', libelle: 'Exclus', filtre: (e) => Boolean(e.exclus) },
      ],
    },

    colonnesTableau: ['code', 'libelle', 'compte', 'exclus', 'tarif'],

    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        libelleForm: 'Code médicament',
        placeholder: '7112216',
        largeur: '110px',
        mono: true,
        requis: true,
        unique: true,
        maxLength: 7,
      },
      {
        nom: 'libelle',
        libelle: 'Libellé',
        libelleForm: 'Libellé médicament',
        placeholder: 'PARACETAMOL CP B/20',
        requis: true,
        majuscules: true,
      },
      {
        // Verrouillée : un médicament ne se rattache qu'à la pharmacie.
        nom: 'prestation',
        libelle: 'Prestation',
        libelleForm: 'Prestation',
        lectureSeule: true,
        valeur: () => '06',
        options: [{ valeur: '06', libelle: 'PHARMACIE' }],
      },
      {
        // Verrouillé, comme la prestation dont il découle : le compte suit la
        // règle 6020 + code de prestation, et un médicament ne relève que de
        // la pharmacie. Il vaut donc toujours 602006 ; il se lit, il ne se
        // saisit pas.
        nom: 'compte',
        libelle: 'Compte',
        libelleForm: 'Compte',
        largeur: '110px',
        mono: true,
        lectureSeule: true,
        valeur: () => '602006',
      },
      {
        nom: 'exclus',
        libelle: 'Exclus',
        libelleForm: 'Exclu du remboursement',
        largeur: '110px',
        type: 'booleen',
      },
      {
        nom: 'tarif',
        libelle: 'Tarif',
        libelleForm: 'Tarif',
        largeur: '120px',
        mono: true,
        type: 'number',
        aligne: 'droite',
        placeholder: '0',
      },
    ],
  },
  {
    cle: 'articles-achat',
    libelle: 'Articles Achat',
    famille: 'achats',
    icone: cilCart,
    nouveau: 'Nouveau article',
    modifier: 'Modifier l’article',

    // Code engendré comme dans l'application d'origine : préfixe ART + rang sur
    // quatre chiffres, à partir du plus grand numéro existant.
    genererCode: (valeurs, entrees) => {
      const dernier = entrees
        .map((e) => Number(String(e.code).replace(/^ART/, '')) || 0)
        .reduce((max, n) => Math.max(max, n), 0)
      return `ART${String(dernier + 1).padStart(4, '0')}`
    },

    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        largeur: '110px',
        mono: true,
        // Engendré à l'enregistrement : absent du formulaire de saisie.
        calcule: true,
      },
      {
        nom: 'libelle',
        libelle: 'Designation',
        libelleForm: 'Designation de l’article',
        placeholder: 'Carton Papier A4 (5 Rames)',
        requis: true,
        // Casse normale, comme à l'écran d'origine (pas de mise en capitales).
      },
      {
        nom: 'prixUnitaire',
        libelle: 'Prix unitaire',
        libelleForm: 'Prix unitaire',
        largeur: '140px',
        type: 'number',
        aligne: 'droite',
        // Prérempli à 0, comme le formulaire d'origine.
        defaut: 0,
        placeholder: '0',
      },
      {
        // Facultatif : « Aucun » possible. Choisi dans les comptes d'achat.
        nom: 'compte',
        libelle: 'Compte',
        libelleForm: 'Compte rattaché',
        largeur: '160px',
        mono: true,
        options: COMPTES_ACHAT,
        // Le menu propose « 604700 - FOURNITURES DE BUREAU », mais le tableau
        // affiche le seul numéro de compte, comme l'application d'origine.
        afficherCode: true,
      },
    ],
  },
  {
    cle: 'journaux-comptables',
    libelle: 'Journaux Comptable',
    famille: 'comptabilite',
    icone: cilCalculator,
    nouveau: 'Nouveau journal',
    modifier: 'Modifier le journal',
    colonnes: [
      {
        nom: 'code',
        libelle: 'Code',
        libelleForm: 'Code journal',
        placeholder: 'B13',
        largeur: '90px',
        mono: true,
        requis: true,
        unique: true,
        maxLength: 3,
        majuscules: true,
      },
      {
        nom: 'libelle',
        libelle: 'Libellé',
        libelleForm: 'Libellé journal',
        placeholder: 'ECOBANK MSRNC',
        requis: true,
        majuscules: true,
      },
      {
        // Facultatifs : certains journaux techniques (avoirs, clôture)
        // n'ont ni type ni compte de contrepartie.
        nom: 'type',
        libelle: 'Type',
        libelleForm: 'Type',
        largeur: '150px',
        options: TYPES_JOURNAL,
      },
      {
        nom: 'compte',
        libelle: 'Compte',
        libelleForm: 'Compte journal',
        largeur: '150px',
        mono: true,
        options: PLAN_COMPTABLE,
      },
    ],
  },
  {
    cle: 'fournisseurs-divers',
    libelle: 'Fournisseurs Divers',
    famille: 'achats',
    icone: cilTruck,
    nouveau: 'Nouveau fournisseur',
    modifier: 'Modifier le fournisseur',

    // Le tableau ne retient que de quoi identifier et joindre le fournisseur.
    // Coordonnées complètes, contact et domiciliation bancaire vivent dans la
    // fiche : quinze colonnes défilant à l'horizontale ne se lisent pas.
    colonnesTableau: ['code', 'libelle', 'telephone'],

    // Le compte fournisseur (401xxx) tient lieu de code : c'est lui qui
    // identifie la ligne dans l'application d'origine.
    colonnes: [
      {
        nom: 'code',
        libelle: 'Compte',
        libelleForm: 'Compte',
        placeholder: '401022',
        largeur: '110px',
        mono: true,
        requis: true,
        unique: true,
        maxLength: 6,
      },
      {
        nom: 'libelle',
        libelle: 'Intitulé',
        libelleForm: 'Intitulé',
        placeholder: 'SENEGALAISE DE L’AUTOMOBILE',
        requis: true,
        majuscules: true,
      },
      {
        nom: 'adresse',
        libelle: 'Adresse',
        libelleForm: 'Adresse',
        placeholder: '27, Avenue G. POMPIDOU - DAKAR',
      },
      {
        nom: 'telephone',
        libelle: 'Téléphone',
        libelleForm: 'Téléphone',
        largeur: '170px',
        mono: true,
        type: 'tel',
        prefixe: '+221',
        placeholder: '33 889 00 00',
      },
      {
        nom: 'email',
        libelle: 'Email',
        libelleForm: 'Email',
        type: 'email',
        placeholder: 'contact@fournisseur.sn',
      },
      {
        nom: 'ninea',
        libelle: 'NINEA',
        libelleForm: 'NINEA',
        mono: true,
        placeholder: '004561234',
      },
      {
        nom: 'delaiReglement',
        libelle: 'Délai',
        libelleForm: 'Délai de règlement (en jours)',
        type: 'number',
        placeholder: '15',
      },
      {
        nom: 'contactNom',
        libelle: 'Contact',
        libelleForm: 'Prénom & Nom',
        placeholder: 'Awa NDIAYE',
      },
      {
        nom: 'contactTelephone',
        libelle: 'Téléphone contact',
        libelleForm: 'Téléphone',
        mono: true,
        type: 'tel',
        prefixe: '+221',
        placeholder: '77 123 45 67',
      },
      {
        nom: 'banqueNom',
        libelle: 'Banque',
        libelleForm: 'Nom Banque',
        placeholder: 'CBAO',
        majuscules: true,
      },
      {
        nom: 'banqueCode',
        libelle: 'Code banque',
        libelleForm: 'Code Banque',
        mono: true,
        maxLength: 5,
        placeholder: 'SN012',
      },
      {
        nom: 'guichetCode',
        libelle: 'Code guichet',
        libelleForm: 'Code Guichet',
        mono: true,
        maxLength: 5,
        placeholder: '01001',
      },
      {
        nom: 'compteBancaire',
        libelle: 'Compte bancaire',
        libelleForm: 'Compte bancaire',
        mono: true,
        maxLength: 12,
        placeholder: '000123456789',
      },
      {
        nom: 'cleRib',
        libelle: 'Clé RIB',
        libelleForm: 'Clé RIB',
        mono: true,
        maxLength: 2,
        placeholder: '76',
      },
    ],

    formulaire: [
      {
        libelle: 'Infos Générales',
        sections: [
          {
            lignes: [
              ['code'],
              ['libelle'],
              ['adresse'],
              ['telephone'],
              ['email'],
              ['ninea', 'delaiReglement'],
            ],
          },
          {
            titre: 'Contact',
            lignes: [['contactNom'], ['contactTelephone']],
          },
        ],
      },
      {
        libelle: 'Infos Bancaires',
        sections: [
          {
            lignes: [['banqueNom'], ['banqueCode', 'guichetCode'], ['compteBancaire', 'cleRib']],
          },
        ],
      },
    ],
  },
]

export const referentielParCle = (cle) => REFERENTIELS.find((r) => r.cle === cle)

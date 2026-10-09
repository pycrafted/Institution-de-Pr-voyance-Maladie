/**
 * Description du référentiel « Fournisseurs de Soins ».
 *
 * Même grammaire que les référentiels de « Données de base » - leur config.js
 * documente chaque option en détail. La page ne réécrit aucun composant : elle
 * décrit ses champs et laisse <Referentiel /> lister, chercher, filtrer,
 * paginer, créer, modifier et suspendre.
 *
 * Un fournisseur de soins est un prestataire conventionné - clinique,
 * pharmacie, laboratoire, cabinet - que la caisse rembourse. D'où une fiche
 * plus fournie qu'une simple nomenclature : coordonnées, interlocuteur, pièces
 * professionnelles et domiciliation bancaire.
 */

import { optionsReferentiel } from '../documents/commun'
import { listerEntreesSync } from '../../services/referentiels'
import FicheFournisseur from './FicheFournisseur'

/**
 * Spécialités proposées : lues dans le référentiel « Spécialités » des données
 * de base, seul endroit où ce classement est tenu - avec le compte comptable
 * qu'il porte. Les recopier ici ferait diverger les deux listes à la première
 * catégorie ajoutée.
 *
 * Une fonction plutôt qu'un tableau : `optionsDe` la résout à chaque rendu, si
 * bien qu'une spécialité créée dans Données de base est proposée aussitôt, sans
 * reconstruire l'application.
 *
 * Les spécialités désactivées ne sont plus proposées - désactiver sert
 * précisément à cela -, sauf celle que la fiche ouverte porte déjà : sans son
 * option, elle retomberait sur son code brut (« 08 » au lieu de
 * « CLINIQUES »). Cf. `optionsReferentiel` (views/documents/commun.js).
 */
const optionsSpecialite = (valeurs = {}) => optionsReferentiel('specialites', valeurs.specialite)

/**
 * Lignes du bloc « Contact » (interlocuteur chez le prestataire), partagées
 * par la fiche du fournisseur et par la demande d'agrément - un seul endroit à
 * tenir à jour. Le fournisseur les met dans son onglet « Contact » (le titre
 * de l'onglet suffit) ; la demande les présente sous un titre « Contact »
 * (`SECTION_CONTACT`), car tout y tient sur une seule page.
 */
export const CONTACT_LIGNES = [
  ['contactNom', 'contactPrenoms'],
  ['contactFonction'],
  ['contactTelephone', 'contactMobile'],
]

export const SECTION_CONTACT = { titre: 'Contact', lignes: CONTACT_LIGNES }

/**
 * Les quatre pièces justificatives, en sections qui se suivent sur la même
 * page - et non en onglets : tout se saisit d'un seul défilement, sans avoir à
 * cliquer d'onglet en onglet.
 */
export const SECTIONS_REFERENCES = [
  {
    titre: 'Carte médecin / pharmacien',
    lignes: [['carteNumero', 'carteDate'], ['carteAutorite']],
  },
  {
    titre: 'Immatriculation au registre du commerce',
    lignes: [['rcNumero', 'rcDate'], ['ninea']],
  },
  {
    titre: 'Autorisation du ministère de la Santé',
    lignes: [['autorisationNumero', 'autorisationDate']],
  },
  {
    titre: 'Identification bancaire',
    lignes: [['banqueNom'], ['banqueCode', 'guichetCode'], ['compteBancaire', 'cleRib']],
  },
]

export const FOURNISSEURS_DE_SOINS = {
  cle: 'fournisseurs-de-soins',
  libelle: 'Tous les fournisseurs',
  // Pas de titre au-dessus de la liste : l'onglet « Tous les Fournisseurs » et
  // l'en-tête de la page (cf. FournisseursDeSoins.jsx) disent déjà ce qu'on
  // regarde. Le total vient donc directement sous les onglets.
  sansTitre: true,
  // Total de la vue, sous les onglets, comme l'application d'origine.
  stats: (entrees) => `Total Fournisseurs: ${entrees.length}`,
  nouveau: 'Nouveau fournisseur',
  modifier: 'Modifier le fournisseur',

  // Un prestataire n'entre plus dans cette liste par saisie directe : il y est
  // admis, par la validation d'une demande d'agrément (onglet voisin, cf.
  // demandesAgrement.js). Le bouton de création a donc quitté cette liste.
  sansCreation: true,

  // On modifie un prestataire en cliquant sa ligne (pas de crayon) : la ligne
  // passe en surbrillance et le panneau de saisie s'ouvre, comme les
  // référentiels de données de base.
  modificationParLigne: true,

  // Bouton « œil » sur chaque ligne : la fiche détaillée du prestataire, en
  // lecture - coordonnées, banque, compte, plan de l'adresse - comme la page
  // « Détails fournisseur » de l'application d'origine.
  fiche: FicheFournisseur,

  // Pas de bandeau « Total Fournisseurs » au-dessus de la liste (retiré à la demande).

  // Import et export Excel (cf. donnees-de-base/excel.js) : l'export écrit la
  // vue affichée ; l'import met à jour ou crée des fiches, une fois tout le
  // fichier validé par le serveur.
  outils: ['import', 'export'],

  // Le tableau retient de quoi identifier et joindre le prestataire. Le reste
  // - contact, pièces, banque - vit dans la fiche : quinze colonnes défilant à
  // l'horizontale ne se lisent pas.
  colonnesTableau: ['code', 'libelle', 'adresse', 'telephone', 'mobile', 'actif', 'specialite'],

  // Cases à cocher, comme pour les médicaments : suspendre ou rétablir d'un
  // geste les conventions d'une sélection de prestataires.
  actionsLot: [
    // Export partiel : seules les lignes cochées partent dans le fichier.
    { libelle: 'Export Excel', type: 'export' },
    { libelle: 'Rétablir', champs: { actif: true }, message: 'rétablis' },
    {
      libelle: 'Suspendre',
      champs: { actif: false },
      message: 'suspendus',
      danger: true,
      // Suspendre coupe le remboursement des prestataires : sur plusieurs à la
      // fois, on confirme.
      confirmer: (n) => `Suspendre la convention de ${n} fournisseur${n > 1 ? 's' : ''} ?`,
    },
  ],

  // Une convention se suspend et se rétablit - elle ne se « désactive » pas.
  // Le tableau et les infobulles reprennent donc le mot du sélecteur.
  etat: {
    // Un prestataire n'est pas « actif » : il est sous convention. Le mot
    // court de la pastille, celui du sélecteur et celui des infobulles disent
    // maintenant la même chose.
    actif: 'Conventionné',
    inactif: 'Suspendu',
    desactiver: 'Suspendre la convention',
    reactiver: 'Rétablir la convention',
    desactive: 'suspendu',
    reactive: 'rétabli',
  },

  /**
   * L'état est ici une information de premier plan : rembourser un
   * prestataire dont la convention est dénoncée serait une erreur de gestion.
   * Il prend donc la place du sélecteur segmenté plutôt que celle de
   * l'interrupteur discret des nomenclatures.
   *
   * `activite: true` prévient <Referentiel /> que ces segments portent déjà
   * l'actif/inactif : sans ça, « Suspendus » ne montrerait rien, le filtre
   * d'activité s'appliquant après le segment.
   */
  segments: {
    activite: true,
    valeurs: [
      { valeur: 'tous', libelle: 'Tous' },
      { valeur: 'actifs', libelle: 'Conventionnés', filtre: (e) => e.actif },
      { valeur: 'suspendus', libelle: 'Suspendus', filtre: (e) => !e.actif },
    ],
  },

  // Recherche et spécialité à gauche ; le sélecteur Tous / Conventionnés /
  // Suspendus rejoint Import et Export, tout à droite - comme l'application
  // d'origine, dont on ne garde pas le mot « Actifs ».
  segmentsADroite: true,

  // On cherche un prestataire autant par sa spécialité que par son nom.
  filtres: [
    {
      champ: 'specialite',
      etiquette: 'Spécialité',
      libelle: 'Toutes les spécialités',
      options: optionsSpecialite,
    },
  ],

  // Recherche et filtre soulignés, sans cadre, l'étiquette du filtre posée
  // au-dessus - comme l'application d'origine.
  champsSoulignes: true,

  // Pas de `genererCode` : un fournisseur naît d'une demande d'agrément, dont
  // il garde le numéro. Fournisseurs et demandes partagent une même série, que
  // le serveur seul voit en entier (cf. FournisseurDeSoins.prochain_code).

  taillePage: 12,

  colonnes: [
    // Visible et modifiable, comme les codes des données de base. Repris tel
    // quel par les demandes d'agrément : un même numéro, un même champ.
    {
      nom: 'code',
      libelle: 'Numéro',
      libelleForm: 'Numéro',
      largeur: '90px',
      mono: true,
      unique: true,
      maxLength: 10,
    },
    {
      nom: 'libelle',
      libelle: 'Raison sociale',
      libelleForm: 'Raison sociale',
      // Obligatoire, comme dans l'application d'origine (astérisque) - avec la
      // spécialité. Repris tel quel par les demandes d'agrément.
      requis: true,
      majuscules: true,
    },
    {
      nom: 'specialite',
      libelle: 'Spécialité',
      libelleForm: 'Spécialité',
      largeur: '180px',
      options: optionsSpecialite,
      requis: true,
    },
    {
      /*
       * Compte du prestataire au grand-livre. L'application d'origine le
       * crédite à la comptabilisation d'une facture (journal IF) puis le débite
       * au règlement : sans lui, aucun compte fournisseur ne se tient.
       *
       * Proposé d'après la spécialité - dont le compte fait office de compte
       * collectif (« 400008 » pour les cliniques) - et modifiable : la
       * numérotation propre à chaque prestataire appartient à la comptabilité.
       */
      nom: 'compte',
      libelle: 'Compte',
      libelleForm: 'Compte comptable',
      largeur: '110px',
      mono: true,
      maxLength: 6,
      valeurProposee: (valeurs) =>
        listerEntreesSync('specialites').find((s) => s.code === valeurs.specialite)?.compte || '',
    },
    {
      nom: 'adresse',
      libelle: 'Adresse',
      libelleForm: 'Adresse',
    },
    {
      nom: 'telephone',
      libelle: 'Fixe',
      libelleForm: 'Téléphone fixe',
      largeur: '150px',
      mono: true,
      type: 'tel',
      amorce: '+221 ',
    },
    {
      nom: 'mobile',
      libelle: 'Portable',
      libelleForm: 'Téléphone mobile',
      largeur: '150px',
      mono: true,
      type: 'tel',
      amorce: '+221 ',
    },
    // Position de la structure, en degrés décimaux : l'application mobile des
    // employés s'en sert pour les guider jusqu'à la porte (bouton « S'y
    // rendre »). Elle se copie telle quelle depuis une carte - clic droit sur
    // le point dans Google Maps, puis le premier nombre pour la latitude, le
    // second pour la longitude. Virgule ou point, peu importe : le serveur
    // accepte les deux, et arrondit à six décimales. Hors du tableau : c'est
    // une donnée de la fiche, pas de la liste.
    {
      nom: 'latitude',
      libelle: 'Latitude',
      libelleForm: 'Latitude',
      largeur: '120px',
      mono: true,
      placeholder: 'ex. 14.692778',
    },
    {
      nom: 'longitude',
      libelle: 'Longitude',
      libelleForm: 'Longitude',
      largeur: '120px',
      mono: true,
      placeholder: 'ex. -17.446722',
    },
    {
      // État de la convention, présenté comme chez les adhérents : une colonne
      // à part entière plutôt qu'une pastille accolée au numéro. Rembourser un
      // prestataire dont la convention est dénoncée serait une erreur de
      // gestion - l'information mérite sa place dans le tableau.
      //
      // Dans le formulaire, seulement en modification : une convention qu'on
      // vient de signer est active, la bascule n'aurait rien à proposer.
      nom: 'actif',
      libelle: 'Etat',
      libelleForm: 'Etat',
      type: 'etat',
      defaut: true,
      largeur: '110px',
      // Sur l'identifiant et non le numéro : le numéro se modifie, et le vider
      // ne doit pas faire disparaître l'état.
      visible: (valeurs) => Boolean(valeurs.id),
    },

    // --- Interlocuteur chez le prestataire --------------------------------
    {
      nom: 'contactNom',
      libelle: 'Contact',
      libelleForm: 'Nom',
      majuscules: true,
    },
    {
      nom: 'contactPrenoms',
      libelle: 'Prénoms contact',
      libelleForm: 'Prénoms',
    },
    {
      nom: 'contactFonction',
      libelle: 'Fonction contact',
      libelleForm: 'Fonction',
    },
    {
      nom: 'contactTelephone',
      libelle: 'Fixe contact',
      libelleForm: 'Téléphone fixe',
      mono: true,
      type: 'tel',
      amorce: '+221 ',
    },
    {
      nom: 'contactMobile',
      libelle: 'Portable contact',
      libelleForm: 'Téléphone mobile',
      mono: true,
      type: 'tel',
      amorce: '+221 ',
    },

    // --- Pièces professionnelles ------------------------------------------
    // Chaque pièce porte son numéro et sa date de délivrance : une
    // autorisation sans date ne permet pas de savoir si elle court encore.
    {
      nom: 'carteNumero',
      libelle: 'Carte professionnelle',
      libelleForm: 'Numéro de carte',
      mono: true,
    },
    {
      nom: 'carteDate',
      libelle: 'Date carte',
      libelleForm: 'Délivrée le',
      type: 'date',
    },
    {
      // Qui a délivré la carte : l'ordre professionnel dont relève le
      // praticien. Sans lui, le numéro seul ne se vérifie pas.
      nom: 'carteAutorite',
      libelle: 'Autorité carte',
      libelleForm: 'Autorité',
      majuscules: true,
    },
    {
      nom: 'rcNumero',
      libelle: 'Registre du commerce',
      libelleForm: 'Numéro R.C.',
      mono: true,
    },
    {
      nom: 'rcDate',
      libelle: 'Date R.C.',
      libelleForm: 'Date d’immatriculation',
      type: 'date',
    },
    { nom: 'ninea', libelle: 'NINEA', libelleForm: 'NINEA', mono: true },
    {
      nom: 'autorisationNumero',
      libelle: 'Autorisation Santé',
      libelleForm: 'Numéro d’autorisation',
      mono: true,
    },
    {
      nom: 'autorisationDate',
      libelle: 'Date autorisation',
      libelleForm: 'Délivrée le',
      type: 'date',
    },

    // --- Domiciliation bancaire -------------------------------------------
    {
      nom: 'banqueNom',
      libelle: 'Banque',
      libelleForm: 'Nom banque',
      majuscules: true,
    },
    {
      nom: 'banqueCode',
      libelle: 'Code banque',
      libelleForm: 'Code banque',
      mono: true,
      maxLength: 5,
    },
    {
      nom: 'guichetCode',
      libelle: 'Code guichet',
      libelleForm: 'Code guichet',
      mono: true,
      maxLength: 5,
    },
    {
      nom: 'compteBancaire',
      libelle: 'Compte bancaire',
      libelleForm: 'Compte bancaire',
      mono: true,
      maxLength: 34,
    },
    {
      nom: 'cleRib',
      libelle: 'Clé RIB',
      libelleForm: 'Clé RIB',
      mono: true,
      maxLength: 2,
    },

    // --- Coordonnées complémentaires (en-tête de la fiche d'origine) --------
    // Présentes sur la « Détails fournisseur » de LAMPS : on les rend donc
    // saisissables, pour que les anciens utilisateurs y retrouvent leurs
    // rubriques. Souvent vides, jamais obligatoires.
    { nom: 'email', libelle: 'Email', libelleForm: 'Email', type: 'email' },
    { nom: 'fax', libelle: 'FAX', libelleForm: 'FAX', mono: true },
    { nom: 'bp', libelle: 'Boîte postale', libelleForm: 'Boîte postale' },
    { nom: 'region', libelle: 'Région', libelleForm: 'Région' },
    { nom: 'pays', libelle: 'Pays', libelleForm: 'Pays' },
    { nom: 'siteWeb', libelle: 'Site web', libelleForm: 'Site web' },

    // --- Convention ---------------------------------------------------------
    { nom: 'dateDebut', libelle: 'Date de début', libelleForm: 'Date de début', type: 'date' },
    {
      nom: 'dateDebutConvention',
      libelle: 'Début convention',
      libelleForm: 'Début de convention',
      type: 'date',
    },
    {
      nom: 'dateFinConvention',
      libelle: 'Fin convention',
      libelleForm: 'Fin de convention',
      type: 'date',
    },
  ],

  /**
   * Trois onglets, comme avant : les coordonnées du prestataire, son
   * interlocuteur, puis ses pièces justificatives. Les pièces restent des
   * sections qui se suivent dans leur onglet - pas de sous-onglets.
   */
  formulaire: [
    {
      libelle: 'Fournisseur',
      sections: [
        {
          lignes: [
            // L'état (bascule Actif/Suspendu, le conventionnement du
            // prestataire) tout en haut.
            ['actif'],
            // Numéro et spécialité à deux colonnes - la spécialité a enfin la
            // place de s'afficher en entier.
            ['code', 'specialite'],
            ['compte'],
            ['libelle'],
            ['email', 'adresse'],
            ['telephone', 'mobile'],
            ['fax', 'bp'],
            ['region', 'pays'],
            ['siteWeb'],
            ['dateDebut'],
            ['dateDebutConvention', 'dateFinConvention'],
          ],
        },
        {
          // Sous l'adresse, dont elle est la traduction pour le téléphone.
          titre: 'Localisation',
          lignes: [['latitude', 'longitude']],
        },
      ],
    },
    {
      libelle: 'Contact',
      sections: [{ lignes: CONTACT_LIGNES }],
    },
    {
      // Les quatre pièces (carte, registre du commerce, autorisation, banque)
      // affichées d'un coup, empilées avec leur titre - plus de sous-onglets.
      libelle: 'Références professionnelles',
      sections: SECTIONS_REFERENCES,
    },
  ],
}

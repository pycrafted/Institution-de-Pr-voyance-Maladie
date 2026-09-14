/**
 * Description du référentiel « Fournisseurs de Soins ».
 *
 * Même grammaire que les référentiels de « Données de base » — leur config.js
 * documente chaque option en détail. La page ne réécrit aucun composant : elle
 * décrit ses champs et laisse <Referentiel /> lister, chercher, filtrer,
 * paginer, créer, modifier et suspendre.
 *
 * Un fournisseur de soins est un prestataire conventionné — clinique,
 * pharmacie, laboratoire, cabinet — que la caisse rembourse. D'où une fiche
 * plus fournie qu'une simple nomenclature : coordonnées, interlocuteur, pièces
 * professionnelles et domiciliation bancaire.
 */

import { listerEntreesSync } from '../../services/referentiels'

/**
 * Spécialités proposées : lues dans le référentiel « Spécialités » des données
 * de base, seul endroit où ce classement est tenu — avec le compte comptable
 * qu'il porte. Les recopier ici ferait diverger les deux listes à la première
 * catégorie ajoutée.
 *
 * Une fonction plutôt qu'un tableau : `optionsDe` la résout à chaque rendu, si
 * bien qu'une spécialité créée dans Données de base est proposée aussitôt, sans
 * reconstruire l'application.
 *
 * Aucune n'est écartée, pas même une spécialité désactivée : la même liste sert
 * à saisir et à afficher, et la retirer ferait retomber les fiches qui la
 * portent sur leur code brut — « 08 » au lieu de « CLINIQUES ».
 */
const optionsSpecialite = () =>
  listerEntreesSync('specialites').map((s) => ({ valeur: s.code, libelle: s.libelle }))

export const FOURNISSEURS_DE_SOINS = {
  cle: 'fournisseurs-de-soins',
  libelle: 'Tous les fournisseurs',
  // Pas de titre au-dessus de la liste : l'onglet « Tous les Fournisseurs » et
  // l'en-tête de la page (cf. FournisseursDeSoins.jsx) disent déjà ce qu'on
  // regarde. Le total vient donc directement sous les onglets.
  sansTitre: true,
  nouveau: 'Nouveau fournisseur',
  modifier: 'Modifier le fournisseur',

  // Un prestataire n'entre plus dans cette liste par saisie directe : il y est
  // admis, par la validation d'une demande d'agrément (onglet voisin, cf.
  // demandesAgrement.js). Le bouton de création a donc quitté cette liste.
  sansCreation: true,

  // Le nombre de prestataires est une information de premier plan : il se lit
  // au-dessus de la liste, comme dans l'application d'origine. C'est le total
  // de la vue — segment, recherche et spécialité compris — pour que le chiffre
  // réponde toujours à la question que pose l'écran.
  stats: (entrees) => `Total Fournisseurs : ${entrees.length}`,

  // Import et export Excel (cf. donnees-de-base/excel.js) : l'export écrit la
  // vue affichée ; l'import met à jour ou crée des fiches, une fois tout le
  // fichier validé par le serveur.
  outils: ['import', 'export'],

  // Le tableau retient de quoi identifier et joindre le prestataire. Le reste
  // — contact, pièces, banque — vit dans la fiche : quinze colonnes défilant à
  // l'horizontale ne se lisent pas.
  colonnesTableau: ['code', 'libelle', 'adresse', 'telephone', 'mobile', 'actif', 'specialite'],

  // Cases à cocher, comme pour les médicaments : suspendre ou rétablir d'un
  // geste les conventions d'une sélection de prestataires.
  selection: true,
  actionsLot: [
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

  // Une convention se suspend et se rétablit — elle ne se « désactive » pas.
  // Le tableau et les infobulles reprennent donc le mot du sélecteur.
  etat: {
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
      { valeur: 'actifs', libelle: 'Actifs', filtre: (e) => e.actif },
      { valeur: 'suspendus', libelle: 'Suspendus', filtre: (e) => !e.actif },
    ],
  },

  // Recherche et spécialité à gauche ; le sélecteur Tous / Actifs / Suspendus
  // rejoint Import et Export, tout à droite — comme l'application d'origine.
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
  // au-dessus — comme l'application d'origine.
  champsSoulignes: true,

  // Numéro séquentiel attribué par l'application, comme partout ailleurs :
  // personne n'a à deviner le prochain libre.
  genererCode: (valeurs, entrees) =>
    String(entrees.reduce((max, e) => Math.max(max, Number(e.code) || 0), 0) + 1).padStart(3, '0'),

  taillePage: 12,

  colonnes: [
    { nom: 'code', libelle: 'Numéro', largeur: '90px', mono: true, calcule: true },
    {
      nom: 'libelle',
      libelle: 'Raison sociale',
      libelleForm: 'Raison sociale',
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
    {
      // État de la convention, présenté comme chez les adhérents : une colonne
      // à part entière plutôt qu'une pastille accolée au numéro. Rembourser un
      // prestataire dont la convention est dénoncée serait une erreur de
      // gestion — l'information mérite sa place dans le tableau.
      //
      // Dans le formulaire, seulement en modification : une convention qu'on
      // vient de signer est active, la bascule n'aurait rien à proposer.
      nom: 'actif',
      libelle: 'Etat',
      libelleForm: 'Etat',
      type: 'etat',
      defaut: true,
      largeur: '110px',
      visible: (valeurs) => Boolean(valeurs.code),
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
      maxLength: 12,
    },
    {
      nom: 'cleRib',
      libelle: 'Clé RIB',
      libelleForm: 'Clé RIB',
      mono: true,
      maxLength: 2,
    },
  ],

  /**
   * La maquette d'origine imbrique quatre onglets — carte, registre du
   * commerce, autorisation, banque — à l'intérieur d'un bloc « Références
   * professionnelles ». Des onglets dans un panneau déjà à onglets obligent à
   * deux niveaux de navigation pour saisir une fiche : ils deviennent ici les
   * sections d'un même onglet « Références professionnelles », qui se parcourt d'un
   * défilement.
   */
  formulaire: [
    {
      libelle: 'Fournisseur',
      sections: [
        {
          lignes: [['libelle'], ['specialite', 'actif'], ['adresse'], ['telephone', 'mobile']],
        },
      ],
    },
    {
      libelle: 'Contact',
      sections: [
        {
          lignes: [
            ['contactNom', 'contactPrenoms'],
            ['contactFonction'],
            ['contactTelephone', 'contactMobile'],
          ],
        },
      ],
    },
    {
      libelle: 'Références professionnelles',
      sections: [
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
      ],
    },
  ],
}

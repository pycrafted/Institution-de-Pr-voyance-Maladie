/**
 * Description du référentiel « Demandes d'agrément ».
 *
 * Un prestataire n'entre pas directement dans la liste des fournisseurs : il
 * dépose une demande, qui attend ici son instruction. Validée, elle fait
 * naître le fournisseur et quitte cette liste, qui ne montre que les demandes
 * en attente.
 *
 * Fournisseurs et demandes partagent une même série de numéros : une demande
 * reçoit dès sa création le numéro que portera son fournisseur (demande 071 →
 * fournisseur 071). Le serveur le propose, l'utilisateur peut le corriger.
 *
 * La fiche est celle d'un fournisseur, reprise de sa config : mêmes onglets
 * Contact et Références professionnelles. Une demande ne peut donc rien porter qu'un
 * fournisseur ne sache recevoir. S'y ajoutent la date de la demande et
 * l'adresse électronique ; le fixe et le portable, eux, ne se saisissent
 * qu'une fois, dans l'onglet Contact.
 */

import { cilCheckCircle } from '@coreui/icons'

import { executerAction, prochainNumero } from '../../services/referentiels'
import { FOURNISSEURS_DE_SOINS, SECTION_CONTACT, SECTIONS_REFERENCES } from './config'

/** « 2026-09-10 » → « 10/09/2026 ». */
const formaterDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/**
 * Date du jour au format des champs date. Heure locale et non `toISOString`,
 * qui compte en UTC : une demande saisie tard le soir ne doit pas être datée du
 * lendemain.
 */
const aujourdhui = () => {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Champs de la fiche fournisseur qu'une demande ne reprend pas ici :
 *   - le numéro, repris à part pour ouvrir la liste des colonnes ;
 *   - l'état : une demande n'est ni active ni suspendue - elle attend ;
 *   - le fixe et le portable du prestataire : la demande ne saisit les
 *     numéros qu'une fois, dans l'onglet Contact. Ce sont eux que le tableau
 *     montre sous « Fixe » et « Portable », et eux qui deviennent ceux du
 *     fournisseur à la validation (cf. DemandeAgrement.valider, côté serveur).
 */
const HORS_DEMANDE = ['code', 'actif', 'telephone', 'mobile']

/**
 * En-têtes de tableau des numéros du contact : ils tiennent ici la place du
 * fixe et du portable, et en prennent donc le nom. Le formulaire garde ses
 * propres libellés (« Téléphone fixe », « Téléphone mobile »).
 */
const EN_TETE_TABLEAU = { contactTelephone: 'Fixe', contactMobile: 'Portable' }

// Raison sociale et spécialité arrivent obligatoires de la fiche fournisseur,
// comme dans l'application d'origine ; la demande y ajoute sa date (plus bas).
// Le serveur fait la même vérification (FicheFournisseurSerializer).
const champsFiche = FOURNISSEURS_DE_SOINS.colonnes
  .filter((c) => !HORS_DEMANDE.includes(c.nom))
  .map((c) => (EN_TETE_TABLEAU[c.nom] ? { ...c, libelle: EN_TETE_TABLEAU[c.nom] } : c))
// Le numéro de la demande est celui du futur fournisseur : même colonne.
const colonneNumero = FOURNISSEURS_DE_SOINS.colonnes.find((c) => c.nom === 'code')

export const DEMANDES_AGREMENT = {
  cle: 'demandes-agrement',
  vide: 'Aucune demande d’agrément',
  libelle: 'Demandes d’agrément',
  nouveau: 'Nouvelle demande',
  modifier: 'Modifier la demande',

  // Saisie dans le panneau glissant, comme les autres pages (fournisseurs de
  // soins, participants…) : le bouton « Nouvelle demande » l'ouvre au-dessus de
  // la liste, le formulaire reprenant les onglets de la fiche fournisseur.

  // Le bouton « Nouvelle demande » de l'en-tête suffit : le tableau vide n'en
  // répète pas un second juste en dessous.
  sansCreationTableauVide: true,

  // Pas de titre au-dessus de la liste, comme pour « Tous les fournisseurs » :
  // l'onglet le dit déjà. Le bouton « Nouvelle demande » reste, à droite.
  sansTitre: true,
  // Total de la vue, sous les onglets, comme l'application d'origine.
  stats: (entrees) => `Total Demandes: ${entrees.length}`,

  // La recherche et le bouton « Nouvelle demande » tiennent sur une seule
  // ligne. Le total garde la sienne au-dessus, comme sur « Tous les
  // fournisseurs ».
  barreCompacte: true,

  // Recherche soulignée, sans cadre ni loupe, comme sur l'onglet voisin.
  champsSoulignes: true,

  // Pas de bandeau « Total Demandes » au-dessus de la liste (retiré à la demande).

  outils: ['export'],

  // Cases à cocher, comme sur « Tous les fournisseurs » : exporter vers Excel
  // les seules demandes cochées - ou toutes d'un coup, par l'en-tête.
  actionsLot: [{ libelle: 'Export Excel', type: 'export' }],

  colonnesTableau: [
    'code',
    'libelle',
    'adresse',
    'contactTelephone',
    'contactMobile',
    'dateDemande',
    'specialite',
  ],

  taillePage: 12,

  // Numéro proposé par le serveur à l'ouverture du formulaire, et non compté
  // ici (`genererCode`) : cet écran ne voit que les demandes en attente, pas
  // les fournisseurs ni les demandes validées qui partagent la série.
  proposerCode: () => prochainNumero('demandes-agrement'),

  colonnes: [
    colonneNumero,
    {
      nom: 'dateDemande',
      libelle: 'Agrément',
      libelleForm: 'Date demande agrément',
      type: 'date',
      requis: true,
      defaut: aujourdhui,
      largeur: '120px',
      valeurTableau: (e) => formaterDate(e.dateDemande),
    },
    {
      nom: 'email',
      libelle: 'Email',
      libelleForm: 'Email',
      type: 'email',
    },
    ...champsFiche,
  ],

  actionsLigne: [
    {
      cle: 'valider',
      libelle: 'Valider l’agrément',
      icone: cilCheckCircle,
      classe: 'ddb-action-succes',
      // Une validation fait naître un fournisseur : elle se confirme, comme une
      // suppression, car elle ne se défait pas depuis l'écran.
      // La raison sociale est facultative : à défaut, la demande se désigne
      // par son numéro.
      confirmer: (e) =>
        `Valider l’agrément ${e.libelle ? `de « ${e.libelle} »` : `de la demande n° ${e.code}`} ?\n\n` +
        'Le prestataire rejoindra la liste des fournisseurs et la demande quittera celle-ci.',
      executer: async (e) => {
        const fournisseur = await executerAction('demandes-agrement', e.id, 'valider')
        return `${e.libelle || `Demande n° ${e.code}`} agréé - fournisseur n° ${fournisseur.code}`
      },
    },
  ],

  // La demande tient sur un onglet défilant du panneau : identité, coordonnées,
  // le bloc Contact, puis les pièces justificatives (Références
  // professionnelles). Tout ce qu'une fiche de fournisseur sait porter, la
  // demande peut déjà le renseigner.
  formulaire: [
    {
      libelle: 'Demande',
      sections: [
        {
          // Le compte est proposé d'après la spécialité et recopié sur le
          // fournisseur à la validation : le prestataire agréé naît avec son
          // compte au grand-livre, comme dans l'application d'origine.
          lignes: [
            ['code', 'dateDemande', 'specialite'],
            ['libelle'],
            ['email', 'adresse'],
            ['compte'],
          ],
        },
        {
          // Recopiée sur le fournisseur à la validation (CHAMPS_FICHE) : une
          // structure agréée est aussitôt joignable depuis le mobile.
          titre: 'Localisation',
          lignes: [['latitude', 'longitude']],
        },
        SECTION_CONTACT,
        // Les pièces justificatives en sous-onglets (Carte médecin, R.C,
        // autorisation Santé, identification bancaire) - comme l'application
        // d'origine : on bascule d'une pièce à l'autre.
        { titre: 'Références professionnelles', sousOnglets: SECTIONS_REFERENCES },
      ],
    },
  ],
}

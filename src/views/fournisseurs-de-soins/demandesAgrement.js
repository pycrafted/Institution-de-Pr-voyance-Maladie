/**
 * Description du référentiel « Demandes d'agrément ».
 *
 * Un prestataire n'entre pas directement dans la liste des fournisseurs : il
 * dépose une demande, qui attend ici son instruction. Validée, elle fait
 * naître le fournisseur — numéroté à la suite des autres — et quitte cette
 * liste, qui ne montre que les demandes en attente.
 *
 * La fiche est celle d'un fournisseur, reprise de sa config : mêmes onglets
 * Contact et Références professionnelles. Une demande ne peut donc rien porter qu'un
 * fournisseur ne sache recevoir. S'y ajoutent la date de la demande et
 * l'adresse électronique ; le fixe et le portable, eux, ne se saisissent
 * qu'une fois, dans l'onglet Contact.
 */

import { cilCheckCircle } from '@coreui/icons'

import { executerAction } from '../../services/referentiels'
import { FOURNISSEURS_DE_SOINS } from './config'

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
 * Champs de la fiche fournisseur qu'une demande ne reprend pas :
 *   - le numéro et l'état : une demande a son propre numéro, attribué par le
 *     serveur, et n'est ni active ni suspendue — elle attend ;
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

const champsFiche = FOURNISSEURS_DE_SOINS.colonnes
  .filter((c) => !HORS_DEMANDE.includes(c.nom))
  .map((c) => (EN_TETE_TABLEAU[c.nom] ? { ...c, libelle: EN_TETE_TABLEAU[c.nom] } : c))
const [, ongletContact, ongletReferences] = FOURNISSEURS_DE_SOINS.formulaire

export const DEMANDES_AGREMENT = {
  cle: 'demandes-agrement',
  libelle: 'Demandes d’agrément',
  nouveau: 'Nouvelle demande',
  modifier: 'Modifier la demande',

  // Le bouton « Nouvelle demande » de l'en-tête suffit : le tableau vide n'en
  // répète pas un second juste en dessous.
  sansCreationTableauVide: true,

  // Pas de titre au-dessus de la liste, comme pour « Tous les fournisseurs » :
  // l'onglet le dit déjà. Le bouton « Nouvelle demande » reste, à droite.
  sansTitre: true,

  // La recherche et le bouton « Nouvelle demande » tiennent sur une seule
  // ligne. Le total garde la sienne au-dessus, comme sur « Tous les
  // fournisseurs ».
  barreCompacte: true,

  // Recherche soulignée, sans cadre ni loupe, comme sur l'onglet voisin.
  champsSoulignes: true,

  // Nombre de demandes en attente d'instruction, comme sur la liste voisine.
  stats: (entrees) => `Total Demandes : ${entrees.length}`,

  outils: ['export'],

  // Cases à cocher, comme sur « Tous les fournisseurs » : exporter vers Excel
  // les seules demandes cochées — ou toutes d'un coup, par l'en-tête.
  selection: true,
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

  // Pas de `genererCode` : le numéro de demande est attribué par le serveur,
  // qui voit toutes les demandes. Cet écran ne voit que celles en attente et
  // reprendrait, s'il comptait lui-même, le numéro d'une demande déjà validée.
  colonnes: [
    { nom: 'code', libelle: 'Numéro', largeur: '100px', mono: true, calcule: true },
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
      confirmer: (e) =>
        `Valider l’agrément de « ${e.libelle} » ?\n\n` +
        'Le prestataire rejoindra la liste des fournisseurs et la demande quittera celle-ci.',
      executer: async (e) => {
        const fournisseur = await executerAction('demandes-agrement', e.id, 'valider')
        return `${e.libelle} agréé — fournisseur n° ${fournisseur.code}`
      },
    },
  ],

  formulaire: [
    {
      libelle: 'Demande',
      sections: [
        {
          lignes: [['dateDemande', 'specialite'], ['libelle'], ['email', 'adresse']],
        },
      ],
    },
    ongletContact,
    ongletReferences,
  ],
}

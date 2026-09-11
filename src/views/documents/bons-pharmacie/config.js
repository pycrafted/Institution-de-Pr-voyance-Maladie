/**
 * Description du document « Bon de Pharmacie ».
 *
 * Même grammaire que les référentiels de « Données de base » — le fichier
 * config.js de cette section-là documente chaque option en détail. La page ne
 * réécrit donc aucun composant : elle décrit ses champs et laisse
 * <Referentiel /> faire le reste, ce qui garantit qu'elle se comporte et
 * s'affiche exactement comme le reste de l'application.
 *
 * Un bon de pharmacie autorise un bénéficiaire à retirer des médicaments chez
 * un pharmacien conventionné, à la charge de l'IPM. Il ne porte donc presque
 * aucune donnée propre : il désigne des tiers déclarés ailleurs — une société,
 * un participant, un de ses ayants droit, une pharmacie, un prescripteur. Les
 * listes se lisent dans les référentiels correspondants, jamais en dur ici :
 * un bon ne peut ainsi désigner que des tiers qui existent réellement.
 */

import {
  listerEntreesSync,
  SPECIALITES,
  CODES_TYPE_BENEFICIAIRE,
} from '../../../services/referentiels'

/** Code de la spécialité « PHARMACIES » dans le référentiel des spécialités. */
const SPECIALITE_PHARMACIE = '06'

const actifs = (cle) => listerEntreesSync(cle).filter((e) => e.actif !== false)

/** Exercice comptable : l'année en cours et les deux précédentes. */
const EXERCICES = (() => {
  const courant = new Date().getFullYear()
  return [courant, courant - 1, courant - 2].map((an) => ({
    valeur: String(an),
    libelle: String(an),
  }))
})()

/**
 * Intitulé d'un code type (« 2 » → « EPOUSE »). Le référentiel fait foi ; la
 * table de secours ne sert qu'au tout premier rendu, avant que l'appel au
 * backend ne soit revenu.
 */
const libelleTypeBenef = (code) => {
  const trouve = actifs('types-beneficiaires').find((t) => t.code === code)
  if (trouve) return trouve.libelle
  return Object.keys(CODES_TYPE_BENEFICIAIRE).find((k) => CODES_TYPE_BENEFICIAIRE[k] === code) || ''
}

/** Date ISO rendue à la française : c'est ainsi qu'elle se lit sur un bon. */
const dateFr = (iso) => {
  if (!iso) return ''
  const [annee, mois, jour] = String(iso).split('-')
  return jour ? `${jour}/${mois}/${annee}` : iso
}

export const BONS_PHARMACIE = {
  cle: 'bons-pharmacie',
  libelle: 'Bons de Pharmacie',
  nouveau: 'Nouveau bon',
  modifier: 'Modifier le bon',

  // La maquette d'origine ne montre que l'export.
  outils: ['export'],

  taillePage: 12,

  // Un bon n'a pas d'intitulé : c'est son numéro qui le nomme dans les
  // messages de confirmation.
  nommer: (b) => `Le bon ${b.code}`,

  // Vocabulaire de l'activation : un bon ne se « désactive » pas, il s'annule.
  etat: { actif: 'Valide', inactif: 'Annulé' },

  // Sélecteur segmenté : c'est la vue de travail qui s'ouvre en premier, celle
  // des bons qui attendent encore quelque chose.
  segments: {
    valeurs: [
      { valeur: 'non-traites', libelle: 'Non Traités', filtre: (b) => !b.traite },
      { valeur: 'traites', libelle: 'Traités', filtre: (b) => Boolean(b.traite) },
      { valeur: 'tous', libelle: 'Tous' },
    ],
  },

  filtres: [{ champ: 'exercice', libelle: 'Tous les exercices', options: EXERCICES }],

  // Numéro séquentiel attribué par l'application, comme partout ailleurs :
  // personne n'a à deviner le prochain libre.
  genererCode: (valeurs, entrees) => {
    const dernier = entrees
      .map((e) => Number(String(e.code).replace(/^BPI/, '')) || 0)
      .reduce((max, n) => Math.max(max, n), 0)
    return `BPI${String(dernier + 1).padStart(6, '0')}`
  },

  // Le tableau retient de quoi identifier le bon et savoir pour qui il a été
  // émis ; le reste — prescripteur, ordonnance — se lit dans la fiche.
  colonnesTableau: [
    'code',
    'date',
    'matriculePart',
    'participant',
    'typeBenef',
    'beneficiaire',
    'codeFournisseur',
    'pharmacie',
    'numeroFacture',
  ],

  colonnes: [
    {
      nom: 'code',
      libelle: 'Numero',
      largeur: '120px',
      mono: true,
      // Engendré à l'enregistrement : absent du formulaire de saisie.
      calcule: true,
    },
    {
      // Date d'émission : celle du jour, l'application la pose elle-même.
      nom: 'date',
      libelle: 'Date',
      libelleForm: 'Date du bon',
      largeur: '110px',
      lectureSeule: true,
      valeur: (valeurs) => valeurs.date || new Date().toISOString().slice(0, 10),
      valeurTableau: (b) => dateFr(b.date),
    },
    {
      // Déduit de la date : un bon appartient à l'exercice de son émission.
      nom: 'exercice',
      libelle: 'Exercice',
      libelleForm: 'Exercice',
      largeur: '100px',
      mono: true,
      lectureSeule: true,
      valeur: (valeurs) =>
        String(valeurs.date || new Date().toISOString()).slice(0, 4) ||
        String(new Date().getFullYear()),
    },

    // --- Participant -------------------------------------------------------
    {
      nom: 'codeSoc',
      libelle: 'Société',
      libelleForm: 'Société',
      largeur: '90px',
      mono: true,
      requis: true,
      options: () => actifs('adherents').map((a) => ({ valeur: a.code, libelle: a.libelle })),
    },
    {
      // Les cinq cents participants ne se proposent qu'une fois la société
      // dite : une liste de cette longueur ne se parcourt pas.
      nom: 'matriculePart',
      libelle: 'Mat. Part.',
      libelleForm: 'Matricule Participant',
      largeur: '110px',
      mono: true,
      requis: true,
      // La liste déroulante montre « matricule - prénoms nom », de quoi
      // reconnaître la personne au moment de choisir ; le tableau, lui, n'en
      // garde que le matricule — le nom a déjà sa propre colonne juste à côté.
      afficherCode: true,
      dependDe: 'codeSoc',
      options: (valeurs) =>
        valeurs.codeSoc
          ? actifs('participants')
              .filter((p) => p.adherent === valeurs.codeSoc)
              // Le matricule n'est pas répété dans l'intitulé : la liste
              // préfixe déjà chaque option de sa valeur.
              .map((p) => ({ valeur: p.matricule, libelle: `${p.prenoms} ${p.nom}` }))
          : [],
    },
    {
      // Recopié du participant retenu : le tableau le montre en clair sans
      // qu'on ait à le saisir deux fois.
      nom: 'participant',
      libelle: 'Participant',
      libelleForm: 'Participant',
      lectureSeule: true,
      valeur: (valeurs) => {
        const p = actifs('participants').find((e) => e.matricule === valeurs.matriculePart)
        return p ? `${p.prenoms} ${p.nom}` : ''
      },
    },

    // --- Bénéficiaire ------------------------------------------------------
    {
      nom: 'typeBenef',
      libelle: 'Type bénéf.',
      libelleForm: 'Type',
      largeur: '110px',
      requis: true,
      afficherCode: true,
      options: () =>
        actifs('types-beneficiaires').map((t) => ({ valeur: t.code, libelle: t.libelle })),
    },
    {
      // Les deux conditions comptent : un même participant a souvent une
      // épouse et trois enfants.
      nom: 'matriculeBenef',
      libelle: 'Mat. bénéf.',
      libelleForm: 'Bénéficiaire',
      largeur: '130px',
      mono: true,
      requis: true,
      dependDe: 'matriculePart',
      options: (valeurs) => {
        const { matriculePart, typeBenef } = valeurs
        if (!matriculePart || !typeBenef) return []
        const type = libelleTypeBenef(typeBenef)
        // Le participant est bénéficiaire de ses propres soins : il ne figure
        // pas dans la table des ayants droit, qui ne porte que sa famille.
        if (type === 'PARTICIPANT') {
          const p = actifs('participants').find((e) => e.matricule === matriculePart)
          return p ? [{ valeur: p.matricule, libelle: `${p.prenoms} ${p.nom}` }] : []
        }
        return actifs('beneficiaires')
          .filter((b) => b.matriculePart === matriculePart && b.typeBenef === type)
          .map((b) => ({ valeur: b.matriculeBenef, libelle: `${b.prenoms} ${b.nom}` }))
      },
    },
    {
      nom: 'beneficiaire',
      libelle: 'Bénéficiaire',
      libelleForm: 'Nom du bénéficiaire',
      lectureSeule: true,
      valeur: (valeurs) => {
        const b = actifs('beneficiaires').find((e) => e.matriculeBenef === valeurs.matriculeBenef)
        if (b) return `${b.prenoms} ${b.nom}`
        const p = actifs('participants').find((e) => e.matricule === valeurs.matriculeBenef)
        return p ? `${p.prenoms} ${p.nom}` : ''
      },
    },

    // --- Pharmacie ---------------------------------------------------------
    {
      nom: 'codeFournisseur',
      libelle: 'Code F.',
      libelleForm: 'Pharmacie',
      largeur: '90px',
      mono: true,
      afficherCode: true,
      options: () =>
        actifs('fournisseurs-de-soins')
          .filter((f) => f.specialite === SPECIALITE_PHARMACIE)
          .map((f) => ({ valeur: f.code, libelle: f.libelle })),
    },
    {
      nom: 'pharmacie',
      libelle: 'Pharmacie',
      libelleForm: 'Raison sociale',
      lectureSeule: true,
      valeur: (valeurs) =>
        actifs('fournisseurs-de-soins').find((f) => f.code === valeurs.codeFournisseur)?.libelle ||
        '',
    },
    {
      nom: 'numeroFacture',
      libelle: 'N° Facture',
      libelleForm: 'N° Facture',
      placeholder: 'FAC020257',
      largeur: '120px',
      mono: true,
      maxLength: 12,
    },

    // --- Prescripteur ------------------------------------------------------
    {
      nom: 'specialite',
      libelle: 'Spécialité',
      libelleForm: 'Spécialité',
      largeur: '180px',
      options: SPECIALITES,
    },
    {
      nom: 'prescripteur',
      libelle: 'Prescripteur',
      libelleForm: 'Prescripteur',
      dependDe: 'specialite',
      options: (valeurs) =>
        valeurs.specialite
          ? actifs('fournisseurs-de-soins')
              .filter((f) => f.specialite === valeurs.specialite)
              .map((f) => ({ valeur: f.code, libelle: f.libelle }))
          : [],
      afficherCode: true,
    },

    // --- Ordonnance --------------------------------------------------------
    {
      nom: 'nbArticles',
      libelle: 'Nb. Articles',
      libelleForm: 'Nb. Articles',
      largeur: '110px',
      type: 'number',
      aligne: 'droite',
      defaut: 0,
      placeholder: '0',
    },
    {
      nom: 'dateOrdonnance',
      libelle: 'Date Ordonnance',
      libelleForm: 'Date Ordonnance',
      largeur: '140px',
      type: 'date',
    },
    {
      nom: 'remboursementIntegral',
      libelle: 'Remb. intégral',
      libelleForm: 'Remboursement intégral',
      largeur: '130px',
      type: 'booleen',
    },
  ],

  // Un seul onglet, cinq sections : le bon tient sur une colonne, et le
  // découper en onglets obligerait à naviguer pour saisir dix champs.
  // Découpage repris de la maquette : quatre encadrés — qui, pour qui, où, et
  // sur prescription de qui — puis l'ordonnance.
  //
  // Ne figurent pas ici, quoique déclarés en colonnes : le numéro, la date et
  // l'exercice, que l'application pose elle-même ; et les trois libellés
  // recopiés (participant, nom du bénéficiaire, raison sociale), qui ne font
  // que répéter en clair la ligne qui les précède. Tous restent calculés à
  // l'enregistrement — la soumission parcourt les colonnes, pas le formulaire —
  // et continuent donc d'alimenter le tableau.
  formulaire: [
    {
      libelle: 'Bon de pharmacie',
      sections: [
        {
          titre: 'Participant',
          lignes: [['codeSoc'], ['matriculePart']],
        },
        {
          titre: 'Bénéficiaire',
          lignes: [['typeBenef', 'matriculeBenef']],
        },
        {
          titre: 'Pharmacie',
          lignes: [['codeFournisseur'], ['numeroFacture']],
        },
        {
          titre: 'Prescripteur',
          lignes: [['specialite'], ['prescripteur']],
        },
        {
          titre: 'Ordonnance',
          lignes: [['nbArticles', 'dateOrdonnance'], ['remboursementIntegral']],
        },
      ],
    },
  ],
}

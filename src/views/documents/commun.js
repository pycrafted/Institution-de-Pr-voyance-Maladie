/**
 * Ce que les pages de documents - bons de pharmacie, lettres de garantie -
 * ont en commun.
 *
 * Chaque document désigne une société, un de ses participants et un
 * bénéficiaire (un ayant droit, ou le participant lui-même), ainsi que des
 * fournisseurs de soins choisis dans une spécialité. Les listes se lisent dans
 * les référentiels servis par le backend, jamais en dur ici. La barre de liste
 * est celle de l'application d'origine (page Bons de pharmacie).
 */

import { telecharger } from '../../services/api'
import { ouvrirApercu } from '../../services/apercu'
import { listerEntreesSync } from '../../services/referentiels'

export const actifs = (cle) => listerEntreesSync(cle).filter((e) => e.actif !== false)

/**
 * Options d'un référentiel pour une liste déroulante : les entrées ACTIVES,
 * plus celles que la fiche porte déjà.
 *
 * Désactiver une entrée doit la retirer des choix - c'est tout le sens de la
 * désactivation, qui remplace la suppression (cf. REGISTRE §5). Mais une
 * fiche ancienne qui la porte encore doit continuer à l'afficher en toutes
 * lettres : sans son option, `libelleValeur` retomberait sur le code brut
 * (« 08 » au lieu de « CLINIQUES »). D'où ce compromis : on masque à la
 * saisie, on garde à l'affichage.
 *
 * `dejaPortees` : les codes tenus par la fiche en cours (un écran peut en
 * porter deux, prescripteur et prestataire).
 */
export const optionsReferentiel = (cle, ...dejaPortees) =>
  listerEntreesSync(cle)
    .filter((e) => e.actif !== false || dejaPortees.includes(e.code))
    .map((e) => ({ valeur: e.code, libelle: e.libelle }))

/** Exercice comptable : l'année en cours et les deux précédentes. */
export const EXERCICES = (() => {
  const courant = new Date().getFullYear()
  return [courant, courant - 1, courant - 2].map((an) => ({
    valeur: String(an),
    libelle: String(an),
  }))
})()

/** Intitulé d'un code type (« 2 » → « EPOUSE »), lu dans le référentiel. */
export const libelleTypeBenef = (code) =>
  actifs('types-beneficiaires').find((t) => t.code === code)?.libelle || ''

/**
 * Les bénéficiaires possibles pour (participant + type) choisis, en
 * { valeur, libelle }. « Participant » = lui-même ; les autres types = ses
 * ayants droit de ce type.
 */
export const beneficiairesPossibles = (valeurs) => {
  const { matriculePart, typeBenef } = valeurs
  if (!matriculePart || !typeBenef) return []
  const type = libelleTypeBenef(typeBenef)
  if (type === 'PARTICIPANT') {
    const p = actifs('participants').find((e) => e.matricule === matriculePart)
    return p ? [{ valeur: p.matricule, libelle: `${p.prenoms} ${p.nom}` }] : []
  }
  return actifs('beneficiaires')
    .filter((b) => b.matriculePart === matriculePart && b.typeBenef === type)
    .map((b) => ({ valeur: b.matriculeBenef, libelle: `${b.prenoms} ${b.nom}` }))
}

/** Mot courant d'un type de bénéficiaire, pour les messages. */
const MOT_TYPE = { EPOUSE: 'épouse', EPOUX: 'époux', ENFANT: 'enfant', ASCENDANT: 'ascendant' }
const pluriel = (mot) => (mot === 'époux' ? 'époux' : `${mot}s`)

/** Date ISO rendue à la française : c'est ainsi qu'elle se lit sur un document. */
export const dateFr = (iso) => {
  if (!iso) return ''
  const [annee, mois, jour] = String(iso).split('-')
  return jour ? `${jour}/${mois}/${annee}` : iso
}

/**
 * Spécialités proposées sur un document : les conventionnées du moment, plus
 * celle que le document porte déjà s'il est ancien. Deux champs peuvent en
 * porter une (prescripteur et prestataire d'une lettre de garantie), d'où les
 * deux valeurs lues dans la saisie en cours.
 */
export const optionsSpecialites = (valeurs = {}) =>
  optionsReferentiel('specialites', valeurs.specialite, valeurs.specialitePrestataire)

/** Fournisseurs de soins actifs d'une spécialité (vide tant qu'elle n'est pas choisie). */
export const fournisseursDeSpecialite = (code) =>
  code
    ? actifs('fournisseurs-de-soins')
        .filter((f) => f.specialite === code)
        .map((f) => ({ valeur: f.code, libelle: f.libelle }))
    : []

/**
 * Natures de prestation RANGEES pour une spécialité de prestataire : celles
 * que cette spécialité donne vraiment d'abord (dans l'ordre du relevé), les
 * autres ensuite, sous « Autres natures ».
 *
 * Le classement ne sort pas d'une idée de ce qui va ensemble : il vient des
 * lettres de garantie réelles de LAMPS, relevé spécialité par spécialité et
 * porté par le référentiel (`naturesCourantes`, cf.
 * backend/apps/donnees_de_base/natures_courantes.py). Un cardiologue n'a plus
 * à chercher sa consultation parmi 63 lignes où figure l'échographie.
 *
 * Rien n'est retiré : une spécialité sans relevé garde la liste entière, et
 * les natures rares restent à portée, en dessous.
 */
export const naturesDeSpecialite = (codeSpecialite, dejaPortee) => {
  const toutes = optionsReferentiel('types-prestations', dejaPortee)
  const specialite = actifs('specialites').find((s) => s.code === codeSpecialite)
  const courantes = specialite?.naturesCourantes || []
  if (!courantes.length) return toutes

  const rang = new Map(courantes.map((code, i) => [code, i]))
  const devant = toutes
    .filter((o) => rang.has(o.valeur))
    .sort((a, b) => rang.get(a.valeur) - rang.get(b.valeur))
  const derriere = toutes.filter((o) => !rang.has(o.valeur))
  if (!derriere.length) return devant
  return [
    ...devant.map((o) => ({ ...o, groupe: specialite.libelle })),
    ...derriere.map((o) => ({ ...o, groupe: 'Autres natures' })),
  ]
}

/** Raison sociale d'un fournisseur de soins, d'après son code. */
export const nomFournisseur = (code) =>
  actifs('fournisseurs-de-soins').find((f) => f.code === code)?.libelle || ''

/**
 * Montre un document imprimé (PDF, au modèle de l'origine) par-dessus la page,
 * dans le lecteur PDF du navigateur, comme l'intranet SAR - sans ouvrir
 * d'onglet (cf. components/ApercuPdf.jsx). `titre` nomme l'aperçu.
 */
export const ouvrirPdf = (chemin, nomFichier, titre) =>
  ouvrirApercu({ titre: titre || nomFichier, nomFichier, charger: () => telecharger(chemin) })

/**
 * Barre de liste de l'application d'origine (page Bons de pharmacie) :
 * Exercice (l'année en cours d'avance), puis Traités / Non Traités en liste
 * déroulante, puis « Rechercher… » à libellé flottant - trois champs
 * soulignés - et le bouton de création avant l'Export Excel, sur la même
 * ligne.
 */
export const BARRE_DOCUMENTS = {
  segments: {
    valeurs: [
      { valeur: 'non-traites', libelle: 'Non Traités', filtre: (d) => !d.traite },
      { valeur: 'traites', libelle: 'Traités', filtre: (d) => Boolean(d.traite) },
      { valeur: 'tous', libelle: 'Tous' },
    ],
  },
  filtres: [
    {
      champ: 'exercice',
      etiquette: 'Exercice',
      libelle: 'Tous',
      options: EXERCICES,
      defaut: () => String(new Date().getFullYear()),
      largeur: '7rem',
    },
  ],
  champsSoulignes: true,
  barreCompacte: true,
  creationAvantOutils: true,
  segmentsEnListe: true,
  rechercheEnDernier: true,
  rechercheFlottante: true,
  // Le bouton de création est déjà dans la barre d'outils (barre compacte) :
  // le tableau vide n'en répète pas un second en dessous.
  sansCreationTableauVide: true,
  // On ouvre un bon en cliquant sa ligne (le panneau s'ouvre) : pas de crayon,
  // et la ligne en cours d'édition se colore en rouge. Comme données de base.
  modificationParLigne: true,
}

/** Numéro, date et exercice : posés par le serveur, absents du formulaire. */
export const colonnesEmission = () => [
  {
    // Attribué par le serveur (« BPI043933 », « LGI032246 ») : absent du formulaire.
    nom: 'code',
    libelle: 'Numero',
    largeur: '120px',
    mono: true,
    calcule: true,
  },
  {
    // Date d'émission : celle du jour, l'application la pose elle-même.
    nom: 'date',
    libelle: 'Date',
    libelleForm: 'Date',
    largeur: '110px',
    lectureSeule: true,
    valeur: (valeurs) => valeurs.date || new Date().toISOString().slice(0, 10),
    valeurTableau: (d) => dateFr(d.date),
  },
  {
    // Déduit de la date : un document appartient à l'exercice de son émission.
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
]

/**
 * Participant et bénéficiaire, comme l'écran d'origine : Société, puis
 * Matricule Participant ; Type, puis Bénéficiaire. Les noms recopiés
 * (participant, bénéficiaire) alimentent le tableau sans se saisir.
 */
export const colonnesBeneficiaire = () => [
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
    // Les participants ne se proposent qu'une fois la société dite : une
    // liste de cette longueur ne se parcourt pas.
    nom: 'matriculePart',
    libelle: 'Mat. Part.',
    libelleForm: 'Matricule Participant',
    largeur: '110px',
    mono: true,
    requis: true,
    // La liste montre « matricule - prénoms nom » ; le tableau, le matricule
    // précédé du code de la société, comme l'origine : « 02-0949 ».
    afficherCode: true,
    valeurTableau: (d) =>
      d.codeSoc && d.matriculePart ? `${d.codeSoc}-${d.matriculePart}` : d.matriculePart || '',
    dependDe: 'codeSoc',
    options: (valeurs) =>
      valeurs.codeSoc
        ? actifs('participants')
            .filter((p) => p.adherent === valeurs.codeSoc)
            .map((p) => ({ valeur: p.matricule, libelle: `${p.prenoms} ${p.nom}` }))
        : [],
  },
  {
    nom: 'participant',
    libelle: 'Participant',
    libelleForm: 'Participant',
    lectureSeule: true,
    valeur: (valeurs) => {
      const p = actifs('participants').find((e) => e.matricule === valeurs.matriculePart)
      return p ? `${p.prenoms} ${p.nom}` : ''
    },
  },
  {
    nom: 'typeBenef',
    libelle: 'Type bénéf.',
    libelleForm: 'Type',
    largeur: '110px',
    requis: true,
    afficherCode: true,
    // Le type du conjoint suit le sexe du participant : un homme a une épouse
    // (pas d'époux), une femme un époux (pas d'épouse). On retire donc l'autre.
    // `dependDe` : changer de participant réinitialise le type s'il devient invalide.
    dependDe: 'matriculePart',
    options: (valeurs) => {
      const p = actifs('participants').find((e) => e.matricule === valeurs.matriculePart)
      const sexe = p?.sexe
      return actifs('types-beneficiaires')
        .filter((t) => {
          const lib = (t.libelle || '').toUpperCase()
          if (sexe === 'M' && lib === 'EPOUX') return false
          if (sexe === 'F' && lib === 'EPOUSE') return false
          return true
        })
        .map((t) => ({ valeur: t.code, libelle: t.libelle }))
    },
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
    options: beneficiairesPossibles,
    // Un seul bénéficiaire possible (le participant lui-même, ou son unique
    // épouse/époux/enfant/ascendant) : on le pré-remplit, pas de clic inutile.
    // Zéro ou plusieurs : on laisse vide, et le message ci-dessous guide.
    valeurProposee: (valeurs) => {
      const liste = beneficiairesPossibles(valeurs)
      return liste.length === 1 ? liste[0].valeur : ''
    },
    // Aide selon le nombre d'ayants droit de ce type (hors « Participant ») :
    // 0 → il n'en a pas ; plusieurs → inviter à choisir ; 1 → rien (auto-rempli).
    message: (valeurs) => {
      const { matriculePart, typeBenef } = valeurs
      if (!matriculePart || !typeBenef) return null
      const type = libelleTypeBenef(typeBenef)
      if (type === 'PARTICIPANT') return null
      const mot = MOT_TYPE[type] || type.toLowerCase()
      const liste = beneficiairesPossibles(valeurs)
      if (liste.length === 0) return `Ce participant n'a pas d'${mot}.`
      if (liste.length > 1) return `${liste.length} ${pluriel(mot)} : choisissez dans la liste.`
      return null
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
]

/** Prescripteur : spécialité, puis prescripteur de cette spécialité. */
export const colonnesPrescripteur = () => [
  {
    nom: 'specialite',
    libelle: 'Spécialité',
    libelleForm: 'Spécialité',
    largeur: '180px',
    options: optionsSpecialites,
  },
  {
    nom: 'prescripteur',
    libelle: 'Prescripteur',
    libelleForm: 'Prescripteur',
    dependDe: 'specialite',
    options: (valeurs) => fournisseursDeSpecialite(valeurs.specialite),
    afficherCode: true,
  },
]

/** N° de facture : arrive au traitement ; la liste l'affiche, le formulaire ne le demande pas. */
export const colonneNumeroFacture = () => ({
  nom: 'numeroFacture',
  libelle: 'N° Facture',
  libelleForm: 'N° Facture',
  largeur: '120px',
  mono: true,
  maxLength: 12,
})

/** Remboursement intégral : la case du pied de l'écran d'origine. */
export const colonneRemboursementIntegral = () => ({
  nom: 'remboursementIntegral',
  libelle: 'Remb. intégral',
  libelleForm: 'Remboursement intégral',
  largeur: '130px',
  type: 'booleen',
})

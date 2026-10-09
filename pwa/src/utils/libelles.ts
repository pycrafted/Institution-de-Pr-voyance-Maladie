/**
 * Libellés venus d'IPM, rendus lisibles de la même façon sur tous les écrans.
 *
 * IPM saisit noms, raisons sociales et liens de parenté en majuscules
 * (« PHARMACIE DE LA GARE », « EPOUSE ») : lisible sur le bon imprimé, criard
 * dans une liste de téléphone. Un seul module pour que l'accueil, le profil,
 * « Mes bons », le détail et l'assistant disent la même chose de la même
 * personne (« Épouse » partout, et non « Epouse » ici et « Épouse » là).
 */

import type { Beneficiaire } from '../types/api'
import { capitaliser } from './format'

// ---------------------------------------------------------------------------
// Noms propres (fournisseurs, sociétés, personnes)
// ---------------------------------------------------------------------------

// Petits mots qui restent en minuscules au milieu d'un nom propre.
const PARTICULES = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'et',
  'en',
  'au',
  'aux',
  'sur',
  'à',
])
// Sigles qui gardent leurs majuscules.
const SIGLES = new Set([
  'SAR',
  'IPM',
  'CHU',
  'CHN',
  'HPD',
  'HOGGY',
  'SOS',
  'ORL',
  'VIH',
  'SA',
  'SARL',
  'SUARL',
  'GIE',
])

/**
 * « PHARMACIE DE LA GARE » → « Pharmacie de la Gare » ;
 * « PHARMACIE DE L'AVENUE » → « Pharmacie de l'Avenue » ;
 * « IPM SAR PERSONNEL MOO » → « IPM SAR Personnel Moo ». Un libellé déjà en
 * casse mixte (saisi avec soin) est laissé tel quel. Les sigles (« SAR »,
 * « IPM », ou tout mot court sans voyelle) aussi.
 */
export function nomPropre(texte: string | null | undefined): string {
  const brut = (texte ?? '').trim().replace(/\s+/g, ' ')
  if (!brut) return ''
  if (brut !== brut.toLocaleUpperCase('fr-FR')) return brut
  return brut
    .split(' ')
    .map((mot, i) => {
      const minuscule = mot.toLocaleLowerCase('fr-FR')
      if (i > 0 && PARTICULES.has(minuscule)) return minuscule
      // Sigle : connu (SAR, IPM, CHU…) ou sans aucune voyelle (« SCP », « HLM »).
      if (SIGLES.has(mot) || (/^[A-Z]{2,5}$/.test(mot) && !/[AEIOUY]/.test(mot))) return mot
      const capitalise = capitaliser(mot)
      // « L'Avenue », « D'Or » → « l'Avenue », « d'Or » hors début.
      if (i > 0 && /^[LD]['’]/.test(capitalise))
        return capitalise.charAt(0).toLocaleLowerCase('fr-FR') + capitalise.slice(1)
      return capitalise
    })
    .join(' ')
}

// ---------------------------------------------------------------------------
// Liens de parenté
// ---------------------------------------------------------------------------

// Clé : libellé du référentiel sans accents, en majuscules. `genre` : celui
// du libellé lui-même, qui décide quand le sexe de la personne est inconnu
// (le bénéficiaire résumé d'un bon ne le porte pas) : « EPOUSE » reste
// « Épouse ».
const LIENS: Record<string, { m: string; f: string; genre?: 'f' }> = {
  PARTICIPANT: { m: 'Titulaire', f: 'Titulaire' },
  CONJOINT: { m: 'Conjoint', f: 'Conjointe' },
  CONJOINTE: { m: 'Conjoint', f: 'Conjointe', genre: 'f' },
  EPOUX: { m: 'Époux', f: 'Épouse' },
  EPOUSE: { m: 'Époux', f: 'Épouse', genre: 'f' },
  ENFANT: { m: 'Enfant', f: 'Enfant' },
  FILS: { m: 'Fils', f: 'Fille' },
  FILLE: { m: 'Fils', f: 'Fille', genre: 'f' },
  PERE: { m: 'Père', f: 'Mère' },
  MERE: { m: 'Père', f: 'Mère', genre: 'f' },
  ASCENDANT: { m: 'Ascendant', f: 'Ascendante' },
  ASCENDANTE: { m: 'Ascendant', f: 'Ascendante', genre: 'f' },
}

function cle(libelle: string): string {
  return libelle
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase()
}

/** Ce qu'il faut pour nommer un lien : le type, et si possible le sexe. */
export type PersonneLiee = Pick<Beneficiaire, 'type'> &
  Partial<Pick<Beneficiaire, 'sexe' | 'estParticipant'>>

/**
 * « Conjointe », « Épouse », « Enfant », « Titulaire » (le participant
 * lui-même), accordé au sexe de la personne quand il est connu.
 */
export function libelleLien(personne: PersonneLiee): string {
  if (personne.estParticipant) return 'Titulaire'
  const brut = personne.type?.libelle ?? ''
  if (!brut.trim()) return 'Ayant droit'
  const connu = LIENS[cle(brut)]
  if (!connu) return capitaliser(brut.trim())
  if (personne.sexe === 'F') return connu.f
  if (personne.sexe === 'M') return connu.m
  return connu.genre === 'f' ? connu.f : connu.m
}

/**
 * Recherche et filtres de l'annuaire des conventionnés (pages/Conventionnes.tsx).
 *
 * Logique pure, sans React, pour être testée à part : l'écran ne fait que
 * brancher le champ de recherche et les puces de filtre sur ces fonctions.
 */

import type { Conventionne, Fournisseur } from '../../types/api'
import { nomPropre } from '../../utils/libelles'

/** Clé de la puce « Tous » : aucune spécialité ne peut porter ce code. */
export const TOUS = '*'

/**
 * Texte comparable : minuscules, sans accents, apostrophes et espaces
 * ramenés à un espace simple. IPM saisit les noms en majuscules accentuées
 * (« CLINIQUE DE L'AÉROPORT ») et l'employé tape « aeroport » d'un pouce.
 */
export function normaliser(texte: string | null | undefined): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ce sur quoi la recherche porte : le nom, l'adresse et la spécialité. */
function texteRecherchable(structure: Conventionne): string {
  return normaliser(
    [structure.libelle, structure.adresse, structure.specialite?.libelle].filter(Boolean).join(' '),
  )
}

/**
 * Structures de la spécialité choisie (`TOUS` : toutes) dont le nom, l'adresse
 * ou la spécialité contient TOUS les mots cherchés (« clinique plateau » ne
 * garde que les cliniques du Plateau). Recherche vide : toute la spécialité.
 */
export function filtrerConventionnes(
  structures: readonly Conventionne[],
  recherche: string,
  specialite: string = TOUS,
): Conventionne[] {
  const mots = normaliser(recherche).split(' ').filter(Boolean)
  return structures.filter((structure) => {
    if (specialite !== TOUS && structure.specialite?.code !== specialite) return false
    if (mots.length === 0) return true
    const texte = texteRecherchable(structure)
    return mots.every((mot) => texte.includes(mot))
  })
}

/**
 * Libellé d'une spécialité, écrit comme une catégorie et non comme un nom
 * propre : « LABORATOIRES D’ANALYSES » → « Laboratoires d’analyses »,
 * « SAGES-FEMMES » → « Sages-femmes ». (nomPropre, fait pour les noms de
 * lieux, écrirait « d’Analyses ».)
 */
export function libelleSpecialite(libelle: string | null | undefined): string {
  const texte = (libelle ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')
  return texte.charAt(0).toLocaleUpperCase('fr-FR') + texte.slice(1)
}

export interface FiltreSpecialite {
  code: string
  libelle: string
  nombre: number
}

/**
 * Les puces de filtre : une par spécialité PRÉSENTE dans l'annuaire, jamais
 * une puce qui mènerait à une liste vide. Les plus fournies d'abord — les
 * pharmacies, où l'employé va le plus souvent, arrivent en tête — puis par
 * ordre alphabétique à nombre égal.
 */
export function filtresSpecialites(structures: readonly Conventionne[]): FiltreSpecialite[] {
  const parCode = new Map<string, FiltreSpecialite>()
  for (const { specialite } of structures) {
    if (!specialite) continue
    const filtre = parCode.get(specialite.code)
    if (filtre) filtre.nombre += 1
    else
      parCode.set(specialite.code, {
        code: specialite.code,
        libelle: libelleSpecialite(specialite.libelle) || specialite.code,
        nombre: 1,
      })
  }
  return [...parCode.values()].sort(
    (a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle, 'fr'),
  )
}

/**
 * Lien d'appel direct (`tel:`), ou null quand le référentiel n'a pas de
 * numéro exploitable (champ vide, « néant », « - »).
 *
 * Le numéro est repris TEL QUEL, sans lui ajouter d'indicatif : l'annuaire
 * d'IPM contient des numéros locaux comme internationaux, et en inventer un
 * ferait composer un mauvais appel.
 */
export function lienTelephone(valeur: string | null | undefined): string | null {
  const brut = (valeur ?? '').trim()
  if (!brut) return null
  const international = brut.startsWith('+')
  const chiffres = brut.replace(/\D/g, '')
  // Moins de six chiffres : ce n'est pas un numéro composable.
  if (chiffres.length < 6) return null
  return `tel:${international ? '+' : ''}${chiffres}`
}

/**
 * Lien « S'y rendre » : ouvre la carte du téléphone sur l'itinéraire vers la
 * structure, DEPUIS L'ENDROIT OÙ SE TROUVE L'EMPLOYÉ. Aucune position n'est
 * lue par l'application : c'est la carte qui localise le téléphone, avec la
 * permission que l'employé lui a déjà donnée — l'application n'a donc rien à
 * demander, ni rien à savoir de ses déplacements.
 *
 * Plans d'Apple sur iPhone, Google Maps ailleurs : chacun ouvre l'application
 * installée d'office sur le téléphone (et, à défaut, sa version web).
 * La position de la fiche si l'IPM l'a renseignée ; sinon le nom et l'adresse
 * écrite, que la carte cherche elle-même. Rien du tout : null, pas de bouton.
 */
export function lienItineraire(structure: Conventionne, surIOS: boolean): string | null {
  let destination: string
  if (structure.position) {
    destination = `${structure.position.latitude},${structure.position.longitude}`
  } else {
    const nom = nomStructure(structure)
    if (!structure.libelle) return null
    // Le pays aide la carte à ne pas chercher une homonyme à l'étranger.
    destination = [nom, structure.adresse, 'Sénégal'].filter(Boolean).join(', ')
  }
  const cible = encodeURIComponent(destination)
  return surIOS
    ? `https://maps.apple.com/?daddr=${cible}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${cible}`
}

/** Nom rendu lisible : « CLINIQUE DU CAP » → « Clinique du Cap ». */
export function nomStructure(structure: Fournisseur): string {
  return nomPropre(structure.libelle) || structure.code
}

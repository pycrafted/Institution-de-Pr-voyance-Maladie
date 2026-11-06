/**
 * Le classeur des appels de cotisations - celui que l'IPM reçoit de la paie.
 *
 * Le format n'est pas de notre invention : il vient du modèle que le métier
 * nous a remis (`code_cot 5000 1 2025.xlsx`, un seul enregistrement, les noms
 * des agents ayant été retirés). Six colonnes, dans cet ordre :
 *
 *   Code Cotisations | Matricule | Nom | Prénom | Indicateur - Code | Indicateur- Valeur
 *   01-2025-1-C500   | 0693      | …   | …      | 5000              | 1800
 *
 * Deux choses à en retenir, parce qu'elles se lisent mal :
 *
 *   - **« Indicateur - Code » n'est pas un montant, c'est la rubrique de
 *     paie.** C'est elle qui nomme le fichier : *code_cot **5000** / mois 1 /
 *     année 2025*. Le montant dû est la colonne suivante, « Indicateur-
 *     Valeur » - orthographe d'origine, espace manquante comprise, qu'on ne
 *     corrige pas.
 *   - **« Code Cotisations » est le code de l'appel**, au format
 *     société-année-mois-journal, exactement celui que nous composons. Il nous
 *     sert de garde-fou : un fichier de janvier ne doit pas se déverser dans
 *     l'appel de novembre.
 *
 * La bibliothèque (SheetJS) n'est chargée qu'au premier clic, comme pour les
 * référentiels : elle pèse plusieurs centaines de kilo-octets.
 */

const chargerXlsx = () => import('xlsx')

/**
 * Rubrique de paie des cotisations, telle qu'elle figure sur le modèle.
 *
 * Elle est ici en constante parce que le modèle n'en montre qu'une, pour un
 * appel `C500`. Si la paie utilise une rubrique différente selon le type de
 * cotisation, c'est un champ à porter sur le type - le jour où le métier nous
 * donnera la correspondance.
 */
export const INDICATEUR_COTISATION = '5000'

const COLONNES_FICHIER = [
  'Code Cotisations',
  'Matricule',
  'Nom',
  'Prénom',
  'Indicateur - Code',
  'Indicateur- Valeur',
]

/** Titres comparés sans casse, sans accents ni espaces superflus. */
const normaliser = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * Matricule comparé sans ses zéros de tête : Excel change « 0693 » en 693 dès
 * que la colonne a été retapée en nombre. C'est la fiche qui porte la bonne
 * forme, le fichier ne sert qu'à la retrouver.
 */
const cleMatricule = (valeur) =>
  String(valeur ?? '')
    .trim()
    .replace(/^0+/, '')

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Écrit l'appel au format que la paie attend, pour qu'il revienne rempli.
 * L'onglet porte le numéro du mois et le fichier le nom d'origine
 * (`code_cot 5000 11 2026.xlsx`). Renvoie le nombre de lignes écrites.
 */
export async function exporterAppel(appel, lignes, { annee, mois }) {
  const XLSX = await chargerXlsx()
  const donnees = lignes.map((l) => ({
    'Code Cotisations': appel.code,
    // En texte, toujours : « 0693 » ne doit pas revenir en 693.
    Matricule: String(l.matricule ?? ''),
    Nom: l.nom ?? '',
    Prénom: l.prenoms ?? '',
    'Indicateur - Code': INDICATEUR_COTISATION,
    'Indicateur- Valeur': Number(l.montant) || 0,
  }))

  const feuille = XLSX.utils.json_to_sheet(donnees, { header: COLONNES_FICHIER })
  feuille['!cols'] = COLONNES_FICHIER.map((titre) => {
    const largeurs = donnees.map((d) => String(d[titre]).length)
    return { wch: Math.min(40, Math.max(titre.length, ...largeurs, 0) + 2) }
  })

  const classeur = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(classeur, feuille, String(Number(mois)))
  XLSX.writeFile(classeur, `code_cot ${INDICATEUR_COTISATION} ${Number(mois)} ${annee}.xlsx`)
  return lignes.length
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Lit le fichier en rangées de cellules, qu'il soit classeur ou CSV. */
async function rangeesDe(fichier) {
  if (/\.csv$/i.test(fichier.name)) {
    const texte = (await fichier.text()).replace(/^﻿/, '')
    const separateur = texte.includes(';') ? ';' : ','
    return texte
      .split(/\r?\n/)
      .filter((rang) => rang.trim())
      .map((rang) => rang.split(separateur).map((c) => c.trim()))
  }
  const XLSX = await chargerXlsx()
  const classeur = XLSX.read(await fichier.arrayBuffer())
  const feuille = classeur.Sheets[classeur.SheetNames[0]]
  if (!feuille) return []
  return XLSX.utils.sheet_to_json(feuille, { header: 1, defval: '', blankrows: false })
}

/**
 * Repère les colonnes utiles par leur titre.
 *
 * Le montant se cherche d'abord sur « Valeur » - le titre du modèle. On ne
 * peut pas se contenter de chercher « cotisation » : la **première** colonne
 * du fichier s'appelle « Code Cotisations », et on y prendrait des codes pour
 * des francs.
 */
const reperer = (titres) => {
  const titre = titres.map(normaliser)
  const cherche = (test) => titre.findIndex(test)
  const iCode = cherche((t) => t.startsWith('code cotis'))
  return {
    iCode,
    iMatricule: cherche((t) => t.includes('matricule')),
    iIndicateur: cherche((t) => t.includes('indicateur') && t.includes('code')),
    iMontant: (() => {
      const valeur = cherche((t) => t.includes('valeur'))
      if (valeur >= 0) return valeur
      return cherche((t, i) => i !== iCode && (t.includes('cotisation') || t.includes('montant')))
    })(),
  }
}

/**
 * Lit un fichier de cotisations, **sans rien savoir de l'appel**.
 *
 * Renvoie `{ rangs, codes, indicateurs }` :
 *   - `rangs` : `[{ matricule, montant }]`, les matricules tels que le
 *     fichier les porte ;
 *   - `codes` : les codes d'appel lus en première colonne - c'est ainsi que
 *     le fichier dit de quel appel il est ;
 *   - `indicateurs` : les rubriques de paie rencontrées.
 *
 * La lecture précède l'appel, et non l'inverse : on veut pouvoir refuser un
 * fichier qui n'est pas le bon **avant** d'avoir créé quoi que ce soit.
 *
 * Lève une erreur en clair si le fichier n'a pas les deux colonnes qu'il faut.
 */
export async function lireAppelExcel(fichier) {
  const rangees = await rangeesDe(fichier)
  if (!rangees.length) throw new Error('Le fichier est vide.')

  const [titres, ...corps] = rangees
  const { iCode, iMatricule, iMontant, iIndicateur } = reperer(titres)
  if (iMatricule < 0 || iMontant < 0) {
    throw new Error(
      'Le fichier doit porter une colonne « Matricule » et une colonne ' +
        '« Indicateur- Valeur » (ou « Cotisation Dûe »).',
    )
  }

  const rangs = []
  const codes = new Set()
  const indicateurs = new Set()

  corps.forEach((rangee) => {
    const matricule = String(rangee[iMatricule] ?? '').trim()
    if (!matricule) return
    const ajoute = (i, ou) => {
      if (i < 0) return
      const lu = String(rangee[i] ?? '').trim()
      if (lu) ou.add(lu)
    }
    ajoute(iCode, codes)
    ajoute(iIndicateur, indicateurs)
    const valeur = String(rangee[iMontant] ?? '')
      .replace(/\s/g, '')
      .replace(',', '.')
    rangs.push({ matricule, montant: Math.round(Number(valeur) || 0) })
  })

  return { rangs, codes: [...codes], indicateurs: [...indicateurs] }
}

/**
 * Rapproche les rangs du fichier des cotisants de l'appel.
 *
 * Le matricule est rendu dans la forme de la fiche - `0693` et non `693` -
 * pour que le serveur le reconnaisse. Ceux qui ne sont d'aucun cotisant sont
 * rendus à part : un agent parti en cours de mois figure encore sur l'état de
 * la paie, et le taire le cacherait.
 */
export function rapprocher(rangs, lignesAppel) {
  const parCle = new Map(lignesAppel.map((l) => [cleMatricule(l.matricule), l.matricule]))
  const lignes = []
  const horsAppel = []
  rangs.forEach(({ matricule, montant }) => {
    const connu = parCle.get(cleMatricule(matricule))
    if (connu) lignes.push({ matricule: connu, montant })
    else horsAppel.push(matricule)
  })
  return { lignes, horsAppel }
}

/** Le code d'un appel, composé comme le fait le serveur. */
export const codeAppel = (societe, annee, mois, journal) =>
  `${societe}-${annee}-${Number(mois)}-${journal}`

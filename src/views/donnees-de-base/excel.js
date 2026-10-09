/**
 * Import et export Excel des référentiels.
 *
 * Le fichier suit la description du référentiel (config.js) : une colonne par
 * champ, titrée de son libellé de tableau. C'est ce qui rend l'aller-retour
 * sûr - un fichier exporté, retouché puis réimporté retrouve chaque colonne
 * par son titre.
 *
 * La bibliothèque (SheetJS) n'est chargée qu'au premier clic : elle pèse
 * plusieurs centaines de kilo-octets, que personne n'a à télécharger pour
 * simplement consulter une liste.
 */

import { libelleValeur, optionsDe } from './optionsChamp'

const chargerXlsx = () => import('xlsx')

/** Titres comparés sans casse, sans accents ni espaces superflus. */
const normaliser = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const deuxChiffres = (n) => String(n).padStart(2, '0')

/** Date du calendrier local → « 2026-09-10 ». */
const dateIso = (d) =>
  `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`

/** « 2026-09-10 » → date locale, pour une vraie cellule date dans Excel. */
const versDate = (iso) => {
  const [annee, mois, jour] = String(iso).split('-').map(Number)
  return annee && mois && jour ? new Date(annee, mois - 1, jour) : iso
}

/**
 * Date saisie à la main dans une cellule texte : « 15/03/2024 » ou déjà
 * « 2024-03-15 ». Toute autre forme passe telle quelle - le serveur dira
 * pourquoi il la refuse, sur la bonne ligne.
 */
const versIso = (texte) => {
  const t = String(texte ?? '').trim()
  const francaise = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (francaise)
    return `${francaise[3]}-${deuxChiffres(francaise[2])}-${deuxChiffres(francaise[1])}`
  return t
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Valeur d'une cellule exportée : ce que l'écran affiche, pas le code interne. */
const valeurExport = (col, entree, entrees) => {
  const brute = entree[col.nom]
  if (col.type === 'etat') return brute ? 'Actif' : 'Suspendu'
  if (col.type === 'booleen') return brute ? 'Oui' : 'Non'
  if (brute === null || brute === undefined || brute === '') return ''
  if (col.type === 'date') return versDate(brute)
  if (col.type === 'number') {
    const nombre = Number(brute)
    return Number.isNaN(nombre) ? String(brute) : nombre
  }
  if (col.options) return libelleValeur(col, brute, entree, entrees)
  // En texte, toujours : Excel changerait sinon « 001 » en 1 et « 0045 » en 45.
  return String(brute)
}

/** Nom d'onglet admis par Excel : 31 caractères, sans []:*?/\ . */
const nomOnglet = (libelle) => libelle.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)

/**
 * Exporte les lignes données - celles de la vue affichée, filtres compris -
 * avec tous les champs de la fiche, pas seulement ceux du tableau. Renvoie le
 * nombre de lignes écrites.
 */
export async function exporterExcel(referentiel, lignes, entrees) {
  const XLSX = await chargerXlsx()
  // Un bouton du formulaire n'est pas une donnée : pas de colonne à l'export.
  // Les actes d'un document, liste de lignes, ne tiennent pas dans une cellule.
  const colonnes = referentiel.colonnes.filter(
    (col) => col.type !== 'bouton' && col.type !== 'actes',
  )
  const titres = colonnes.map((col) => col.libelle)
  const donnees = lignes.map((entree) =>
    Object.fromEntries(colonnes.map((col) => [col.libelle, valeurExport(col, entree, entrees)])),
  )

  const feuille = XLSX.utils.json_to_sheet(donnees, {
    header: titres,
    cellDates: true,
    dateNF: 'dd/mm/yyyy',
  })
  // Largeur de colonne à la mesure du contenu, bornée : un intitulé long ne
  // doit pas pousser les autres colonnes hors de l'écran.
  feuille['!cols'] = titres.map((titre) => {
    const largeurs = donnees.map((d) => (d[titre] instanceof Date ? 10 : String(d[titre]).length))
    return { wch: Math.min(45, Math.max(titre.length, ...largeurs) + 2) }
  })

  const classeur = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(classeur, feuille, nomOnglet(referentiel.libelle))
  const d = new Date()
  const date = `${deuxChiffres(d.getDate())}-${deuxChiffres(d.getMonth() + 1)}-${d.getFullYear()}`
  XLSX.writeFile(classeur, `${referentiel.libelle} ${date}.xlsx`)
  return lignes.length
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const VRAI = new Set(['actif', 'oui', 'vrai', 'true', '1', 'x'])
const FAUX = new Set(['suspendu', 'inactif', 'non', 'faux', 'false', '0'])

/**
 * Valeur d'une cellule traduite pour l'API. `undefined` : la cellule ne dit
 * rien d'exploitable, le champ n'est pas envoyé - une mise à jour le laisse
 * alors tel qu'il était.
 */
const convertir = (col, valeur, entrees) => {
  if (col.type === 'etat' || col.type === 'booleen') {
    if (typeof valeur === 'boolean') return valeur
    const mot = normaliser(valeur)
    if (VRAI.has(mot)) return true
    if (FAUX.has(mot)) return false
    return undefined
  }
  if (valeur instanceof Date) return dateIso(valeur)
  if (col.type === 'date') return versIso(valeur)
  if (col.nom === 'code' && typeof valeur === 'number') {
    // Excel a pu changer « 007 » en 7 si la colonne a été retapée : on
    // retrouve la fiche par sa valeur plutôt que d'en créer une seconde.
    const existante = entrees.find((e) => Number(e.code) === valeur)
    return existante ? existante.code : String(valeur)
  }
  if (col.type === 'number') return valeur
  let texte = String(valeur ?? '').trim()
  if (col.options && texte) {
    // Le fichier peut porter le code (« 08 ») ou l'intitulé (« CLINIQUES ») :
    // l'export écrit l'intitulé, une saisie à la main peut donner l'un ou
    // l'autre.
    const options = optionsDe(col, {}, entrees)
    const trouvee =
      options.find((o) => o.valeur === texte) ||
      options.find((o) => normaliser(o.libelle) === normaliser(texte))
    if (trouvee) return trouvee.valeur
  }
  if (col.majuscules) texte = texte.toUpperCase()
  return texte
}

/**
 * Lit le premier onglet d'un classeur et le traduit en lignes pour l'API : une
 * par ligne non vide, chacune notée du numéro de sa ligne Excel (`_ligne`)
 * pour que le serveur désigne précisément ce qui ne va pas.
 *
 * Renvoie aussi les titres de colonnes non reconnus : ils sont ignorés, mais
 * annoncés avant l'import plutôt que perdus en silence.
 */
export async function lireExcel(fichier, referentiel, entrees) {
  const XLSX = await chargerXlsx()
  const classeur = XLSX.read(await fichier.arrayBuffer(), { cellDates: true })
  const feuille = classeur.Sheets[classeur.SheetNames[0]]
  if (!feuille) return { lignes: [], ignorees: [] }

  const [titres = [], ...rangees] = XLSX.utils.sheet_to_json(feuille, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: true,
  })

  // Colonnes importables : toutes, sauf les champs que l'application calcule
  // ou fige - le numéro excepté, qui désigne la fiche à mettre à jour.
  const importables = referentiel.colonnes.filter(
    (col) =>
      col.nom === 'code' ||
      !(col.calcule || col.lectureSeule || col.type === 'bouton' || col.type === 'actes'),
  )
  const parTitre = new Map()
  importables.forEach((col) => {
    parTitre.set(normaliser(col.libelle), col)
    parTitre.set(normaliser(col.nom), col)
  })
  const correspondances = titres.map((titre) => parTitre.get(normaliser(titre)) || null)
  const ignorees = titres.filter((titre, i) => String(titre).trim() && !correspondances[i])

  const lignes = []
  rangees.forEach((rangee, i) => {
    const ligne = {}
    correspondances.forEach((col, j) => {
      if (!col) return
      const valeur = convertir(col, rangee[j], entrees)
      if (valeur !== undefined) ligne[col.nom] = valeur
    })
    // Une ligne sans rien d'utile - une ligne blanche au milieu du tableau -
    // n'est ni une création ni une mise à jour.
    if (Object.values(ligne).some((v) => v !== '')) lignes.push({ ...ligne, _ligne: i + 2 })
  })
  return { lignes, ignorees }
}

/**
 * Rapport d'un import refusé, en clair : « Ligne 7 - Spécialité : … ». Les
 * noms de champs de l'API sont traduits en titres de colonnes, ceux que
 * l'utilisateur a sous les yeux dans son fichier.
 */
export const rapportErreurs = (donnees, referentiel, max = 15) => {
  const titre = (champ) => referentiel.colonnes.find((c) => c.nom === champ)?.libelle || champ
  const messages = (donnees.erreurs || []).flatMap(({ ligne, erreurs }) =>
    Object.entries(erreurs).map(([champ, detail]) => {
      const texte = [].concat(detail).join(' ')
      return champ === 'non_field_errors'
        ? `Ligne ${ligne} - ${texte}`
        : `Ligne ${ligne} - ${titre(champ)} : ${texte}`
    }),
  )
  const suite = messages.length > max ? `\n… et ${messages.length - max} autre(s).` : ''
  return (
    `Import refusé : rien n’a été enregistré.\n` +
    `${(donnees.erreurs || []).length} ligne(s) à corriger dans le fichier :\n\n` +
    `${messages.slice(0, max).join('\n')}${suite}`
  )
}

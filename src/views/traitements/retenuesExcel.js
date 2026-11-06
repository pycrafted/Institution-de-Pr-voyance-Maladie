/**
 * Les deux classeurs des Retenues Frais Médicaux - la boucle avec la paie.
 *
 * Ce module n'invente rien : les deux formats viennent des fichiers réels que
 * le métier nous a montrés (captures 90 et 91). On lit ce que Sage envoie, on
 * écrit ce que Sage attend.
 *
 * **Celui qui arrive**, `CODE _RETENUE_660_6_2026.xlsx`, six colonnes :
 *
 *   CODE RETENUE | Matricule | Nom | Prénom | Indicateur - Code | Indicateur- Valeur
 *   01-2026-6    | 0699      | …   | …      | 6600              | 118 955,00
 *
 * Trois choses à en retenir :
 *
 *   - **« CODE RETENUE » est le numéro de campagne**, au format
 *     `société-année-mois`, mois non complété. Vérifié sur 20 136 lignes de
 *     la production : pas un écart. C'est notre garde-fou - un fichier de
 *     juin ne doit pas se déverser dans la campagne de novembre.
 *   - **« Indicateur - Code » n'est pas un montant**, c'est la rubrique de
 *     paie (6600). Elle nomme le fichier, et ne se range nulle part.
 *   - **Le montant est « Indicateur- Valeur »** - orthographe d'origine,
 *     espace manquante comprise, qu'on ne corrige pas.
 *
 * **Celui qui repart**, `solde_fichier_participants_CADRES_112026.xls`, cinq
 * colonnes : `Maricule` (faute d'origine), `Participant`, `Code Soc`,
 * `Solde`, `Montant Retenue`.
 *
 * Une seule chose y change par rapport à LAMPS, et le métier l'a validée : on
 * ajoute la période **dans** le classeur. L'original ne la portait que dans
 * le nom du fichier - renommez-le, et plus personne ne sait de quel mois il
 * parle, alors que le fichier qui arrive, lui, répète son code sur chaque
 * ligne. L'asymétrie était gratuite.
 *
 * La bibliothèque (SheetJS) n'est chargée qu'au premier clic : elle pèse
 * plusieurs centaines de kilo-octets.
 */

const chargerXlsx = () => import('xlsx')

/**
 * Rubrique de paie de la retenue frais médicaux, telle que Sage la porte.
 *
 * Constante parce que le fichier réel n'en montre qu'une, sur les deux
 * sociétés. Si la paie en utilisait une par société, ce serait un champ à
 * porter sur l'adhérent - question ouverte dans docs/lamps/questions-paie.md.
 */
export const INDICATEUR_RETENUE = '6600'

const COLONNES_IMPORT = [
  'CODE RETENUE',
  'Matricule',
  'Nom',
  'Prénom',
  'Indicateur - Code',
  'Indicateur- Valeur',
]

const COLONNES_EXPORT = [
  'Maricule',
  'Participant',
  'Code Soc',
  'Solde',
  'Montant Retenue',
  // La colonne que LAMPS n'a pas : le mois dont il s'agit, écrit dans le
  // classeur et non seulement dans son nom.
  'Code Retenue',
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
 * Matricule comparé sans ses zéros de tête : Excel change « 0699 » en 699 dès
 * que la colonne a été retapée en nombre. C'est la fiche qui porte la bonne
 * forme, le fichier ne sert qu'à la retrouver.
 */
const cleMatricule = (valeur) =>
  String(valeur ?? '')
    .trim()
    .replace(/^0+/, '')

/** Le code d'une campagne, composé comme le fait le serveur : « 01-2026-6 ». */
export const codeCampagne = (societe, annee, mois) => `${societe}-${annee}-${Number(mois)}`

// ---------------------------------------------------------------------------
// Export : le fichier des soldes, qui part vers la paie
// ---------------------------------------------------------------------------

/**
 * Écrit le solde de chaque participant dans la forme que Sage sait lire.
 *
 * `Solde` porte la dette **restante**, celle d'après le prélèvement du mois :
 * l'export part une fois la campagne comptabilisée, et renvoyer la dette
 * photographiée à l'appel ferait prélever deux fois la même somme.
 *
 * `Montant Retenue` porte la proposition de l'IPM pour le mois suivant,
 * `min(solde restant, 35 000)`. La
 * production montre que la paie ne la suit que 5,5 % du temps - elle prélève
 * ce que le salaire permet, et c'est son métier. On l'envoie quand même : le
 * métier l'a tranché le 2026-11-05, la colonne reste pour rester identique à
 * LAMPS et parce que la paie s'attend à la voir.
 *
 * Renvoie le nombre de lignes écrites.
 */
export async function exporterSoldes(campagne, lignes, { societeLibelle }) {
  const XLSX = await chargerXlsx()
  const donnees = lignes.map((l) => ({
    // En texte, toujours : « 0699 » ne doit pas revenir en 699.
    Maricule: String(l.matricule ?? ''),
    Participant: `${l.prenoms ?? ''} ${l.nom ?? ''}`.trim(),
    'Code Soc': String(l.codeSoc ?? ''),
    // La dette **après** le prélèvement du mois, pas celle photographiée à
    // l'appel : l'export part une fois la campagne comptabilisée, et renvoyer
    // la dette d'avant ferait prélever deux fois la même somme.
    Solde: Number(l.soldeRestant ?? l.solde ?? 0),
    'Montant Retenue': Number(l.retenueSuivante ?? l.retenueIpm ?? 0),
    'Code Retenue': campagne.code,
  }))

  const feuille = XLSX.utils.json_to_sheet(donnees, { header: COLONNES_EXPORT })
  feuille['!cols'] = [{ wch: 11 }, { wch: 30 }, { wch: 9 }, { wch: 13 }, { wch: 15 }, { wch: 13 }]
  const classeur = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(classeur, feuille, 'Soldes')

  // Le nom du fichier d'origine : mois collé à l'année, société en clair.
  const periode = `${String(campagne.mois).padStart(2, '0')}${campagne.annee}`
  const nom = (societeLibelle || campagne.societe || '')
    .replace(/^IPM SAR PERSONNEL /i, '')
    .replace(/[^A-Za-zÀ-ÿ0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  XLSX.writeFile(classeur, `solde_fichier_participants_${nom}_${periode}.xls`, {
    bookType: 'biff8',
  })
  return donnees.length
}

// ---------------------------------------------------------------------------
// Import : le fichier des retenues, qui revient de la paie
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
 * peut pas se contenter de chercher « retenue » : la **première** colonne du
 * fichier s'appelle « CODE RETENUE », et on y prendrait des codes pour des
 * francs.
 */
const reperer = (titres) => {
  const titre = titres.map(normaliser)
  const cherche = (test) => titre.findIndex(test)
  const iCode = cherche((t) => t.startsWith('code retenue') || t.startsWith('code retenu'))
  return {
    iCode,
    iMatricule: cherche((t) => t.includes('matricule') || t.includes('maricule')),
    iNom: cherche((t) => t === 'nom'),
    iPrenom: cherche((t) => t.startsWith('prenom')),
    iIndicateur: cherche((t) => t.includes('indicateur') && t.includes('code')),
    iMontant: (() => {
      const valeur = cherche((t) => t.includes('valeur'))
      if (valeur >= 0) return valeur
      return cherche((t, i) => i !== iCode && (t.includes('retenue') || t.includes('montant')))
    })(),
  }
}

/**
 * Lit un fichier de retenues, **sans rien savoir de la campagne**.
 *
 * Renvoie `{ rangs, codes, indicateurs }` :
 *   - `rangs` : `[{ code, matricule, participant, indicateur, montant }]`, les
 *     lignes telles que le fichier les porte. Le modal d'importation les
 *     réaffiche une par une avant qu'on ne charge quoi que ce soit, et le nom
 *     y sert à l'œil de celui qui relit : le rapprochement, lui, se fait sur
 *     le seul matricule ;
 *   - `codes` : les codes lus en première colonne - c'est ainsi que le
 *     fichier dit de quelle campagne il est ;
 *   - `indicateurs` : les rubriques de paie rencontrées.
 *
 * La lecture précède tout : on veut pouvoir refuser un fichier qui n'est pas
 * le bon **avant** d'avoir touché à une seule ligne.
 */
export async function lireRetenuesExcel(fichier) {
  const rangees = await rangeesDe(fichier)
  if (!rangees.length) throw new Error('Le fichier est vide.')

  const [titres, ...corps] = rangees
  const { iCode, iMatricule, iNom, iPrenom, iMontant, iIndicateur } = reperer(titres)
  if (iMatricule < 0 || iMontant < 0) {
    throw new Error(
      'Le fichier doit porter une colonne « Matricule » et une colonne ' +
        '« Indicateur- Valeur ».',
    )
  }

  const rangs = []
  const codes = new Set()
  const indicateurs = new Set()

  const cellule = (rangee, i) => (i < 0 ? '' : String(rangee[i] ?? '').trim())

  corps.forEach((rangee) => {
    const matricule = cellule(rangee, iMatricule)
    if (!matricule) return
    const code = cellule(rangee, iCode)
    const indicateur = cellule(rangee, iIndicateur)
    if (code) codes.add(code)
    if (indicateur) indicateurs.add(indicateur)
    // « 118 955,00 » : espaces des milliers, virgule décimale. Le montant est
    // un entier de francs CFA, on arrondit plutôt que de traîner des
    // centimes que la comptabilité ne porte pas.
    const valeur = cellule(rangee, iMontant).replace(/\s/g, '').replace(',', '.')
    rangs.push({
      code,
      matricule,
      // L'original recolle le prénom puis le nom : « OUSMANE FALL ».
      participant: `${cellule(rangee, iPrenom)} ${cellule(rangee, iNom)}`.trim(),
      indicateur,
      montant: Math.round(Number(valeur) || 0),
    })
  })

  return { rangs, codes: [...codes], indicateurs: [...indicateurs] }
}

/**
 * Rapproche les rangs du fichier des lignes de la campagne.
 *
 * Le matricule est rendu dans la forme de la fiche - `0699` et non `699` -
 * pour que le serveur le reconnaisse. Ceux qui ne correspondent à aucune
 * ligne sont rendus à part : un agent prélevé alors qu'il n'avait pas de
 * dette appelée est une information, pas un déchet.
 */
export function rapprocher(rangs, lignesCampagne) {
  const parCle = new Map(lignesCampagne.map((l) => [cleMatricule(l.matricule), l]))
  const lignes = []
  const horsCampagne = []
  rangs.forEach((rang) => {
    const ligne = parCle.get(cleMatricule(rang.matricule))
    if (!ligne) {
      horsCampagne.push(rang)
      return
    }
    lignes.push({
      ...rang,
      // Le matricule de la fiche, pas celui du fichier : « 0699 » et non 699.
      matricule: ligne.matricule,
      // Ce que le participant devait, pour que le modal puisse dire tout de
      // suite si le prélèvement dépasse la dette - avant de charger.
      solde: Number(ligne.solde || 0),
      excedent: Math.max(0, rang.montant - Number(ligne.solde || 0)),
    })
  })
  return { lignes, horsCampagne }
}

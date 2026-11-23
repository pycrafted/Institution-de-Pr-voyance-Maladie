/**
 * Chargement unique de l'API Google Maps JavaScript.
 *
 * Le script de Google n'est injecté qu'une fois, à l'ouverture de la première
 * carte (l'écran d'itinéraire est le seul à en avoir besoin). La clé vient de
 * config.json (runtime, hors Git, restreinte par référent HTTP) : le même
 * build sert tous les IPM. Sans clé, on lève `CleManquante` et la carte le dit
 * plutôt que de s'afficher vide.
 *
 * `chargerGoogleMaps()` résout sur l'objet `google.maps` prêt à l'emploi ; en
 * cas d'échec (clé absente, réseau, Google injoignable), la promesse est
 * oubliée pour qu'une nouvelle tentative reparte de zéro.
 *
 * `prechargerGoogleMaps()` le lance en arrière-plan, quand le téléphone n'a
 * rien d'autre à faire, dès que l'employé est connecté : à l'ouverture de
 * l'onglet « Structures », le script est déjà là et la carte s'affiche tout
 * de suite. Les connexions vers Google sont ouvertes d'avance (preconnect
 * dans index.html).
 */

import { chargerConfig } from '../../api/config'

/** La clé Google Maps n'est pas renseignée dans config.json. */
export class CleManquante extends Error {
  constructor() {
    super('Clé Google Maps absente de config.json.')
    this.name = 'CleManquante'
  }
}

/**
 * ID de carte du projet Google « ipm-mobile » : carte VECTORIELLE (zoom continu
 * et fluide, rotation, inclinaison, comme l'application Google Maps) et style
 * « IPM clair » (fond adouci, ni commerces ni transports) réglé dans la console
 * Google Cloud. config.json peut en donner un autre (`idCarteGoogle`).
 */
const ID_CARTE_PAR_DEFAUT = '90632891372333d5a8af4a35'

let idCarteLu = ID_CARTE_PAR_DEFAUT

/** L'ID de carte à donner aux cartes (connu une fois Google Maps chargé). */
export function idCarte(): string {
  return idCarteLu
}

// Le nom de la fonction que Google rappelle quand l'API est prête.
const RAPPEL = '__ipmGoogleMapsPret'

let promesse: Promise<typeof google.maps> | null = null

export function chargerGoogleMaps(): Promise<typeof google.maps> {
  if (promesse) return promesse
  promesse = (async () => {
    // Déjà chargé (deuxième ouverture d'une carte dans la même session).
    if (typeof google !== 'undefined' && google.maps) return google.maps
    const { cleGoogleMaps, idCarteGoogle } = await chargerConfig()
    if (idCarteGoogle) idCarteLu = idCarteGoogle
    if (!cleGoogleMaps) throw new CleManquante()
    await injecter(cleGoogleMaps)
    return google.maps
  })()
  promesse.catch(() => {
    // Oublier l'échec : clé ajoutée au serveur, réseau revenu… on pourra réessayer.
    promesse = null
  })
  return promesse
}

/** Charge Google Maps quand le téléphone est libre, sans rien bloquer. */
export function prechargerGoogleMaps(): void {
  const lancer = () => void chargerGoogleMaps().catch(() => undefined)
  if ('requestIdleCallback' in window) window.requestIdleCallback(lancer, { timeout: 4000 })
  else setTimeout(lancer, 1500)
}

function injecter(cle: string): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const fenetre = window as unknown as Record<string, unknown>
    fenetre[RAPPEL] = () => resoudre()
    const script = document.createElement('script')
    script.async = true
    script.src =
      'https://maps.googleapis.com/maps/api/js?' +
      new URLSearchParams({
        key: cle,
        v: 'weekly',
        libraries: 'geometry',
        // Chargement asynchrone recommandé par Google : le script ne bloque
        // pas la page, et les bibliothèques arrivent à la demande.
        loading: 'async',
        language: 'fr',
        region: 'SN',
        callback: RAPPEL,
      }).toString()
    script.onerror = () => rejeter(new Error('Google Maps injoignable.'))
    document.head.appendChild(script)
  })
}

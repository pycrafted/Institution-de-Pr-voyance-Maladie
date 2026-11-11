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
 */

import { chargerConfig } from '../../api/config'

/** La clé Google Maps n'est pas renseignée dans config.json. */
export class CleManquante extends Error {
  constructor() {
    super('Clé Google Maps absente de config.json.')
    this.name = 'CleManquante'
  }
}

// Le nom de la fonction que Google rappelle quand l'API est prête.
const RAPPEL = '__ipmGoogleMapsPret'

let promesse: Promise<typeof google.maps> | null = null

export function chargerGoogleMaps(): Promise<typeof google.maps> {
  if (promesse) return promesse
  promesse = (async () => {
    // Déjà chargé (deuxième ouverture d'une carte dans la même session).
    if (typeof google !== 'undefined' && google.maps) return google.maps
    const { cleGoogleMaps } = await chargerConfig()
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
        language: 'fr',
        region: 'SN',
        callback: RAPPEL,
      }).toString()
    script.onerror = () => rejeter(new Error('Google Maps injoignable.'))
    document.head.appendChild(script)
  })
}

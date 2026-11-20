/**
 * La carte des structures conventionnées, en tête de l'écran « Structures » :
 * Google Maps (même chargement et même clé que l'itinéraire, cf.
 * itineraire/googleMaps.ts), un point rouge par structure localisée.
 *
 * Toucher un point trace AUSSITÔT les itinéraires sur cette même carte, calculés
 * par Google (Routes API : alternatives et trafic en temps réel, recalcul tous
 * les 50 m) : le retenu en bleu, les autres en gris - les toucher, ou leur puce
 * dans la vignette, les retient. Puis, et une vignette en bas - nom, spécialité, temps en voiture,
 * distance en vedette, temps en voiture et à pied, et deux icônes : « Appeler » et « Ouvrir dans
 * Google Maps » (l'application, pour le pas à pas). Sans position, le trajet part de la SAR, comme
 * sur l'ancien écran d'itinéraire, et la vignette le dit.
 *
 * Centrage : sur la POSITION de l'employé dès qu'elle est connue (flèche
 * bleue, distincte des points rouges), à l'échelle d'un quartier ; changer de
 * filtre ne déplace plus la carte, et « Ma position » la recentre. Sans
 * position (refusée, indisponible, page en HTTP), la carte se cadre sur les
 * structures, comme avant.
 */

import { IonIcon } from '@ionic/react'
import { callOutline, closeOutline, locateOutline, mapOutline } from 'ionicons/icons'
import { useEffect, useRef, useState } from 'react'

import Chargeur from '../../components/Chargeur'
import { haptique } from '../../hooks/haptique'
import type { Conventionne } from '../../types/api'
import { CleManquante, chargerGoogleMaps } from '../itineraire/googleMaps'
import { estSombre, styleCarte } from '../itineraire/styleCarte'
import { dureeAPied, formaterDistance, formaterDuree, type Point } from '../itineraire/trajet'
import { useGeolocalisation } from '../itineraire/useGeolocalisation'
import { useTrajets } from '../itineraire/useTrajet'
import { libelleSpecialite, lienItineraire, lienTelephone, nomStructure } from './recherche'

/** Sans aucun point : le centre de Dakar, où sont la plupart des structures. */
const DAKAR = { lat: 14.6937, lng: -17.4441 }

/** Zoom autour de l'employé : un quartier, avec les structures proches. */
const ZOOM_MOI = 14

/**
 * Départ du trajet quand la position de l'employé manque (refusée, page en
 * HTTP sur le site de test) : la SAR, comme l'écran d'itinéraire. À retirer
 * une fois le site servi en HTTPS.
 */
const SAR_PAR_DEFAUT: Point = { latitude: 14.740742, longitude: -17.34728 }

/** Les couleurs des tracés, reprises de Google Maps. */
const COULEURS = {
  retenu: '#4d3df7',
  retenuBord: '#1f1a8f',
  alternative: '#b6c6fb',
  alternativeBord: '#5a6ef0',
}

/** Marges du cadrage d'un trajet : la barre et les filtres en haut, la vignette en bas. */
const MARGES_TRAJET = { top: 200, right: 40, bottom: 260, left: 40 }

export default function CarteStructures({ structures }: { structures: readonly Conventionne[] }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const maps = useRef<typeof google.maps | null>(null)
  const carte = useRef<google.maps.Map | null>(null)
  const points = useRef<google.maps.Marker[]>([])
  // Le code de la structure de chaque point (même ordre que `points`).
  const codes = useRef<string[]>([])
  const [pret, setPret] = useState(false)
  // Fond de carte affiché (premières tuiles chargées) : le chargeur s'efface.
  const [affichee, setAffichee] = useState(false)
  const [erreur, setErreur] = useState<'cle' | 'reseau' | null>(null)
  const [choisie, setChoisie] = useState<Conventionne | null>(null)
  const localisation = useGeolocalisation()
  const moi =
    localisation.etat === 'trouvee'
      ? { lat: localisation.position.latitude, lng: localisation.position.longitude }
      : null
  const fleche = useRef<google.maps.Marker | null>(null)
  // Centré une fois sur l'employé : ensuite, la carte reste où il la met.
  const centreSurMoi = useRef(false)
  // La position, lue par le cadrage des structures (qui ne doit pas l'écraser).
  const moiConnu = useRef(false)
  moiConnu.current = moi !== null

  // Le trajet vers la structure touchée : de l'employé, sinon de la SAR.
  const depart: Point = localisation.etat === 'trouvee' ? localisation.position : SAR_PAR_DEFAUT
  const departParDefaut = localisation.etat !== 'trouvee'
  const etatTrajets = useTrajets(choisie ? depart : null, choisie?.position ?? null)
  const trajets = etatTrajets.etat === 'pret' ? etatTrajets.trajets : []
  // L'itinéraire retenu parmi les alternatives (le meilleur au départ).
  const [rang, setRang] = useState(0)
  const trajet = trajets[rang] ?? trajets[0] ?? null
  // Nouvelle structure : on repart du meilleur itinéraire, et on recadre.
  const cadreSur = useRef<string | null>(null)
  useEffect(() => {
    setRang(0)
    cadreSur.current = null
  }, [choisie?.code])
  const lignes = useRef<google.maps.Polyline[]>([])
  // Les repères du trajet : points de virage, départ, épingle d'arrivée.
  const reperes = useRef<google.maps.Marker[]>([])

  // La carte, créée une fois Google chargé.
  useEffect(() => {
    let vivant = true
    let observateur: MutationObserver | undefined
    chargerGoogleMaps()
      .then((api) => {
        if (!vivant || !conteneur.current) return
        maps.current = api
        carte.current = new api.Map(conteneur.current, {
          center: DAKAR,
          zoom: 12,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
          // Fond épuré : rues et quartiers, sans commerces ni transports.
          styles: styleCarte(estSombre()),
        })
        // Suivre le passage clair/sombre (classe sur <html>) pour restyler.
        const instance = carte.current
        observateur = new MutationObserver(() =>
          instance.setOptions({ styles: styleCarte(estSombre()) }),
        )
        observateur.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        })
        // Toucher le fond de carte referme la vignette.
        carte.current.addListener('click', () => setChoisie(null))
        api.event.addListenerOnce(carte.current, 'tilesloaded', () => {
          if (vivant) setAffichee(true)
        })
        setPret(true)
      })
      .catch((e: unknown) => {
        if (vivant) setErreur(e instanceof CleManquante ? 'cle' : 'reseau')
      })
    return () => {
      vivant = false
      observateur?.disconnect()
      carte.current = null
      maps.current = null
    }
  }, [])

  // Les points : redessinés et recadrés à chaque changement de filtre.
  useEffect(() => {
    const api = maps.current
    const instance = carte.current
    if (!api || !instance) return
    for (const p of points.current) p.setMap(null)
    points.current = []
    codes.current = []
    setChoisie(null)

    const positions: google.maps.LatLngLiteral[] = []
    for (const structure of structures) {
      if (!structure.position) continue
      const position = { lat: structure.position.latitude, lng: structure.position.longitude }
      const point = new api.Marker({
        map: instance,
        position,
        title: nomStructure(structure),
        icon: {
          path: api.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#e52621',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      })
      point.addListener('click', () => {
        haptique.leger()
        setChoisie(structure)
      })
      points.current.push(point)
      codes.current.push(structure.code)
      positions.push(position)
    }

    // Position connue : la carte est centrée sur l'employé, les filtres ne la
    // déplacent pas.
    if (moiConnu.current) return
    const cadre = zonePrincipale(positions)
    if (cadre.length === 1 && cadre[0]) {
      instance.setCenter(cadre[0])
      instance.setZoom(15)
    } else if (cadre.length > 1) {
      const bornes = new api.LatLngBounds()
      cadre.forEach((p) => bornes.extend(p))
      // Marges : la barre et les filtres en haut, la barre d'onglets en bas.
      instance.fitBounds(bornes, { top: 190, right: 32, bottom: 130, left: 32 })
    } else {
      instance.setCenter(DAKAR)
      instance.setZoom(12)
    }
  }, [pret, structures])

  // La flèche de l'employé : posée, puis suivie ; la carte se centre dessus
  // la première fois que la position arrive.
  useEffect(() => {
    const api = maps.current
    const instance = carte.current
    if (!api || !instance || !moi) return
    if (!fleche.current) {
      fleche.current = new api.Marker({
        map: instance,
        position: moi,
        title: 'Ma position',
        zIndex: 1000,
        icon: {
          path: api.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 7,
          fillColor: '#1a73e8',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      })
    } else {
      fleche.current.setPosition(moi)
    }
    if (!centreSurMoi.current) {
      centreSurMoi.current = true
      const centrer = () => {
        instance.setCenter(moi)
        instance.setZoom(ZOOM_MOI)
      }
      centrer()
      // Un cadrage sur les structures demandé juste avant peut encore être
      // appliqué par Google au prochain rendu : on recentre une fois la carte
      // posée, pour que la position ait le dernier mot.
      api.event.addListenerOnce(instance, 'idle', centrer)
    }
  }, [pret, moi?.lat, moi?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // La flèche disparaît avec la carte.
  useEffect(
    () => () => {
      fleche.current?.setMap(null)
      fleche.current = null
    },
    [],
  )

  // Pendant qu'un itinéraire est affiché, les autres structures s'estompent :
  // leurs points ne viennent plus brouiller le tracé.
  useEffect(() => {
    points.current.forEach((point, i) => {
      const autre = choisie !== null && codes.current[i] !== choisie.code
      point.setOpacity(autre ? 0.25 : 1)
      point.setZIndex(autre ? 1 : undefined)
    })
  }, [choisie, pret, structures])

  // Les tracés, dessinés comme Google Maps : l'itinéraire retenu en indigo
  // bordé de foncé, avec un point blanc à chaque virage ; les alternatives en
  // bleu pâle bordé de bleu (les toucher les retient) ; des pointillés entre
  // le départ et la route, et entre la route et la structure ; un rond évidé
  // au départ (quand on part de la SAR) et l'épingle rouge à l'arrivée.
  // Redessinés à chaque recalcul ; la carte ne se cadre sur le trajet qu'à
  // l'ouverture d'une structure.
  useEffect(() => {
    const api = maps.current
    const instance = carte.current
    for (const l of lignes.current) l.setMap(null)
    lignes.current = []
    for (const r of reperes.current) r.setMap(null)
    reperes.current = []
    if (!api || !instance || !choisie || trajets.length === 0) return

    const ligne = (options: google.maps.PolylineOptions) => {
      const l = new api.Polyline({ map: instance, clickable: false, ...options })
      lignes.current.push(l)
      return l
    }
    const repere = (options: google.maps.MarkerOptions) => {
      reperes.current.push(new api.Marker({ map: instance, clickable: false, ...options }))
    }

    // Les alternatives d'abord (dessous) : bleu pâle bordé de bleu.
    const retenu = Math.min(rang, trajets.length - 1)
    trajets.forEach((t, i) => {
      if (i === retenu) return
      const chemin = t.trace.map(([lat, lng]) => ({ lat, lng }))
      ligne({ path: chemin, strokeColor: COULEURS.alternativeBord, strokeWeight: 10, zIndex: 800 })
      const dessus = ligne({
        path: chemin,
        strokeColor: COULEURS.alternative,
        strokeWeight: 7,
        zIndex: 801,
        clickable: true,
      })
      dessus.addListener('click', () => {
        haptique.leger()
        setRang(i)
      })
    })

    // L'itinéraire retenu : bordure foncée, puis le trait indigo.
    const chemin = (trajets[retenu]?.trace ?? []).map(([lat, lng]) => ({ lat, lng }))
    ligne({ path: chemin, strokeColor: COULEURS.retenuBord, strokeWeight: 12, zIndex: 900 })
    ligne({ path: chemin, strokeColor: COULEURS.retenu, strokeWeight: 8, zIndex: 901 })

    // Un point blanc à chaque virage, comme Google.
    for (const virage of virages(chemin)) {
      repere({
        position: virage,
        zIndex: 950,
        icon: {
          path: api.SymbolPath.CIRCLE,
          scale: 2.6,
          fillColor: '#ffffff',
          fillOpacity: 1,
          strokeColor: COULEURS.retenuBord,
          strokeWeight: 1,
        },
      })
    }

    // Pointillés : du départ réel jusqu'à la route, et de la route jusqu'à la
    // structure (la route ne passe jamais exactement par ces deux points).
    const premier = chemin[0]
    const dernier = chemin[chemin.length - 1]
    const arrivee = choisie.position
      ? { lat: choisie.position.latitude, lng: choisie.position.longitude }
      : null
    const departReel = { lat: depart.latitude, lng: depart.longitude }
    const pointilles = (de: google.maps.LatLngLiteral, a: google.maps.LatLngLiteral) =>
      ligne({
        path: [de, a],
        strokeOpacity: 0,
        zIndex: 902,
        icons: [
          {
            icon: {
              path: api.SymbolPath.CIRCLE,
              scale: 2.4,
              fillColor: COULEURS.retenu,
              fillOpacity: 1,
              strokeOpacity: 0,
            },
            offset: '0',
            repeat: '10px',
          },
        ],
      })
    if (premier) pointilles(departReel, premier)
    if (dernier && arrivee) pointilles(dernier, arrivee)

    // Départ depuis la SAR (pas de position) : le rond évidé de Google.
    if (departParDefaut) {
      repere({
        position: departReel,
        title: 'Départ : la SAR',
        zIndex: 999,
        icon: {
          path: api.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#ffffff',
          fillOpacity: 1,
          strokeColor: '#202124',
          strokeWeight: 3,
        },
      })
    }
    // L'arrivée : l'épingle rouge de Google, au-dessus des points des structures.
    if (arrivee) repere({ position: arrivee, title: nomStructure(choisie), zIndex: 1001 })

    // Cadrage : une fois par structure ouverte, sur tous les itinéraires.
    if (cadreSur.current !== choisie.code) {
      cadreSur.current = choisie.code
      const bornes = new api.LatLngBounds()
      trajets.forEach((t) => t.trace.forEach(([lat, lng]) => bornes.extend({ lat, lng })))
      bornes.extend(departReel)
      instance.fitBounds(bornes, MARGES_TRAJET)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, choisie, etatTrajets, rang])

  function recentrer() {
    if (!moi || !carte.current) return
    haptique.leger()
    carte.current.panTo(moi)
    carte.current.setZoom(ZOOM_MOI)
  }

  const lien = choisie ? lienTelephone(choisie.telephone) : null
  const guidage = choisie ? lienItineraire(choisie) : null

  return (
    <div className="conventionnes__carte">
      <div
        ref={conteneur}
        className="conventionnes__carte-fond"
        role="img"
        aria-label="Carte des structures conventionnées"
      />

      {/* Tant que la carte n'est pas affichée : le chargeur de l'application. */}
      {!affichee && !erreur && (
        <div className="conventionnes__chargement" aria-busy="true">
          <Chargeur aria-label="Chargement de la carte" />
        </div>
      )}

      {/* Recentrer sur l'employé, une fois sa position connue. */}
      {moi && !erreur && (
        <button
          type="button"
          className={`conventionnes__moi ipm-appui${choisie ? ' conventionnes__moi--haut' : ''}`}
          aria-label="Ma position"
          onClick={recentrer}
        >
          <IonIcon icon={locateOutline} aria-hidden="true" />
        </button>
      )}

      {erreur && (
        <p className="conventionnes__carte-erreur">
          {erreur === 'cle'
            ? 'Carte indisponible : la clé Google Maps n’est pas configurée.'
            : 'Carte indisponible : Google Maps est injoignable pour l’instant.'}
        </p>
      )}

      {choisie && (
        <div className="conventionnes__vignette" role="dialog" aria-label={nomStructure(choisie)}>
          <div className="conventionnes__vignette-entete">
            <div className="conventionnes__vignette-textes">
              <p className="conventionnes__vignette-nom">{nomStructure(choisie)}</p>
              <p className="conventionnes__vignette-specialite">
                {libelleSpecialite(choisie.specialite?.libelle)}
              </p>
            </div>
            <div className="conventionnes__vignette-icones">
              {lien && (
                <a
                  className="conventionnes__icone ipm-appui"
                  href={lien}
                  aria-label={`Appeler ${nomStructure(choisie)}`}
                  onClick={() => haptique.leger()}
                >
                  <IonIcon icon={callOutline} aria-hidden="true" />
                </a>
              )}
              {/* Le pas à pas : l'application Google Maps, d'une simple icône. */}
              {guidage && (
                <a
                  className="conventionnes__icone conventionnes__icone--maps ipm-appui"
                  href={guidage}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ouvrir dans Google Maps"
                  onClick={() => haptique.leger()}
                >
                  <IonIcon icon={mapOutline} aria-hidden="true" />
                </a>
              )}
              <button
                type="button"
                className="conventionnes__vignette-fermer ipm-appui"
                aria-label="Fermer"
                onClick={() => setChoisie(null)}
              >
                <IonIcon icon={closeOutline} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Le trajet : distance en vedette, temps en voiture et à pied à côté. */}
          <div className="conventionnes__trajet" aria-live="polite">
            {trajet ? (
              <>
                {/* La distance en vedette, les temps de trajet à côté. */}
                <span className="conventionnes__trajet-duree">
                  {formaterDistance(trajet.distance)}
                </span>
                <span className="conventionnes__trajet-details">
                  <span>
                    {formaterDuree(trajet.duree)} en voiture
                    {retardTrafic(trajet) && (
                      <span className="conventionnes__trajet-trafic">
                        {' '}
                        · +{retardTrafic(trajet)} de trafic
                      </span>
                    )}
                  </span>
                  <span>environ {formaterDuree(dureeAPied(trajet.distance))} à pied</span>
                </span>
              </>
            ) : etatTrajets.etat === 'echec' ? (
              <span className="conventionnes__trajet-attente">
                Itinéraire indisponible pour l’instant. Google Maps reste possible.
              </span>
            ) : (
              <span className="conventionnes__trajet-attente">Calcul de l’itinéraire…</span>
            )}
          </div>
          {/* Plusieurs itinéraires : une puce par itinéraire, la plus rapide
              d'abord ; la toucher (ou toucher sa ligne grise) le retient. */}
          {trajets.length > 1 && (
            <div className="conventionnes__itineraires" role="tablist" aria-label="Itinéraires">
              {trajets.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === rang}
                  className={`conventionnes__itineraire${
                    i === rang ? ' conventionnes__itineraire--actif' : ''
                  }`}
                  onClick={() => {
                    haptique.leger()
                    setRang(i)
                  }}
                >
                  {formaterDuree(t.duree)} · {formaterDistance(t.distance)}
                </button>
              ))}
            </div>
          )}
          {departParDefaut && (
            <p className="conventionnes__trajet-depart">
              Trajet depuis la SAR : votre position n’est pas disponible.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Les points sur lesquels cadrer : ceux de la zone où se trouve l'essentiel
 * des structures (à moins de ~40 km du point médian). Quelques structures à
 * Saint-Louis ou à Touba obligeaient sinon la carte à montrer tout le pays,
 * et les points de Dakar se confondaient. Les points éloignés restent dessinés :
 * il suffit de dézoomer pour les voir.
 */
function zonePrincipale(positions: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral[] {
  if (positions.length < 3) return positions
  const mediane = (valeurs: number[]) => {
    const triees = [...valeurs].sort((a, b) => a - b)
    return triees[Math.floor(triees.length / 2)] ?? 0
  }
  const lat = mediane(positions.map((p) => p.lat))
  const lng = mediane(positions.map((p) => p.lng))
  const proches = positions.filter(
    (p) => Math.abs(p.lat - lat) < 0.35 && Math.abs(p.lng - lng) < 0.35,
  )
  return proches.length > 0 ? proches : positions
}

/** Le retard dû au trafic (« 6 min »), s'il dépasse une minute ; sinon null. */
function retardTrafic(trajet: { duree: number; dureeSansTrafic?: number }): string | null {
  if (trajet.dureeSansTrafic === undefined) return null
  const retard = trajet.duree - trajet.dureeSansTrafic
  return retard >= 60 ? formaterDuree(retard) : null
}

/**
 * Les virages d'un tracé : les sommets où la direction tourne de plus de 35°,
 * espacés d'au moins ~40 m, sans le premier ni le dernier point. Ce sont eux
 * que Google Maps marque d'un point blanc.
 */
function virages(chemin: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral[] {
  const cap = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) =>
    (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI
  const ecart = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) =>
    Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 107000)
  const trouves: google.maps.LatLngLiteral[] = []
  for (let i = 1; i < chemin.length - 1; i++) {
    const avant = chemin[i - 1]
    const ici = chemin[i]
    const apres = chemin[i + 1]
    if (!avant || !ici || !apres) continue
    let tour = Math.abs(cap(ici, apres) - cap(avant, ici))
    if (tour > 180) tour = 360 - tour
    if (tour < 35) continue
    const precedent = trouves[trouves.length - 1]
    if (precedent && ecart(precedent, ici) < 40) continue
    trouves.push(ici)
  }
  return trouves.slice(0, 60)
}

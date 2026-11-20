/**
 * La carte de l'écran d'itinéraire : Google Maps JavaScript.
 *
 * Google Maps (clé dans config.json, cf. googleMaps.ts) remplace l'ancien
 * couple Leaflet + OpenStreetMap : fonds, zoom et libellés de Google, mêmes
 * que l'application Google Maps native vers laquelle renvoie le guidage. Tout
 * le reste est dessiné par-dessus pour garder l'identité de l'application :
 * point bleu pulsé et cercle de précision pour l'employé (surcouches DOM,
 * réutilisant le CSS de .itineraire__moi), épingle rouge SAR pour la structure
 * (.itineraire__epingle), tracé bleu bordé de blanc (comme Google), aucune
 * commande de zoom (le pincement suffit). Le fond suit le mode clair/sombre.
 *
 * Chargée à la demande (React.lazy, cf. pages/Itineraire.tsx) : le script de
 * Google n'est téléchargé qu'en ouvrant une carte. Sans clé ou si Google est
 * injoignable, la carte le dit plutôt que de rester vide.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { CleManquante, chargerGoogleMaps } from './googleMaps'
import { estSombre, styleCarte } from './styleCarte'
import type { Point } from './trajet'

/** Sans aucun point connu : le centre de Dakar, où sont la plupart des structures. */
const DAKAR = { lat: 14.6937, lng: -17.4441 }

export interface CarteProps {
  destination: Point | null
  position: Point | null
  /** Rayon de précision de la position, en mètres (cercle bleu pâle). */
  precision?: number
  trace?: [number, number][] | null
  /** Espace occupé en bas par la feuille d'informations, à laisser libre au cadrage. */
  margeBas?: number
}

export interface CarteHandle {
  /** Recadre sur l'itinéraire entier (ou les points connus). */
  recadrer: () => void
}

/** Une surcouche à retirer de la carte : polyligne, cercle, ou surcouche DOM. */
interface Retirable {
  setMap: (carte: google.maps.Map | null) => void
}

const Carte = forwardRef<CarteHandle, CarteProps>(function Carte(
  { destination, position, precision, trace, margeBas = 0 },
  ref,
) {
  const conteneur = useRef<HTMLDivElement>(null)
  const maps = useRef<typeof google.maps | null>(null)
  const carte = useRef<google.maps.Map | null>(null)
  const surcouches = useRef<Retirable[]>([])
  // Ce que le dernier cadrage automatique montrait : 1 point, 2 points, ou
  // l'itinéraire (3). La carte ne se recadre d'elle-même que lorsqu'elle en
  // apprend davantage ; le reste du temps, elle reste où l'employé l'a mise.
  const cadrage = useRef(0)
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState<'cle' | 'reseau' | null>(null)

  // La carte elle-même, créée une fois Google chargé.
  useEffect(() => {
    let vivant = true
    let observateur: MutationObserver | undefined
    chargerGoogleMaps()
      .then((api) => {
        if (!vivant || !conteneur.current) return
        maps.current = api
        const instance = new api.Map(conteneur.current, {
          center: DAKAR,
          zoom: 13,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          gestureHandling: 'greedy',
          styles: styleCarte(estSombre()),
        })
        carte.current = instance
        setPret(true)
        // Suivre le passage clair/sombre (classe sur <html>) pour restyler.
        observateur = new MutationObserver(() =>
          instance.setOptions({ styles: styleCarte(estSombre()) }),
        )
        observateur.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        })
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

  const cadrer = () => {
    const api = maps.current
    const instance = carte.current
    if (!api || !instance) return
    const points: google.maps.LatLngLiteral[] = trace?.length
      ? trace.map(([lat, lng]) => ({ lat, lng }))
      : [position, destination]
          .filter((p): p is Point => p !== null)
          .map((p) => ({ lat: p.latitude, lng: p.longitude }))
    const [seul] = points
    if (!seul) return
    if (points.length === 1) {
      instance.setCenter(seul)
      instance.setZoom(16)
      return
    }
    const bornes = new api.LatLngBounds()
    points.forEach((p) => bornes.extend(p))
    instance.fitBounds(bornes, { top: 110, left: 40, right: 40, bottom: margeBas + 40 })
  }

  useImperativeHandle(ref, () => ({ recadrer: cadrer }))

  // Les surcouches : redessinées à chaque changement de position ou de tracé.
  useEffect(() => {
    const api = maps.current
    const instance = carte.current
    if (!api || !instance) return
    for (const s of surcouches.current) s.setMap(null)
    surcouches.current = []
    const ajouter = (o: Retirable) => {
      o.setMap(instance)
      surcouches.current.push(o)
    }

    if (trace?.length) {
      const chemin = trace.map(([lat, lng]) => ({ lat, lng }))
      // Bordure blanche d'abord, trait rouge par-dessus : lisible sur tous les fonds.
      ajouter(
        new api.Polyline({
          path: chemin,
          strokeColor: '#ffffff',
          strokeOpacity: 0.9,
          strokeWeight: 10,
        }),
      )
      ajouter(
        new api.Polyline({
          path: chemin,
          strokeColor: '#1A73E8',
          strokeOpacity: 1,
          strokeWeight: 6,
        }),
      )
    }
    if (position) {
      const centre = { lat: position.latitude, lng: position.longitude }
      if (precision && precision < 2000) {
        ajouter(
          new api.Circle({
            center: centre,
            radius: precision,
            strokeWeight: 0,
            fillColor: '#2563eb',
            fillOpacity: 0.12,
            clickable: false,
          }),
        )
      }
      ajouter(surcoucheDom(api, centre, '<span></span>', 'itineraire__moi', { x: 11, y: 11 }))
    }
    if (destination) {
      ajouter(
        surcoucheDom(
          api,
          { lat: destination.latitude, lng: destination.longitude },
          '<span class="itineraire__epingle-tete"><span></span></span>',
          'itineraire__epingle',
          { x: 20, y: 48 },
        ),
      )
    }

    const connu = trace?.length ? 3 : Number(Boolean(position)) + Number(Boolean(destination))
    if (connu > cadrage.current) {
      cadrer()
      cadrage.current = connu
    }
    // cadrer lit les mêmes valeurs : inutile de la déclarer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pret,
    destination?.latitude,
    destination?.longitude,
    position?.latitude,
    position?.longitude,
    precision,
    trace,
  ])

  return (
    <div className="itineraire__gmap-hote">
      <div
        ref={conteneur}
        className="itineraire__gmap"
        aria-label="Carte de l’itinéraire"
        role="img"
      />
      {erreur && (
        <p className="itineraire__gmap-erreur">
          {erreur === 'cle'
            ? 'Carte indisponible : la clé Google Maps n’est pas encore configurée.'
            : 'Carte indisponible : Google Maps est injoignable pour l’instant.'}
        </p>
      )}
    </div>
  )
})

export default Carte

/**
 * Une surcouche DOM positionnée sur une coordonnée : un élément HTML (point
 * bleu, épingle) ancré au pixel voulu. `ancre` est le point de l'élément, en
 * pixels depuis son coin haut-gauche, qui doit tomber sur la coordonnée.
 */
function surcoucheDom(
  api: typeof google.maps,
  position: google.maps.LatLngLiteral,
  html: string,
  classe: string,
  ancre: { x: number; y: number },
): google.maps.OverlayView {
  const surcouche = new api.OverlayView()
  let element: HTMLDivElement | undefined
  surcouche.onAdd = () => {
    element = document.createElement('div')
    element.className = classe
    element.style.position = 'absolute'
    element.innerHTML = html
    surcouche.getPanes()?.overlayLayer.appendChild(element)
  }
  surcouche.draw = () => {
    const projection = surcouche.getProjection()
    if (!element || !projection) return
    const pixel = projection.fromLatLngToDivPixel(new api.LatLng(position))
    if (!pixel) return
    element.style.left = `${pixel.x - ancre.x}px`
    element.style.top = `${pixel.y - ancre.y}px`
  }
  surcouche.onRemove = () => {
    element?.remove()
    element = undefined
  }
  return surcouche
}

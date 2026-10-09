/**
 * La carte de l'écran d'itinéraire : Leaflet, sur les fonds d'OpenStreetMap.
 *
 * Pourquoi OpenStreetMap : ses fonds sont libres d'usage moyennant la mention
 * des sources, sans clé ni contrat. (Les fonds CARTO, plus sobres, exigent
 * désormais une clé : sans elle, ils s'affichent barrés d'un filigrane.) Ses
 * couleurs, vives, sont adoucies par CSS pour rester dans le ton de
 * l'application, et inversées en mode sombre (cf. itineraire.css). Pour un
 * usage en production à grande échelle, un fournisseur de fonds sous contrat
 * prendra le relais : il suffira de changer FOND.
 *
 * Chargée à la demande (React.lazy, cf. pages/Itineraire.tsx) : Leaflet pèse
 * près de 150 ko, que l'employé ne télécharge qu'en ouvrant une carte.
 *
 * Tout est dessiné pour ressembler aux cartes natives du téléphone : point
 * bleu pulsé et cercle de précision pour l'employé, épingle rouge SAR pour la
 * structure, tracé rouge bordé de blanc, aucune commande de zoom à l'écran
 * (le pincement suffit), et la mention des sources, obligatoire, en petit.
 */

import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import type { Point } from './trajet'

const FOND = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const SOURCES =
  '© <a href="https://www.openstreetmap.org/copyright">les contributeurs d’OpenStreetMap</a>'
/** Sans aucun point connu : le centre de Dakar, où sont la plupart des structures. */
const DAKAR: [number, number] = [14.6937, -17.4441]

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

const Carte = forwardRef<CarteHandle, CarteProps>(function Carte(
  { destination, position, precision, trace, margeBas = 0 },
  ref,
) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<L.Map | null>(null)
  const calques = useRef<L.LayerGroup | null>(null)
  // Ce que le dernier cadrage automatique montrait : 1 point, 2 points, ou
  // l'itinéraire (3). La carte ne se recadre d'elle-même que lorsqu'elle en
  // apprend davantage ; le reste du temps, elle reste où l'employé l'a mise —
  // jusqu'à ce qu'il touche « recentrer ».
  const cadrage = useRef(0)

  // La carte elle-même, créée une fois.
  useEffect(() => {
    if (!conteneur.current) return undefined
    const instance = L.map(conteneur.current, {
      zoomControl: false,
      attributionControl: false,
      center: DAKAR,
      zoom: 13,
    })
    L.tileLayer(FOND, { maxZoom: 19 }).addTo(instance)
    L.control
      .attribution({ position: 'topright', prefix: false })
      .addAttribution(SOURCES)
      .addTo(instance)
    calques.current = L.layerGroup().addTo(instance)
    carte.current = instance
    // Le conteneur prend sa taille après l'animation d'entrée d'Ionic.
    const minuteur = window.setTimeout(() => instance.invalidateSize(), 350)
    return () => {
      window.clearTimeout(minuteur)
      instance.remove()
      carte.current = null
    }
  }, [])

  const cadrer = () => {
    const instance = carte.current
    if (!instance) return
    const points: [number, number][] = trace?.length
      ? trace
      : [position, destination]
          .filter((p): p is Point => p !== null)
          .map((p) => [p.latitude, p.longitude])
    const [seul] = points
    if (!seul) return
    if (points.length === 1) {
      instance.setView(seul, 16, { animate: true })
      return
    }
    instance.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [40, 110],
      paddingBottomRight: [40, margeBas + 40],
      maxZoom: 17,
      animate: true,
    })
  }

  useImperativeHandle(ref, () => ({ recadrer: cadrer }))

  // Les calques : redessinés à chaque changement de position ou de tracé.
  useEffect(() => {
    const groupe = calques.current
    if (!groupe) return
    groupe.clearLayers()
    if (trace?.length) {
      // Bordure blanche d'abord, trait rouge par-dessus : lisible sur tous les fonds.
      L.polyline(trace, { color: '#ffffff', weight: 10, opacity: 0.9, lineCap: 'round' }).addTo(
        groupe,
      )
      L.polyline(trace, { color: '#E52621', weight: 6, opacity: 1, lineCap: 'round' }).addTo(groupe)
    }
    if (position) {
      if (precision && precision < 2000) {
        L.circle([position.latitude, position.longitude], {
          radius: precision,
          stroke: false,
          fillColor: '#2563eb',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(groupe)
      }
      L.marker([position.latitude, position.longitude], {
        icon: L.divIcon({
          className: 'itineraire__moi',
          html: '<span></span>',
          iconSize: [22, 22],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(groupe)
    }
    if (destination) {
      L.marker([destination.latitude, destination.longitude], {
        icon: L.divIcon({
          className: 'itineraire__epingle',
          html: '<span class="itineraire__epingle-tete"><span></span></span>',
          iconSize: [40, 50],
          iconAnchor: [20, 48],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(groupe)
    }
    const connu = trace?.length ? 3 : Number(Boolean(position)) + Number(Boolean(destination))
    if (connu > cadrage.current) {
      cadrer()
      cadrage.current = connu
    }
    // cadrer lit les mêmes valeurs : inutile de la déclarer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    destination?.latitude,
    destination?.longitude,
    position?.latitude,
    position?.longitude,
    precision,
    trace,
  ])

  return (
    <div
      ref={conteneur}
      className="itineraire__leaflet"
      aria-label="Carte de l’itinéraire"
      role="img"
    />
  )
})

export default Carte

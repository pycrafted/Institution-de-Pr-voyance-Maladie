/**
 * Le style ÉPURÉ des cartes Google de l'application (carte des structures,
 * carte de l'itinéraire). On y cherche une structure et le chemin pour s'y
 * rendre : rien d'autre.
 *
 * Masqué : commerces, restaurants, hôtels, lieux touristiques, transports en
 * commun, cartouches de numéros de route, parcelles. Gardé : les rues et leurs
 * noms (pour suivre le chemin), les quartiers (pour se repérer). Fond adouci,
 * pour que les points rouges des structures et la position de l'employé
 * ressortent. En sombre, la même épure sur une palette de nuit.
 */

/** Vrai si l'application est en mode sombre (classe posée sur <html>). */
export function estSombre(): boolean {
  return document.documentElement.classList.contains('ion-palette-dark')
}

/** Ce qui ne sert pas à trouver une structure ni à s'y rendre. */
const ALLEGEMENT: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.province',
    elementType: 'geometry',
    stylers: [{ visibility: 'off' }],
  },
]

const CLAIR: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f4f1ef' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6461' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e6dedb' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fbe9df' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#efcdbd' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#8f8784' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe2ea' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7d9aa6' }] },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9a918d' }],
  },
]

const SOMBRE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#242220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a3a099' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111110' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e2b28' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1c1a18' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3733' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14181f' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1c1a18' }] },
]

export function styleCarte(sombre: boolean): google.maps.MapTypeStyle[] {
  return [...(sombre ? SOMBRE : CLAIR), ...ALLEGEMENT]
}

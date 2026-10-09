/**
 * Visionneuse du PDF officiel (pdfjs-dist, rendu sur canvas) : page 1 =
 * Original, page 2 = Copie, pagination par balayage, pincement pour zoomer
 * (la seule zone de l'application où le zoom est permis).
 *
 * Choix de réalisation :
 *  - Les pages sont côte à côte dans une piste à défilement horizontal
 *    « aimanté » (scroll-snap) : le balayage est celui du navigateur, avec
 *    son inertie native, et non une imitation en JavaScript.
 *  - Chaque page est rendue à la densité de l'écran (devicePixelRatio), puis
 *    re-rendue plus finement quand on zoome, pour rester nette ; la taille
 *    du canvas est plafonnée (Safari dessine blanc au-delà de 16 Mpx).
 *  - Le nouveau rendu se fait dans un canvas hors écran, échangé une fois
 *    prêt : jamais de page blanche le temps du rendu.
 *  - Le zoom (pincement, double tapotement, déplacement) est une
 *    transformation CSS calculée par pages/bons/zoom.ts.
 */

import { IonIcon, IonSpinner } from '@ionic/react'
import { alertCircleOutline } from 'ionicons/icons'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { haptique } from '../hooks/haptique'
import PucesFiltre from './PucesFiltre'
import { ouvrirPdf, type DocumentPdf, type PagePdf } from '../pages/bons/pdfjs'
import {
  basculerZoom,
  contraindre,
  distance,
  echelleElastique,
  facteurRendu,
  IDENTITE,
  milieu,
  zoomerAutour,
  type Point,
  type Transformation,
} from '../pages/bons/zoom'
import './PdfViewer.css'

export interface PdfViewerProps {
  /** Le PDF (téléchargé par telechargerPdfBon ou lu dans le cache). */
  pdf: Blob
  /** Libellés des pages, ex. ['Original', 'Copie']. */
  libellesPages?: string[]
  /** Nom du document pour les lecteurs d'écran, ex. « Bon de pharmacie BPI000123 ». */
  titre?: string
}

/** Rapport hauteur / largeur d'une page A4 portrait, en attendant la vraie. */
const RAPPORT_A4 = 842 / 595
/** Largeur supposée quand l'élément n'est pas encore mesurable (tests, premier rendu). */
const LARGEUR_PAR_DEFAUT = 360

interface InfoPage {
  page: PagePdf
  /** hauteur / largeur */
  rapport: number
}

type Etat = { phase: 'chargement' } | { phase: 'erreur' } | { phase: 'pret'; pages: InfoPage[] }

export default function PdfViewer({
  pdf,
  libellesPages = [],
  titre = 'Document PDF',
}: PdfViewerProps) {
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' })
  const [pageActive, setPageActive] = useState(0)
  const [zoome, setZoome] = useState(false)
  const piste = useRef<HTMLDivElement>(null)
  const largeur = useLargeur(piste)

  // Ouverture du document ; fermé (worker libéré) quand le PDF change ou
  // que l'écran est quitté.
  useEffect(() => {
    let actif = true
    let fermer: (() => void) | null = null
    setEtat({ phase: 'chargement' })
    setPageActive(0)
    void (async () => {
      try {
        const ouvert = await ouvrirPdf(pdf)
        fermer = ouvert.fermer
        if (!actif) {
          ouvert.fermer()
          return
        }
        const pages = await lirePages(ouvert.document)
        if (actif) setEtat({ phase: 'pret', pages })
      } catch {
        // PDF illisible ou pdf.js non chargé (hors ligne avant sa mise en
        // cache) : l'écran propose l'ouverture par le partage/téléchargement.
        if (actif) setEtat({ phase: 'erreur' })
      }
    })()
    return () => {
      actif = false
      fermer?.()
    }
  }, [pdf])

  const allerA = useCallback((index: number) => {
    const element = piste.current
    if (!element) return
    setPageActive(index)
    const gauche = index * element.clientWidth
    if (typeof element.scrollTo === 'function')
      element.scrollTo({ left: gauche, behavior: 'smooth' })
    else element.scrollLeft = gauche
  }, [])

  const surDefilement = useCallback(() => {
    const element = piste.current
    if (!element || element.clientWidth === 0) return
    const index = Math.round(element.scrollLeft / element.clientWidth)
    setPageActive((precedente) => {
      if (precedente !== index) haptique.selection()
      return index
    })
  }, [])

  const pages = etat.phase === 'pret' ? etat.pages : []
  const libelle = (i: number) => libellesPages[i] ?? `Page ${i + 1}`
  const rapportAttente = pages[0]?.rapport ?? RAPPORT_A4
  // Sélecteur de page en puces pilules (SPEC_DESIGN §3.6) : l'ion-segment
  // rectangulaire à barres de séparation est interdit par §1.
  const pucesPages = pages.map((_, i) => ({ cle: String(i), libelle: libelle(i) }))

  if (etat.phase === 'erreur') {
    return (
      <div className="pdf-visionneuse pdf-visionneuse--erreur" role="alert">
        <IonIcon icon={alertCircleOutline} aria-hidden="true" />
        <p>
          L’aperçu du bon ne peut pas s’afficher sur ce téléphone. Utilisez « Partager » pour
          l’ouvrir.
        </p>
      </div>
    )
  }

  return (
    <div
      className="pdf-visionneuse"
      role="group"
      aria-roledescription="visionneuse"
      aria-label={titre}
    >
      <div
        ref={piste}
        className={`pdf-visionneuse__piste${zoome ? ' pdf-visionneuse__piste--zoome' : ''}`}
        onScroll={surDefilement}
      >
        {etat.phase === 'chargement' ? (
          <div className="pdf-visionneuse__page">
            <div
              className="pdf-visionneuse__cadre pdf-visionneuse__cadre--attente"
              style={{ height: Math.round(largeur * rapportAttente) }}
              aria-busy="true"
            >
              <IonSpinner name="crescent" aria-label="Préparation de l'aperçu" />
            </div>
          </div>
        ) : (
          pages.map((info, i) => (
            <div className="pdf-visionneuse__page" key={i}>
              <PageZoomable
                info={info}
                largeur={largeur}
                active={i === pageActive}
                libelle={`${titre}, ${libelle(i)} (page ${i + 1} sur ${pages.length})`}
                onZoom={setZoome}
              />
            </div>
          ))
        )}
      </div>

      {pages.length > 1 && (
        <PucesFiltre
          className="pdf-visionneuse__pages"
          puces={pucesPages}
          active={String(pageActive)}
          etiquette={`Pages de ${titre}`}
          onChanger={(cle) => {
            const index = Number(cle)
            if (Number.isInteger(index) && index !== pageActive) allerA(index)
          }}
        />
      )}
      {etat.phase === 'pret' && (
        <p className="pdf-visionneuse__aide">
          {pages.length > 1 ? 'Balayez pour changer de page · ' : ''}Pincez pour zoomer
        </p>
      )}
    </div>
  )
}

async function lirePages(document: DocumentPdf): Promise<InfoPage[]> {
  const pages: InfoPage[] = []
  for (let n = 1; n <= document.numPages; n += 1) {
    const page = await document.getPage(n)
    const vue = page.getViewport({ scale: 1 })
    pages.push({ page, rapport: vue.width > 0 ? vue.height / vue.width : RAPPORT_A4 })
  }
  return pages
}

/** Largeur (px CSS) de l'élément, suivie au redimensionnement (rotation, clavier…). */
function useLargeur(ref: RefObject<HTMLElement | null>): number {
  const [largeur, setLargeur] = useState(LARGEUR_PAR_DEFAUT)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const mesurer = () => {
      const l = element.clientWidth
      if (l > 0) setLargeur(l)
    }
    mesurer()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', mesurer)
      return () => window.removeEventListener('resize', mesurer)
    }
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [ref])
  return largeur
}

/** Paliers de netteté : on ne re-rend pas à chaque pincement, seulement par palier. */
function palier(echelle: number): number {
  return echelle <= 1.05 ? 1 : Math.min(4, Math.ceil(echelle))
}

interface PropsPage {
  info: InfoPage
  largeur: number
  active: boolean
  libelle: string
  onZoom: (zoome: boolean) => void
}

type Geste =
  | { type: 'pincement'; distance0: number; centre0: Point; t0: Transformation }
  | { type: 'deplacement'; point0: Point; t0: Transformation }
  | null

/** Une page : rendu net sur canvas + gestes de zoom. */
function PageZoomable({ info, largeur, active, libelle, onZoom }: PropsPage) {
  const cadre = useRef<HTMLDivElement>(null)
  const contenu = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const transformation = useRef<Transformation>(IDENTITE)
  const [qualite, setQualite] = useState(1)
  const [rendue, setRendue] = useState(false)
  const hauteur = Math.round(largeur * info.rapport)

  // --- Rendu ------------------------------------------------------------
  useEffect(() => {
    const cible = surface.current
    if (!cible || largeur <= 0) return
    const base = info.page.getViewport({ scale: 1 })
    const densite = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1
    const facteur = facteurRendu(largeur, info.rapport, densite, qualite)
    const viewport = info.page.getViewport({ scale: (largeur / base.width) * facteur })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.className = 'pdf-visionneuse__canvas'
    canvas.setAttribute('aria-hidden', 'true')
    const tache = info.page.render({ canvas, viewport })
    let actif = true
    tache.promise.then(
      () => {
        if (!actif) return
        const ancien = cible.querySelector('canvas')
        cible.replaceChildren(canvas)
        liberer(ancien)
        setRendue(true)
      },
      () => {
        // Rendu annulé (nouveau palier, écran quitté) ou échoué : on garde
        // le rendu précédent s'il existe.
        liberer(canvas)
      },
    )
    return () => {
      actif = false
      tache.cancel()
    }
  }, [info, largeur, qualite])

  // --- Zoom ------------------------------------------------------------
  const appliquer = useCallback((t: Transformation, anime: boolean) => {
    transformation.current = t
    const element = contenu.current
    if (element) {
      element.style.transition = anime ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
      element.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.echelle})`
    }
    const enZoom = t.echelle > 1.001
    if (cadre.current) cadre.current.dataset.zoome = enZoom ? 'oui' : 'non'
  }, [])

  const terminer = useCallback(
    (t: Transformation) => {
      const finale = contraindre(t, largeur, hauteur)
      appliquer(finale, true)
      onZoom(finale.echelle > 1)
      setQualite(palier(finale.echelle))
    },
    [appliquer, hauteur, largeur, onZoom],
  )

  // Une page qu'on quitte (balayage vers la copie) revient à sa taille.
  useEffect(() => {
    if (!active && transformation.current.echelle !== 1) {
      appliquer(IDENTITE, false)
      setQualite(1)
    }
  }, [active, appliquer])

  // Nouvelle largeur (rotation) : la transformation n'a plus de sens.
  useEffect(() => {
    appliquer(IDENTITE, false)
    onZoom(false)
    setQualite(1)
  }, [largeur, appliquer, onZoom])

  useEffect(() => {
    const element = cadre.current
    if (!element) return
    let geste: Geste = null
    let dernierTap: { temps: number; point: Point } | null = null
    let depart: { temps: number; point: Point; bouge: boolean } | null = null

    const local = (touche: Touch): Point => {
      const rect = element.getBoundingClientRect()
      return { x: touche.clientX - rect.left, y: touche.clientY - rect.top }
    }

    const commencerDeplacement = (touche: Touch) => {
      geste = { type: 'deplacement', point0: local(touche), t0: transformation.current }
    }

    const debut = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]]
      if (a && b) {
        geste = {
          type: 'pincement',
          distance0: Math.max(1, distance(local(a), local(b))),
          centre0: milieu(local(a), local(b)),
          t0: transformation.current,
        }
        depart = null
        e.preventDefault()
        return
      }
      if (a) {
        depart = { temps: e.timeStamp, point: local(a), bouge: false }
        // Page entière : un doigt seul appartient au balayage natif.
        if (transformation.current.echelle > 1) commencerDeplacement(a)
      }
    }

    const mouvement = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]]
      if (depart && a) {
        const p = local(a)
        if (Math.abs(p.x - depart.point.x) > 10 || Math.abs(p.y - depart.point.y) > 10)
          depart.bouge = true
      }
      if (geste?.type === 'pincement' && a && b) {
        e.preventDefault()
        const pa = local(a)
        const pb = local(b)
        const echelle = echelleElastique((geste.t0.echelle * distance(pa, pb)) / geste.distance0)
        const zoomee = zoomerAutour(geste.t0, echelle, geste.centre0)
        const centre = milieu(pa, pb)
        appliquer(
          {
            ...zoomee,
            x: zoomee.x + centre.x - geste.centre0.x,
            y: zoomee.y + centre.y - geste.centre0.y,
          },
          false,
        )
      } else if (geste?.type === 'deplacement' && a) {
        e.preventDefault()
        const p = local(a)
        appliquer(
          {
            ...geste.t0,
            x: geste.t0.x + p.x - geste.point0.x,
            y: geste.t0.y + p.y - geste.point0.y,
          },
          false,
        )
      }
    }

    const fin = (e: TouchEvent) => {
      // Double tapotement : deux touchers brefs et immobiles au même endroit.
      if (depart && !depart.bouge && e.touches.length === 0 && e.timeStamp - depart.temps < 300) {
        const point = depart.point
        if (
          dernierTap &&
          e.timeStamp - dernierTap.temps < 320 &&
          distance(point, dernierTap.point) < 40
        ) {
          e.preventDefault()
          dernierTap = null
          depart = null
          geste = null
          haptique.leger()
          terminer(basculerZoom(transformation.current, point, largeur, hauteur))
          return
        }
        dernierTap = { temps: e.timeStamp, point }
      }
      depart = null
      if (!geste) return
      const restant = e.touches[0]
      if (geste.type === 'pincement' && restant && transformation.current.echelle > 1) {
        // Un doigt levé sur deux : on continue en déplaçant la page.
        commencerDeplacement(restant)
        return
      }
      if (e.touches.length === 0 || geste.type === 'pincement') {
        geste = null
        terminer(transformation.current)
      }
    }

    // Safari iOS : sans cela, le pincement zoomerait toute la page.
    const bloquerGesteSafari = (e: Event) => e.preventDefault()

    element.addEventListener('touchstart', debut, { passive: false })
    element.addEventListener('touchmove', mouvement, { passive: false })
    element.addEventListener('touchend', fin, { passive: false })
    element.addEventListener('touchcancel', fin, { passive: false })
    element.addEventListener('gesturestart', bloquerGesteSafari)
    return () => {
      element.removeEventListener('touchstart', debut)
      element.removeEventListener('touchmove', mouvement)
      element.removeEventListener('touchend', fin)
      element.removeEventListener('touchcancel', fin)
      element.removeEventListener('gesturestart', bloquerGesteSafari)
    }
  }, [appliquer, terminer, largeur, hauteur])

  return (
    <div
      ref={cadre}
      className="pdf-visionneuse__cadre"
      style={{ height: hauteur }}
      data-zoome="non"
      role="img"
      aria-label={libelle}
    >
      <div ref={contenu} className="pdf-visionneuse__contenu">
        <div ref={surface} className="pdf-visionneuse__surface" />
        {!rendue && (
          <div className="pdf-visionneuse__rendu-attente">
            <IonSpinner name="crescent" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}

/** Safari garde la mémoire d'un canvas détaché tant qu'il a une taille. */
function liberer(canvas: HTMLCanvasElement | null) {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

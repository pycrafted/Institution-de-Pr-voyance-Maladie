/**
 * Écran « Scan » (/scan) : un vrai scanner dans l'app.
 *
 *   - EN HAUT : le viseur de la caméra EN DIRECT (flux `getUserMedia`, caméra
 *     arrière), affiché dans l'app - pas l'appli photo du téléphone par-dessus.
 *     On cadre le document, on touche le déclencheur.
 *   - EN BAS : ce que l'IA comprend du document capturé (type, date,
 *     prestataire, montant, éléments).
 *
 * La caméra en direct exige un contexte sécurisé (HTTPS) : c'est le cas sur le
 * déploiement (Vercel), pas sur un test en http. Quand elle n'est pas
 * disponible (refus, vieux navigateur, http), on retombe sur la prise de photo
 * classique (`input capture`) et l'import d'image - l'IA reçoit la même chose.
 *
 * Rien n'est enregistré, aucun versement n'est déclenché : seulement scan +
 * reconnaissance. L'image part à NOTRE serveur, qui appelle l'IA avec sa clé ;
 * le téléphone ne voit jamais la clé (cf. backend/apps/mobile/scan.py).
 */

import {
  IonContent,
  IonIcon,
  IonPage,
  IonSpinner,
  useIonToast,
  useIonViewWillEnter,
  useIonViewWillLeave,
} from '@ionic/react'
import {
  alertCircleOutline,
  calendarOutline,
  cameraOutline,
  cashOutline,
  checkmarkCircleOutline,
  imageOutline,
  medkitOutline,
  personOutline,
  scanOutline,
  storefrontOutline,
  warningOutline,
} from 'ionicons/icons'
import { useCallback, useRef, useState, type ChangeEvent } from 'react'

import { messageErreur } from '../api'
import { reconnaitreDocument } from '../api/mobile'
import { BoutonPrincipal } from '../components/Boutons'
import { haptique } from '../hooks/haptique'
import type { DocumentReconnu } from '../types/api'
import { dateMoyenne, montant } from '../utils/format'
import { ErreurPhoto, capturerVideoDocument, reduireDocument } from '../utils/photo'
import './scan/scan.css'

type Etat = 'repos' | 'analyse' | 'resultat'
type Camera = 'demarrage' | 'active' | 'indisponible'

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fluxRef = useRef<MediaStream | null>(null)
  // Replis quand la caméra live n'est pas disponible : appli photo et galerie.
  const champCamera = useRef<HTMLInputElement>(null)
  const champGalerie = useRef<HTMLInputElement>(null)

  const [camera, setCamera] = useState<Camera>('demarrage')
  const [etat, setEtat] = useState<Etat>('repos')
  const [apercu, setApercu] = useState<string | null>(null)
  const [resultat, setResultat] = useState<DocumentReconnu | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [presenterToast] = useIonToast()

  const arreterCamera = useCallback(() => {
    fluxRef.current?.getTracks().forEach((piste) => piste.stop())
    fluxRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const demarrerCamera = useCallback(async () => {
    // Hors contexte sécurisé (http), l'API n'existe pas : repli direct.
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('indisponible')
      return
    }
    setCamera('demarrage')
    try {
      const flux = await navigator.mediaDevices.getUserMedia({
        // Caméra arrière de préférence, sans son.
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      fluxRef.current = flux
      if (videoRef.current) {
        videoRef.current.srcObject = flux
        await videoRef.current.play().catch(() => {})
      }
      setCamera('active')
    } catch {
      // Refus de permission, aucune caméra, ou navigateur trop ancien.
      arreterCamera()
      setCamera('indisponible')
    }
  }, [arreterCamera])

  // La caméra vit avec l'écran : on l'ouvre en entrant, on la libère en
  // sortant (sans quoi le voyant resterait allumé sur d'autres onglets).
  useIonViewWillEnter(() => {
    if (etat === 'repos') void demarrerCamera()
  })
  useIonViewWillLeave(() => {
    arreterCamera()
  })

  /** Déclencheur : fige l'image du viseur et l'envoie à l'IA. */
  async function declencher() {
    const video = videoRef.current
    if (!video) return
    let image: string
    try {
      image = capturerVideoDocument(video)
    } catch (e) {
      haptique.erreur()
      void presenterToast({
        message: e instanceof ErreurPhoto ? e.message : 'Capture impossible.',
        duration: 2400,
        position: 'top',
        icon: warningOutline,
      })
      return
    }
    haptique.leger()
    arreterCamera()
    await analyser(image)
  }

  function ouvrirAppliPhoto() {
    haptique.leger()
    champCamera.current?.click()
  }

  function importer() {
    haptique.leger()
    champGalerie.current?.click()
  }

  async function surFichier(evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0]
    // Vider la valeur : rechoisir le même fichier redéclenche l'événement.
    evenement.target.value = ''
    if (!fichier) return
    let image: string
    try {
      image = await reduireDocument(fichier)
    } catch (e) {
      haptique.erreur()
      void presenterToast({
        message: e instanceof ErreurPhoto ? e.message : 'Image illisible.',
        duration: 2600,
        position: 'top',
        icon: warningOutline,
      })
      return
    }
    arreterCamera()
    await analyser(image)
  }

  /** Envoie l'image à l'IA et bascule en bas sur le résultat. */
  async function analyser(image: string) {
    setApercu(image)
    setResultat(null)
    setErreur(null)
    setEtat('analyse')
    try {
      const reconnu = await reconnaitreDocument(image)
      setResultat(reconnu)
      haptique.succes()
    } catch (e) {
      setErreur(messageErreur(e))
      haptique.erreur()
    } finally {
      setEtat('resultat')
    }
  }

  /** « Scanner un autre » : on efface le résultat et on rouvre le viseur. */
  function recommencer() {
    haptique.leger()
    setApercu(null)
    setResultat(null)
    setErreur(null)
    setEtat('repos')
    void demarrerCamera()
  }

  return (
    <IonPage className="scan">
      <IonContent fullscreen>
        <div className="ipm-zone-sure" />

        <input
          ref={champCamera}
          type="file"
          accept="image/*"
          capture="environment"
          className="scan__fichier"
          onChange={surFichier}
        />
        <input
          ref={champGalerie}
          type="file"
          accept="image/*"
          className="scan__fichier"
          onChange={surFichier}
        />

        {/* ---------- HAUT : viseur caméra (ou image figée) ---------- */}
        <div className="scan__viseur">
          {etat === 'repos' && camera !== 'indisponible' && (
            <>
              <video
                ref={videoRef}
                className="scan__video"
                autoPlay
                playsInline
                muted
                aria-label="Viseur de la caméra"
              />
              {/* Cadre repère pour poser le document. */}
              <div className="scan__cadre" aria-hidden="true">
                <span className="scan__coin scan__coin--hg" />
                <span className="scan__coin scan__coin--hd" />
                <span className="scan__coin scan__coin--bg" />
                <span className="scan__coin scan__coin--bd" />
              </div>
              {camera === 'demarrage' && (
                <div className="scan__voile" aria-live="polite">
                  <IonSpinner name="crescent" />
                  <span>Ouverture de la caméra…</span>
                </div>
              )}
              {camera === 'active' && (
                <button
                  type="button"
                  className="scan__declencheur"
                  onClick={declencher}
                  aria-label="Prendre la photo du document"
                >
                  <IonIcon icon={cameraOutline} aria-hidden="true" />
                </button>
              )}
            </>
          )}

          {/* Caméra indisponible (http, refus, vieux navigateur) : repli. */}
          {etat === 'repos' && camera === 'indisponible' && (
            <div className="scan__repli">
              <span className="scan__repli-icone" aria-hidden="true">
                <IonIcon icon={scanOutline} />
              </span>
              <p className="scan__repli-texte">
                Cadrez une ordonnance, un reçu ou une facture : l’IA en reconnaît le type et les
                informations.
              </p>
              <BoutonPrincipal icone={cameraOutline} onClick={ouvrirAppliPhoto}>
                Prendre une photo
              </BoutonPrincipal>
            </div>
          )}

          {/* Analyse / résultat : l'image figée qu'on vient d'envoyer. */}
          {etat !== 'repos' && apercu && (
            <>
              <img className="scan__capture" src={apercu} alt="Document capturé" />
              {etat === 'analyse' && (
                <div className="scan__voile" aria-live="polite">
                  <IonSpinner name="crescent" />
                  <span>Lecture du document…</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------- BAS : consigne, puis résultat de l'IA ---------- */}
        <section className="ipm-section scan__contenu">
          {etat === 'repos' && (
            <p className="scan__consigne">
              {camera === 'active'
                ? 'Placez le document dans le cadre, puis touchez le déclencheur.'
                : camera === 'demarrage'
                  ? 'Préparation de la caméra…'
                  : 'Caméra indisponible ici : prenez une photo ou importez une image.'}
            </p>
          )}

          {etat === 'resultat' && erreur && (
            <div className="scan__erreur" role="alert">
              <IonIcon icon={alertCircleOutline} aria-hidden="true" />
              <span>{erreur}</span>
            </div>
          )}

          {etat === 'resultat' && resultat && <Resultat document={resultat} />}

          {etat === 'resultat' && (
            <div className="scan__actions">
              <BoutonPrincipal icone={cameraOutline} onClick={recommencer}>
                Scanner un autre
              </BoutonPrincipal>
              <button type="button" className="scan__lien-galerie" onClick={importer}>
                <IonIcon icon={imageOutline} aria-hidden="true" />
                Importer une image
              </button>
            </div>
          )}

          {/* En veille, l'import reste accessible sous la consigne. */}
          {etat === 'repos' && (
            <button type="button" className="scan__lien-galerie" onClick={importer}>
              <IonIcon icon={imageOutline} aria-hidden="true" />
              Importer une image
            </button>
          )}
        </section>

        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

/** Ce que l'IA a compris du document, mis en forme. */
function Resultat({ document }: { document: DocumentReconnu }) {
  const dateTexte = document.date
    ? `${dateMoyenne(document.date)}${
        document.ageJours != null
          ? ` · il y a ${document.ageJours} ${document.ageJours > 1 ? 'jours' : 'jour'}`
          : ''
      }`
    : null
  const champs = [
    { icone: cashOutline, libelle: 'Montant', valeur: document.montantTotal != null ? montant(document.montantTotal) : null },
    { icone: storefrontOutline, libelle: 'Prestataire', valeur: document.prestataire },
    { icone: personOutline, libelle: 'Patient', valeur: document.patient },
    { icone: calendarOutline, libelle: 'Date', valeur: dateTexte },
  ].filter((c) => c.valeur)

  return (
    <div className="scan__resultat">
      {/* Verdict en vedette : récente + fiable, ou ce qui cloche. Rien pour un
          document qui n'est pas une ordonnance. */}
      {document.verdict !== 'autre' && (
        <div className={`scan__verdict scan__verdict--${document.verdict}`} role="status">
          <IonIcon
            icon={document.verdict === 'ok' ? checkmarkCircleOutline : warningOutline}
            aria-hidden="true"
          />
          <span>{document.verdictMessage}</span>
        </div>
      )}

      <div className="scan__type">
        <span className="scan__type-pastille" aria-hidden="true">
          <IonIcon icon={medkitOutline} />
        </span>
        <div>
          <p className="scan__type-libelle">{document.typeLibelle || 'Document'}</p>
          {document.resume && <p className="scan__resume">{document.resume}</p>}
        </div>
      </div>

      {document.alertes.length > 0 && (
        <ul className="scan__alertes">
          {document.alertes.map((alerte, i) => (
            <li key={`${alerte}-${i}`}>
              <IonIcon icon={alertCircleOutline} aria-hidden="true" />
              <span>{alerte}</span>
            </li>
          ))}
        </ul>
      )}

      {champs.length > 0 && (
        <dl className="scan__champs">
          {champs.map((c) => (
            <div key={c.libelle} className="scan__champ">
              <dt>
                <IonIcon icon={c.icone} aria-hidden="true" /> {c.libelle}
              </dt>
              <dd>{c.valeur}</dd>
            </div>
          ))}
        </dl>
      )}

      {document.elements.length > 0 && (
        <div className="scan__elements">
          <h2 className="scan__elements-titre">
            {document.type === 'ordonnance' ? 'Médicaments' : 'Détail'}
          </h2>
          <ul>
            {document.elements.map((el, i) => (
              <li key={`${el.libelle}-${i}`} className="scan__element">
                <span className="scan__element-libelle">
                  {el.libelle}
                  {el.quantite ? ` · ${el.quantite}` : ''}
                </span>
                {el.montant != null && (
                  <span className="scan__element-montant">{montant(el.montant)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

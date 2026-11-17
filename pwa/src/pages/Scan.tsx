/**
 * Écran « Scan » (/scan) : le pré-financement par l'IA.
 *
 * Quand l'ayant droit est en zone non desservie (aucune structure
 * conventionnée) ou hors horaires (nuit, week-end), l'IA prend le relais :
 * elle lit l'ordonnance, décide si elle est valide, et débloque le
 * pré-financement sur le wallet Orange Money de l'agent.
 *
 * Étapes (pour l'instant : seulement l'ACHAT EN PHARMACIE / ordonnance) :
 *   1. choix    - de quoi s'agit-il ? (pharmacie, consultation, hôpital…)
 *   2. scan     - viseur caméra en direct, on photographie l'ordonnance
 *   3. analyse  - l'IA lit le document (backend → Anthropic)
 *   4. résultat - valide (ordonnance récente + fiable) ou non
 *   5. montant  - l'agent saisit le prix de l'ordonnance
 *   6. succès   - animation + « pré-financement envoyé sur votre OM »,
 *                 puis invitation à scanner la facture sous 5 jours
 *
 * Le versement est SIMULÉ pour l'instant (aucun vrai virement Orange Money :
 * pas d'intégration de paiement). Le décompte des 5 jours, la défalcation sur
 * salaire et la suspension pour fraude viendront dans un module backend dédié.
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
  bedOutline,
  calendarOutline,
  cameraOutline,
  cashOutline,
  checkmarkCircleOutline,
  checkmarkOutline,
  chevronForwardOutline,
  imageOutline,
  medkitOutline,
  personOutline,
  pulseOutline,
  storefrontOutline,
  warningOutline,
} from 'ionicons/icons'
import { useCallback, useRef, useState, type ChangeEvent } from 'react'

import { messageErreur } from '../api'
import { reconnaitreDocument } from '../api/mobile'
import { BoutonPrincipal } from '../components/Boutons'
import { haptique } from '../hooks/haptique'
import { useParticipant } from '../session'
import type { DocumentReconnu } from '../types/api'
import { dateMoyenne, montant } from '../utils/format'
import { ErreurPhoto, capturerVideoDocument, reduireDocument } from '../utils/photo'
import './scan/scan.css'

/** Les étapes du parcours (une seule à l'écran à la fois). */
type Etape = 'choix' | 'scan' | 'analyse' | 'invalide' | 'montant' | 'succes'
type Camera = 'demarrage' | 'active' | 'indisponible'

/** Les motifs de recours au pré-financement. Seul l'achat pharmacie est ouvert. */
const MOTIFS = [
  { cle: 'pharmacie', libelle: 'Achat en pharmacie', detail: 'Ordonnance', icone: medkitOutline, ouvert: true },
  { cle: 'consultation', libelle: 'Consultation', detail: 'Chez un médecin', icone: pulseOutline, ouvert: false },
  { cle: 'hopital', libelle: 'Hôpital', detail: 'Avec consultation', icone: storefrontOutline, ouvert: false },
  { cle: 'hopital-hors', libelle: 'Hôpital', detail: 'Hors consultation', icone: bedOutline, ouvert: false },
] as const

export default function Scan() {
  const { participant } = useParticipant()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fluxRef = useRef<MediaStream | null>(null)
  const champCamera = useRef<HTMLInputElement>(null)
  const champGalerie = useRef<HTMLInputElement>(null)

  const [etape, setEtape] = useState<Etape>('choix')
  const [camera, setCamera] = useState<Camera>('demarrage')
  const [apercu, setApercu] = useState<string | null>(null)
  const [resultat, setResultat] = useState<DocumentReconnu | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Montant saisi (en chiffres), et versement effectué (pour le message succès).
  const [prix, setPrix] = useState('')
  const [verse, setVerse] = useState<number | null>(null)
  const [presenterToast] = useIonToast()

  const telephone = participant.telephone || 'votre numéro'

  const arreterCamera = useCallback(() => {
    fluxRef.current?.getTracks().forEach((piste) => piste.stop())
    fluxRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const demarrerCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('indisponible')
      return
    }
    setCamera('demarrage')
    try {
      const flux = await navigator.mediaDevices.getUserMedia({
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
      arreterCamera()
      setCamera('indisponible')
    }
  }, [arreterCamera])

  // On libère la caméra dès qu'on quitte l'onglet, et on la rouvre au retour si
  // on était en train de scanner.
  useIonViewWillLeave(() => arreterCamera())
  useIonViewWillEnter(() => {
    if (etape === 'scan') void demarrerCamera()
  })

  /** Passe à l'étape de scan de l'ordonnance et ouvre la caméra. */
  function allerAuScan() {
    haptique.leger()
    setApercu(null)
    setResultat(null)
    setErreur(null)
    setEtape('scan')
    void demarrerCamera()
  }

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

  function importer() {
    haptique.leger()
    champGalerie.current?.click()
  }
  function ouvrirAppliPhoto() {
    haptique.leger()
    champCamera.current?.click()
  }

  async function surFichier(evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0]
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

  /** Envoie l'image à l'IA, puis oriente vers « montant » (valide) ou « invalide ». */
  async function analyser(image: string) {
    setApercu(image)
    setResultat(null)
    setErreur(null)
    setEtape('analyse')
    try {
      const reconnu = await reconnaitreDocument(image)
      setResultat(reconnu)
      // Valide = ordonnance récente et fiable (verdict « ok » du backend).
      if (reconnu.verdict === 'ok') {
        haptique.succes()
        setEtape('montant')
      } else {
        haptique.erreur()
        setEtape('invalide')
      }
    } catch (e) {
      setErreur(messageErreur(e))
      haptique.erreur()
      setEtape('invalide')
    }
  }

  /** Confirme le montant : simule le versement puis affiche le succès. */
  function envoyer() {
    const valeur = Number(prix.replace(/\D/g, '') || 0)
    if (valeur <= 0) {
      void presenterToast({
        message: 'Indiquez le montant de l’ordonnance.',
        duration: 2200,
        position: 'top',
        icon: warningOutline,
      })
      return
    }
    haptique.succes()
    setVerse(valeur)
    setEtape('succes')
  }

  /** Repart du début (nouveau scan). */
  function recommencer() {
    haptique.leger()
    setApercu(null)
    setResultat(null)
    setErreur(null)
    setPrix('')
    setVerse(null)
    setEtape('choix')
  }

  return (
    <IonPage className="scan">
      <IonContent fullscreen>
        <div className="ipm-zone-sure" />

        <input ref={champCamera} type="file" accept="image/*" capture="environment" className="scan__fichier" onChange={surFichier} />
        <input ref={champGalerie} type="file" accept="image/*" className="scan__fichier" onChange={surFichier} />

        {/* 1. CHOIX du motif -------------------------------------------- */}
        {etape === 'choix' && (
          <section className="ipm-section scan__choix">
            <h1 className="scan__titre">Pré-financement</h1>
            <p className="scan__sous-titre">
              Pas de structure conventionnée à proximité, ou hors horaires ? L’IA lit votre
              document et débloque l’avance. De quoi s’agit-il ?
            </p>
            <div className="scan__motifs">
              {MOTIFS.map((motif) => (
                <button
                  key={motif.cle}
                  type="button"
                  className={`scan__motif${motif.ouvert ? '' : ' scan__motif--bientot'}`}
                  onClick={motif.ouvert ? allerAuScan : undefined}
                  aria-disabled={motif.ouvert ? undefined : true}
                >
                  <span className="scan__motif-icone" aria-hidden="true">
                    <IonIcon icon={motif.icone} />
                  </span>
                  <span className="scan__motif-texte">
                    <span className="scan__motif-libelle">{motif.libelle}</span>
                    <span className="scan__motif-detail">{motif.detail}</span>
                  </span>
                  {motif.ouvert ? (
                    <IonIcon className="scan__motif-fleche" icon={chevronForwardOutline} aria-hidden="true" />
                  ) : (
                    <span className="scan__motif-puce">Bientôt</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 2-3. SCAN + ANALYSE : viseur en haut ------------------------- */}
        {(etape === 'scan' || etape === 'analyse') && (
          <div className="scan__viseur">
            {etape === 'scan' && camera !== 'indisponible' && (
              <>
                <video ref={videoRef} className="scan__video" autoPlay playsInline muted aria-label="Viseur de la caméra" />
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
                  <button type="button" className="scan__declencheur" onClick={declencher} aria-label="Photographier l’ordonnance">
                    <IonIcon icon={cameraOutline} aria-hidden="true" />
                  </button>
                )}
              </>
            )}
            {etape === 'scan' && camera === 'indisponible' && (
              <div className="scan__repli">
                <span className="scan__repli-icone" aria-hidden="true">
                  <IonIcon icon={medkitOutline} />
                </span>
                <p className="scan__repli-texte">Photographiez l’ordonnance : l’IA la lit et vérifie qu’elle est valide.</p>
                <BoutonPrincipal icone={cameraOutline} onClick={ouvrirAppliPhoto}>Prendre une photo</BoutonPrincipal>
              </div>
            )}
            {etape === 'analyse' && apercu && (
              <>
                <img className="scan__capture" src={apercu} alt="Ordonnance photographiée" />
                <div className="scan__voile" aria-live="polite">
                  <IonSpinner name="crescent" />
                  <span>Lecture de l’ordonnance…</span>
                </div>
              </>
            )}
          </div>
        )}

        {(etape === 'scan' || etape === 'analyse') && (
          <section className="ipm-section scan__contenu">
            {etape === 'scan' && (
              <>
                <p className="scan__consigne">
                  {camera === 'active'
                    ? 'Placez l’ordonnance dans le cadre, puis touchez le déclencheur.'
                    : camera === 'demarrage'
                      ? 'Préparation de la caméra…'
                      : 'Caméra indisponible ici : prenez une photo ou importez une image.'}
                </p>
                <button type="button" className="scan__lien-galerie" onClick={importer}>
                  <IonIcon icon={imageOutline} aria-hidden="true" />
                  Importer une image
                </button>
              </>
            )}
          </section>
        )}

        {/* 4. INVALIDE : une phrase, pas de détail inutile ------------- */}
        {etape === 'invalide' && (
          <section className="ipm-section scan__contenu">
            {apercu && <img className="scan__capture scan__capture--carte" src={apercu} alt="Document photographié" />}
            <div className="scan__erreur" role="alert">
              <IonIcon icon={alertCircleOutline} aria-hidden="true" />
              <span>
                {erreur ||
                  resultat?.resume ||
                  resultat?.verdictMessage ||
                  'Document non exploitable pour un pré-financement.'}
              </span>
            </div>
            <div className="scan__actions">
              <BoutonPrincipal icone={cameraOutline} onClick={allerAuScan}>Scanner à nouveau</BoutonPrincipal>
              <button type="button" className="scan__lien-galerie" onClick={recommencer}>Changer de motif</button>
            </div>
          </section>
        )}

        {/* 5. MONTANT (ordonnance validée) ------------------------------ */}
        {etape === 'montant' && resultat && (
          <section className="ipm-section scan__contenu">
            <div className="scan__valide" role="status">
              <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
              <span>Ordonnance valide. {resultat.verdictMessage}</span>
            </div>
            <Resultat document={resultat} />
            <div className="scan__prix">
              <label className="scan__prix-label" htmlFor="scan-prix">Montant de l’ordonnance</label>
              <div className="scan__prix-champ">
                <input
                  id="scan-prix"
                  inputMode="numeric"
                  placeholder="0"
                  value={prix}
                  onChange={(e) => setPrix(e.target.value.replace(/\D/g, ''))}
                  aria-label="Montant de l’ordonnance en francs CFA"
                />
                <span className="scan__prix-unite">F CFA</span>
              </div>
              <p className="scan__prix-aide">
                C’est la somme qui sera avancée sur votre Orange Money. Vous devrez scanner la
                facture correspondante.
              </p>
            </div>
            <div className="scan__actions">
              <BoutonPrincipal icone={cashOutline} onClick={envoyer}>Envoyer le pré-financement</BoutonPrincipal>
              <button type="button" className="scan__lien-galerie" onClick={allerAuScan}>Scanner une autre ordonnance</button>
            </div>
          </section>
        )}

        {/* 6. SUCCÈS ---------------------------------------------------- */}
        {etape === 'succes' && verse != null && (
          <section className="ipm-section scan__contenu scan__succes">
            <div className="scan__succes-anim" aria-hidden="true">
              <span className="scan__succes-cercle">
                <IonIcon icon={checkmarkOutline} />
              </span>
            </div>
            <h2 className="scan__succes-titre">Pré-financement envoyé</h2>
            <p className="scan__succes-message">
              <strong>{montant(verse)} F CFA</strong> ont été envoyés sur votre wallet
              {' '}Orange Money <strong>{telephone}</strong>.
            </p>

            <div className="scan__avertissement" role="alert">
              <IonIcon icon={warningOutline} aria-hidden="true" />
              <div>
                <p className="scan__avertissement-titre">Scannez la facture sous 5 jours</p>
                <p className="scan__avertissement-texte">
                  Sans facture du montant avancé dans les 5 jours, la somme sera défalquée de votre
                  prochain salaire et vous risquez une suspension IPM de quelques mois à 1 an pour
                  suspicion de fraude.
                </p>
              </div>
            </div>

            <div className="scan__actions">
              <BoutonPrincipal icone={cameraOutline} onClick={allerAuScan}>Scanner la facture</BoutonPrincipal>
              <button type="button" className="scan__lien-galerie" onClick={recommencer}>Terminer</button>
            </div>
          </section>
        )}

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

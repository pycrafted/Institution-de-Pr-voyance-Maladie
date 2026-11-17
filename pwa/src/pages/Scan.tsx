/**
 * Écran « Scan » (/scan) : photographier un document et voir ce que l'IA en
 * comprend (type, date, prestataire, montant, éléments).
 *
 * Pour l'instant : seulement scan + reconnaissance. Rien n'est enregistré et
 * aucun versement n'est déclenché - le reste du pré-financement viendra après.
 *
 * La photo part à NOTRE serveur, qui appelle l'IA avec sa clé ; le téléphone ne
 * voit jamais la clé (cf. backend/apps/mobile/scan.py).
 */

import { IonContent, IonIcon, IonPage, IonSpinner, useIonToast } from '@ionic/react'
import {
  alertCircleOutline,
  calendarOutline,
  cameraOutline,
  cashOutline,
  checkmarkCircleOutline,
  imageOutline,
  medkitOutline,
  personOutline,
  storefrontOutline,
  warningOutline,
} from 'ionicons/icons'
import { useRef, useState, type ChangeEvent } from 'react'

import { messageErreur } from '../api'
import { reconnaitreDocument } from '../api/mobile'
import { BoutonPrincipal } from '../components/Boutons'
import EtatVide from '../components/EtatVide'
import { haptique } from '../hooks/haptique'
import type { DocumentReconnu } from '../types/api'
import { dateMoyenne, montant } from '../utils/format'
import { ErreurPhoto, reduireDocument } from '../utils/photo'
import './scan/scan.css'

type Etat = 'repos' | 'analyse' | 'resultat'

export default function Scan() {
  // Deux entrées : l'appareil photo (par défaut) et l'import depuis la galerie.
  const champCamera = useRef<HTMLInputElement>(null)
  const champGalerie = useRef<HTMLInputElement>(null)
  const [etat, setEtat] = useState<Etat>('repos')
  const [apercu, setApercu] = useState<string | null>(null)
  const [resultat, setResultat] = useState<DocumentReconnu | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [presenterToast] = useIonToast()

  function scanner() {
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

  return (
    <IonPage className="scan">
      <IonContent fullscreen>
        <div className="ipm-zone-sure" />

        {/* Deux entrées cachées : par défaut l'appareil photo arrière
            (`capture`), et l'import d'une image existante (sans `capture`). */}
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

        {etat === 'repos' ? (
          <>
            <EtatVide
              icone={cameraOutline}
              titre="Scanner un document"
              message="Photographiez une ordonnance, un reçu ou une facture : l’IA en reconnaît le type et les informations. Rien n’est enregistré pour l’instant."
              action={{ libelle: 'Prendre une photo', onClick: scanner, icone: cameraOutline }}
            />
            <button type="button" className="scan__lien-galerie" onClick={importer}>
              <IonIcon icon={imageOutline} aria-hidden="true" />
              Importer une image
            </button>
          </>
        ) : (
          <section className="ipm-section scan__contenu">
            {apercu && (
              <div className="scan__apercu">
                <img src={apercu} alt="Document photographié" />
                {etat === 'analyse' && (
                  <div className="scan__voile" aria-live="polite">
                    <IonSpinner name="crescent" />
                    <span>Lecture du document…</span>
                  </div>
                )}
              </div>
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
                <BoutonPrincipal icone={cameraOutline} onClick={scanner}>
                  Scanner un autre
                </BoutonPrincipal>
                <button type="button" className="scan__lien-galerie" onClick={importer}>
                  <IonIcon icon={imageOutline} aria-hidden="true" />
                  Importer une image
                </button>
              </div>
            )}
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

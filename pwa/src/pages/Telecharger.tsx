/**
 * Page « Télécharger Nofly » (/telecharger) : la page à partager pour
 * installer l'application. Accessible SANS être connecté (le lien circule
 * avant la première connexion), et sans parler d'aucune plateforme : Nofly
 * s'installe depuis le navigateur, sur téléphone comme sur ordinateur.
 *
 * De haut en bas : l'icône de l'IPM, le nom, une phrase ; le bouton
 * « Télécharger l'application » (la boîte d'installation du navigateur quand
 * il la propose, sinon les étapes s'ouvrent) ; « Comment l'installer ? » qui
 * déplie les étapes adaptées à l'appareil ; trois atouts en pastilles.
 */

import { IonContent, IonIcon, IonPage } from '@ionic/react'
import {
  addCircleOutline,
  checkmarkCircleOutline,
  downloadOutline,
  ellipsisVerticalOutline,
  helpCircleOutline,
  openOutline,
  shareOutline,
} from 'ionicons/icons'
import { useMemo, useRef, useState } from 'react'

import { BoutonPrincipal, BoutonSecondaire } from '../components/Boutons'
import { plateformeCourante } from '../components/InstallSheet'
import { haptique } from '../hooks/haptique'
import { useInstallation } from '../utils/installation'
import { estInstallee } from '../utils/plateforme'
import './telecharger/telecharger.css'

/** Safari (iPhone, iPad) : l'installation passe par le menu Partager. */
const ETAPES_PARTAGER = [
  {
    cle: 'partager',
    icone: shareOutline,
    texte: 'Touchez « Partager » dans la barre du navigateur.',
  },
  { cle: 'ecran', icone: addCircleOutline, texte: 'Choisissez « Sur l’écran d’accueil ».' },
  {
    cle: 'ajouter',
    icone: checkmarkCircleOutline,
    texte: 'Touchez « Ajouter » : Nofly apparaît parmi vos applications.',
  },
]

/** Les autres navigateurs : leur menu propose « Installer ». */
const ETAPES_MENU = [
  {
    cle: 'menu',
    icone: ellipsisVerticalOutline,
    texte: 'Ouvrez le menu du navigateur (les trois points).',
  },
  {
    cle: 'installer',
    icone: downloadOutline,
    texte: 'Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
  },
  {
    cle: 'ouvrir',
    icone: checkmarkCircleOutline,
    texte: 'Confirmez : Nofly apparaît parmi vos applications.',
  },
]

const ATOUTS = ['Gratuite', 'Sans store', 'Fonctionne hors ligne']

export default function Telecharger() {
  const { possible, installee, proposer } = useInstallation()
  const plateforme = useMemo(plateformeCourante, [])
  const dejaInstallee = useMemo(estInstallee, []) || installee
  const [etapesOuvertes, setEtapesOuvertes] = useState(false)
  const blocEtapes = useRef<HTMLDivElement>(null)
  const etapes = plateforme === 'ios' ? ETAPES_PARTAGER : ETAPES_MENU

  function montrerEtapes() {
    setEtapesOuvertes(true)
    // Après le rendu : amener les étapes à l'écran.
    requestAnimationFrame(() =>
      blocEtapes.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  async function telecharger() {
    haptique.leger()
    // Le navigateur sait installer en un geste : sa propre boîte s'ouvre.
    if (possible && plateforme !== 'ios') {
      const accepte = await proposer()
      if (accepte) haptique.succes()
      return
    }
    // Sinon, on montre comment faire.
    montrerEtapes()
  }

  return (
    <IonPage className="telecharger">
      <IonContent fullscreen>
        <main className="telecharger__page">
          <section className="telecharger__carte">
            <div className="telecharger__icone">
              <img src="/icons/icone-512.png" alt="" width={112} height={112} />
            </div>
            <h1 className="telecharger__titre">Nofly</h1>
            <p className="telecharger__accroche">
              L’application de l’IPM : vos bons, votre carte d’adhérent et votre relevé, toujours
              sur vous.
            </p>

            <ul className="telecharger__atouts" aria-label="Atouts">
              {ATOUTS.map((atout) => (
                <li key={atout}>{atout}</li>
              ))}
            </ul>

            <div className="telecharger__actions">
              {dejaInstallee ? (
                <BoutonPrincipal icone={openOutline} onClick={() => window.location.assign('/')}>
                  Ouvrir Nofly
                </BoutonPrincipal>
              ) : (
                <BoutonPrincipal icone={downloadOutline} onClick={() => void telecharger()}>
                  Télécharger l’application
                </BoutonPrincipal>
              )}
              <BoutonSecondaire
                icone={helpCircleOutline}
                onClick={() => {
                  haptique.leger()
                  if (etapesOuvertes) setEtapesOuvertes(false)
                  else montrerEtapes()
                }}
              >
                Comment l’installer ?
              </BoutonSecondaire>
            </div>

            {etapesOuvertes && (
              <div ref={blocEtapes} className="telecharger__etapes" aria-live="polite">
                <ol>
                  {etapes.map((etape, rang) => (
                    <li key={etape.cle}>
                      <span className="telecharger__numero" aria-hidden="true">
                        {rang + 1}
                      </span>
                      <IonIcon
                        icon={etape.icone}
                        className="telecharger__etape-icone"
                        aria-hidden="true"
                      />
                      <span>{etape.texte}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <p className="telecharger__pied">Institution de Prévoyance Maladie · SAR</p>
        </main>
      </IonContent>
    </IonPage>
  )
}

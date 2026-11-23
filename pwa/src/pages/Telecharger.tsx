/**
 * Page « Télécharger Nofly » (/telecharger) : la page à partager pour
 * installer l'application. Accessible SANS être connecté (le lien circule
 * avant la première connexion), et sans parler d'aucune plateforme : Nofly
 * s'installe depuis le navigateur, sur téléphone comme sur ordinateur.
 *
 * De haut en bas : le logo de l'IPM et le nom, trois atouts en
 * pastilles ; « Comment l'installer ? », les étapes adaptées à l'appareil,
 * toujours visibles ; puis le bouton « Télécharger l'application » (la boîte
 * d'installation du navigateur quand il la propose).
 */

import { IonContent, IonPage } from '@ionic/react'
import { downloadOutline, openOutline } from 'ionicons/icons'
import { useMemo, useRef, useState, type ReactNode } from 'react'

import { BoutonPrincipal } from '../components/Boutons'
import PucesFiltre from '../components/PucesFiltre'
import { haptique } from '../hooks/haptique'
import { useInstallation } from '../utils/installation'
import { plateformeCourante } from '../utils/plateforme'
import { estInstallee } from '../utils/plateforme'
import IllustrationEtape from './telecharger/Illustrations'
import './telecharger/illustrations.css'
import './telecharger/telecharger.css'

type Telephone = 'iphone' | 'android'

interface Etape {
  cle: string
  /** Ce qu'il faut faire, en une phrase courte : les mots à toucher en gras. */
  action: ReactNode
  /** Où le trouver, ou quoi faire si on ne le voit pas. */
  aide?: ReactNode
}

/**
 * Les étapes, écrites pour qu'on n'ait jamais à deviner : une action par
 * étape, les mots exacts affichés par le téléphone en gras, et où les trouver.
 */
const ETAPES: Record<Telephone, Etape[]> = {
  // Safari ne propose aucune fenêtre d'installation : tout passe par Partager.
  iphone: [
    {
      cle: 'safari',
      action: (
        <>
          Ouvrez cette page avec <strong>Safari</strong>
        </>
      ),
      aide: 'Safari, c’est la boussole bleue. Si vous êtes dans WhatsApp, Chrome ou un autre navigateur, copiez le lien de cette page et collez-le dans Safari.',
    },
    {
      cle: 'partager',
      action: (
        <>
          Appuyez sur le bouton <strong>Partager</strong>
        </>
      ),
      aide: 'C’est le carré avec une flèche vers le haut, tout en bas de l’écran (en haut sur iPad).',
    },
    {
      cle: 'ecran',
      action: (
        <>
          Appuyez sur <strong>Sur l’écran d’accueil</strong>
        </>
      ),
      aide: 'Vous ne le voyez pas ? Faites glisser la liste vers le haut avec le doigt.',
    },
    {
      cle: 'ajouter',
      action: (
        <>
          Appuyez sur <strong>Ajouter</strong>
        </>
      ),
      aide: 'En haut à droite de l’écran.',
    },
    {
      cle: 'fini',
      action: <>C’est fini !</>,
      aide: 'L’icône IPM-SAR est sur l’écran de votre téléphone. Appuyez dessus pour ouvrir l’application.',
    },
  ],
  // Chrome sait installer en un geste : le bouton rouge suffit le plus souvent.
  android: [
    {
      cle: 'chrome',
      action: (
        <>
          Ouvrez cette page avec <strong>Chrome</strong>
        </>
      ),
      aide: 'Si vous êtes dans WhatsApp ou Facebook, appuyez sur les trois points en haut à droite, puis sur « Ouvrir dans Chrome ».',
    },
    {
      cle: 'bouton',
      action: (
        <>
          Appuyez sur le bouton rouge <strong>Télécharger l’application</strong>, puis sur{' '}
          <strong>Installer</strong>
        </>
      ),
      aide: 'Le bouton rouge est juste en dessous. Une fenêtre s’ouvre : appuyez sur « Installer ».',
    },
    {
      cle: 'menu',
      action: (
        <>
          Pas de fenêtre ? Appuyez sur les <strong>trois points</strong> en haut à droite
        </>
      ),
      aide: (
        <>
          Puis sur <strong>Installer l’application</strong> (ou{' '}
          <strong>Ajouter à l’écran d’accueil</strong>), et encore sur <strong>Installer</strong>.
        </>
      ),
    },
    {
      cle: 'fini',
      action: <>C’est fini !</>,
      aide: 'L’icône IPM-SAR est sur l’écran de votre téléphone. Appuyez dessus pour ouvrir l’application.',
    },
  ],
}

const TELEPHONES = [
  { cle: 'iphone', libelle: 'iPhone' },
  { cle: 'android', libelle: 'Android' },
] as const

const ATOUTS = ['Gratuite', 'Sans store', 'Fonctionne hors ligne']

export default function Telecharger() {
  const { possible, installee, proposer } = useInstallation()
  const plateforme = useMemo(plateformeCourante, [])
  const dejaInstallee = useMemo(estInstallee, []) || installee
  const blocEtapes = useRef<HTMLDivElement>(null)
  // Le téléphone reconnu est choisi d'avance ; on peut changer s'il se trompe.
  const [telephone, setTelephone] = useState<Telephone>(plateforme === 'ios' ? 'iphone' : 'android')
  const etapes = ETAPES[telephone]

  function montrerEtapes() {
    blocEtapes.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
            {/* Comme sur la page de connexion : le logo de l'IPM, sans fond, à
                côté du nom. */}
            <div className="telecharger__entete">
              <img
                className="telecharger__logo"
                src="/logo-ipm.png"
                alt="IPM"
                width={44}
                height={44}
              />
              <h1 className="telecharger__titre">IPM-SAR</h1>
            </div>

            <ul className="telecharger__atouts" aria-label="Atouts">
              {ATOUTS.map((atout) => (
                <li key={atout}>{atout}</li>
              ))}
            </ul>

            <div
              ref={blocEtapes}
              className="telecharger__etapes"
              aria-labelledby="telecharger-etapes-titre"
            >
              <h2 id="telecharger-etapes-titre" className="telecharger__etapes-titre">
                Comment l’installer ?
              </h2>
              <p className="telecharger__etapes-question">Quel téléphone avez-vous ?</p>
              <PucesFiltre
                className="telecharger__telephones"
                puces={TELEPHONES}
                active={telephone}
                onChanger={(cle) => setTelephone(cle as Telephone)}
                etiquette="Votre téléphone"
              />
              <ol>
                {etapes.map((etape, rang) => (
                  <li key={etape.cle} className="telecharger__etape">
                    <span className="telecharger__numero" aria-hidden="true">
                      {rang + 1}
                    </span>
                    <div className="telecharger__etape-textes">
                      <p className="telecharger__etape-action">{etape.action}</p>
                      {etape.aide && <p className="telecharger__etape-aide">{etape.aide}</p>}
                      {/* Ce qu'on voit sur le téléphone, le bouton à toucher entouré. */}
                      <IllustrationEtape cle={`${telephone}-${etape.cle}`} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="telecharger__actions">
              {dejaInstallee ? (
                <BoutonPrincipal icone={openOutline} onClick={() => window.location.assign('/')}>
                  Ouvrir IPM-SAR
                </BoutonPrincipal>
              ) : (
                <BoutonPrincipal icone={downloadOutline} onClick={() => void telecharger()}>
                  Télécharger l’application
                </BoutonPrincipal>
              )}
            </div>
          </section>
        </main>
      </IonContent>
    </IonPage>
  )
}

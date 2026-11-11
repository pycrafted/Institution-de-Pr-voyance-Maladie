/**
 * Écran « Installer l'application » (/installation), ouvert depuis le profil.
 * Même présentation que l'écran « Assistance » : bandeau compact avec
 * retour, puis des sections de cartes autonomes.
 *
 * De haut en bas :
 *   1. pourquoi l'installer, en trois cartes ;
 *   2. comment faire : le bouton « Installer » quand le navigateur sait le
 *      faire en un geste (Android / Chrome), sinon les étapes à suivre
 *      (iOS : menu Partager de Safari ; autres : menu du navigateur).
 *
 * La feuille spontanée (components/InstallSheet.tsx) reste la proposition
 * faite au lancement ; cet écran est la version à la demande.
 */

import { IonContent, IonPage, useIonRouter } from '@ionic/react'
import {
  addCircleOutline,
  checkmarkCircleOutline,
  cloudOfflineOutline,
  downloadOutline,
  ellipsisVerticalOutline,
  flashOutline,
  phonePortraitOutline,
  shareOutline,
} from 'ionicons/icons'
import { useMemo } from 'react'

import { BoutonPrincipal } from '../components/Boutons'
import CarteListe from '../components/CarteListe'
import EnteteEcran from '../components/EnteteEcran'
import { plateformeCourante } from '../components/InstallSheet'
import { haptique } from '../hooks/haptique'
import { useInstallation } from '../utils/installation'
import { estInstallee } from '../utils/plateforme'
import './assistance/assistance.css'

const ATOUTS = [
  {
    cle: 'rapide',
    icone: flashOutline,
    titre: 'Ouverture instantanée',
    texte: 'En plein écran, sans passer par le navigateur.',
  },
  {
    cle: 'hors-ligne',
    icone: cloudOfflineOutline,
    titre: 'Même sans connexion',
    texte: 'Vos bons restent consultables hors ligne.',
  },
  {
    cle: 'leger',
    icone: phonePortraitOutline,
    titre: 'Aucun store',
    texte: 'Très peu de place sur le téléphone.',
  },
]

const ETAPES_IOS = [
  {
    cle: 'partager',
    icone: shareOutline,
    titre: 'Touchez « Partager »',
    texte: 'Dans la barre de Safari (sous iOS 26, touchez d’abord « ··· »).',
  },
  {
    cle: 'ecran',
    icone: addCircleOutline,
    titre: 'Choisissez « Sur l’écran d’accueil »',
    texte: 'Faites défiler le menu de partage pour le trouver.',
  },
  {
    cle: 'ajouter',
    icone: checkmarkCircleOutline,
    titre: 'Touchez « Ajouter »',
    texte: 'En haut à droite. Ouvrez ensuite IPM Mobile depuis son icône.',
  },
]

const ETAPES_NAVIGATEUR = [
  {
    cle: 'menu',
    icone: ellipsisVerticalOutline,
    titre: 'Ouvrez le menu du navigateur',
    texte: 'Les trois points, en haut ou en bas de l’écran.',
  },
  {
    cle: 'installer',
    icone: downloadOutline,
    titre: 'Choisissez « Installer »',
    texte: 'Ou « Ajouter à l’écran d’accueil », selon le navigateur.',
  },
]

export default function Installation() {
  const routeur = useIonRouter()
  const { possible, installee, proposer } = useInstallation()
  const plateforme = useMemo(plateformeCourante, [])
  const dejaInstallee = useMemo(estInstallee, []) || installee
  const directe = plateforme !== 'ios' && possible
  const etapes = plateforme === 'ios' ? ETAPES_IOS : ETAPES_NAVIGATEUR

  return (
    <IonPage className="assistance">
      <IonContent fullscreen>
        <EnteteEcran
          titre="Installer l’application"
          sousTitre="IPM Mobile sur votre écran d’accueil"
          onRetour={() => routeur.goBack()}
        />

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Pourquoi l’installer</h2>
          </div>
          <div className="ipm-pile">
            {ATOUTS.map((atout, rang) => (
              <CarteListe
                key={atout.cle}
                rang={rang}
                icone={atout.icone}
                teinte="rouge"
                titre={atout.titre}
                details={<span>{atout.texte}</span>}
              />
            ))}
          </div>
        </section>

        <section className="ipm-section">
          <div className="ipm-entete-section">
            <h2 className="ipm-titre-section">Comment faire</h2>
          </div>
          {dejaInstallee ? (
            <div className="ipm-pile">
              <CarteListe
                icone={checkmarkCircleOutline}
                teinte="valide"
                titre="Déjà installée"
                details={<span>Ouvrez IPM Mobile depuis son icône sur l’écran d’accueil.</span>}
              />
            </div>
          ) : directe ? (
            <div className="assistance__action">
              <BoutonPrincipal
                icone={downloadOutline}
                onClick={() => {
                  haptique.leger()
                  void proposer()
                }}
              >
                Installer
              </BoutonPrincipal>
            </div>
          ) : (
            <div className="ipm-pile">
              {etapes.map((etape, rang) => (
                <CarteListe
                  key={etape.cle}
                  rang={rang}
                  icone={etape.icone}
                  teinte="rouge"
                  titre={etape.titre}
                  details={<span>{etape.texte}</span>}
                  meta={`Étape ${rang + 1}`}
                />
              ))}
            </div>
          )}
        </section>

        {/* La barre d'onglets flotte au-dessus du contenu : lui laisser la place. */}
        <div className="ipm-bas-page" />
      </IonContent>
    </IonPage>
  )
}

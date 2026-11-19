/**
 * Barre du HAUT (components/BarreActions.tsx), posée directement sur la page.
 *
 * Plus de carte flottante : un bandeau de la couleur du fond, sans bord ni
 * ombre, comme l'en-tête d'une appli native. À GAUCHE, le nom de l'appli
 * (« Nofly 😊 ») ; AU MILIEU, le solde IPM de l'agent (il ouvre le relevé) ;
 * à DROITE, les actions en icônes seules - Identité, Notifications, Profil. La cloche porte une pastille tant qu'il
 * reste des décisions de l'IPM non lues.
 *
 * Elle n'est PAS une barre fixe : chaque écran l'écrit en tête de son
 * contenu (à la place de l'ancien espaceur `ipm-zone-sure`), et elle défile
 * avec la page.
 */

import { IonIcon, useIonRouter } from '@ionic/react'
import { idCardOutline, notificationsOutline, personOutline, walletOutline } from 'ionicons/icons'

import { useCompte } from '../data/compte'
import { haptique } from '../hooks/haptique'
import { useNotifications } from '../hooks/useNotifications'
import { montant } from '../utils/format'

// Les actions de droite : une icône au trait, sans libellé visible (lu par le
// lecteur d'écran).
const ACTIONS = [
  { cle: 'identite', icone: idCardOutline, etiquette: 'Photos d’identité', chemin: '/identite' },
  {
    cle: 'notifications',
    icone: notificationsOutline,
    etiquette: 'Notifications',
    chemin: '/notifications',
  },
  { cle: 'profil', icone: personOutline, etiquette: 'Mon profil', chemin: '/profil' },
]

export default function BarreActions() {
  const routeur = useIonRouter()
  const { nonLues } = useNotifications()
  const { releve } = useCompte()
  const solde = releve?.solde ?? null

  function aller(chemin: string) {
    haptique.leger()
    routeur.push(chemin, 'forward', 'push')
  }

  return (
    <header className="ipm-navbar">
      {/* Le nom de l'application, à gauche. */}
      <span className="ipm-navbar__nom">
        Nofly <span aria-hidden="true">😊</span>
      </span>

      {/* Le solde IPM, à gauche : ce qui reste à payer (rouge), rien (vert),
          ou une avance (montant négatif). Il ouvre le relevé. */}
      {solde !== null ? (
        <button
          type="button"
          className="ipm-navbar__solde ipm-appui"
          aria-label={`Solde restant : ${montant(solde)}, voir le relevé`}
          onClick={() => aller('/releve')}
        >
          <IonIcon icon={walletOutline} className="ipm-navbar__solde-icone" aria-hidden="true" />
          <span className="ipm-navbar__solde-textes">
            <span
              className={`ipm-navbar__solde-montant ipm-chiffres${
                solde > 0 ? ' ipm-navbar__solde-montant--du' : ''
              }${solde === 0 ? ' ipm-navbar__solde-montant--ajour' : ''}`}
            >
              {montant(solde)}
            </span>
          </span>
        </button>
      ) : (
        <span className="ipm-navbar__solde" aria-hidden="true" />
      )}

      <nav className="ipm-navbar__actions" aria-label="Actions">
        {ACTIONS.map((action) => {
          // Seule la cloche porte une pastille : le nombre de décisions non lues.
          const pastille = action.cle === 'notifications' ? nonLues : 0
          return (
            <button
              key={action.cle}
              type="button"
              className="ipm-navbar__icone ipm-appui"
              aria-label={
                pastille > 0 ? `${action.etiquette} (${pastille} non lues)` : action.etiquette
              }
              onClick={() => aller(action.chemin)}
            >
              <span className="ipm-navbar__porte-icone">
                <IonIcon icon={action.icone} aria-hidden="true" />
                {pastille > 0 && (
                  <span className="ipm-navbar__pastille" aria-hidden="true">
                    {pastille > 9 ? '9+' : pastille}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}

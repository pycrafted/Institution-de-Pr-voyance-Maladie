/**
 * Barre du HAUT (components/BarreActions.tsx), posée directement sur la page.
 *
 * Plus de carte flottante : un bandeau de la couleur du fond, sans bord ni
 * ombre, comme l'en-tête d'une appli native. À GAUCHE, le solde IPM de
 * l'agent (il ouvre les retenues) ; à DROITE, les actions en icônes seules -
 * Identité, Notifications, Profil. La cloche porte une pastille tant qu'il
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
      {/* Le solde IPM, à gauche : ce qui reste à payer (rouge), rien (vert),
          ou une avance (montant négatif). Il ouvre les retenues. */}
      {solde !== null ? (
        <button
          type="button"
          className="ipm-navbar__solde ipm-appui"
          aria-label={`${libelleSolde(solde)} : ${montant(Math.abs(solde))}, voir les retenues`}
          onClick={() => aller('/releve')}
        >
          <IonIcon icon={walletOutline} className="ipm-navbar__solde-icone" aria-hidden="true" />
          <span className="ipm-navbar__solde-textes">
            <span
              className={`ipm-navbar__solde-montant ipm-chiffres${
                solde > 0 ? ' ipm-navbar__solde-montant--du' : ''
              }${solde === 0 ? ' ipm-navbar__solde-montant--ajour' : ''}`}
            >
              {montant(Math.abs(solde))}
            </span>
            {/* Ce que veut dire le montant, en mots de tous les jours, sous le montant. */}
            <span className="ipm-navbar__solde-libelle">{libelleSolde(solde)}</span>
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

/**
 * Le sens du solde, dit simplement : ce que l'agent doit encore à l'IPM (sa
 * part des soins pas encore retenue sur son salaire), rien, ou ce que l'IPM
 * lui doit (des retenues au-delà de sa part).
 */
function libelleSolde(solde: number): string {
  if (solde > 0) return 'Vous devez à l’IPM'
  if (solde < 0) return 'L’IPM vous doit'
  return 'Vous ne devez rien à l’IPM'
}

/**
 * Barre du HAUT - « top app bar » FLOTTANTE (components/BarreActions.tsx)
 *
 * Posée comme une carte qui flotte au-dessus du contenu : le nom de
 * l'application à gauche, et à droite, EN ACCÈS DIRECT, les actions qui ne
 * dépendent d'aucun écran - photos d'identité, notifications, apparence,
 * déconnexion. Plus de menu caché derrière un hamburger : chaque action est
 * une icône sur la barre, comme les maquettes.
 *
 * Elle est posée par la coquille (App.tsx), à côté de la barre d'onglets du
 * bas, et se montre donc sur TOUS les écrans. Elle garde la hauteur que les
 * écrans lui réservent (`--barre-haut`). Chaque action mène désormais à une
 * PAGE à part entière (Identité, Notifications, Mon relevé, Profil) : la barre
 * ne fait que naviguer, elle ne porte plus de feuille. La cloche affiche une
 * pastille tant qu'il reste des décisions de l'IPM non lues.
 */

import { IonIcon, useIonRouter } from '@ionic/react'
// Icônes PLEINES (en mode Material, le variant plein est rendu).
import { idCard, notifications, person, wallet } from 'ionicons/icons'

import { haptique } from '../hooks/haptique'
import { useNotifications } from '../hooks/useNotifications'

export default function BarreActions() {
  const routeur = useIonRouter()
  const { nonLues } = useNotifications()

  // Les actions, réparties en quarts égaux sur la barre, comme les onglets du
  // bas : une icône et son libellé dessous.
  const actions = [
    {
      // Dote de portraits les cartes d'adhérent (titulaire + ayants droit) :
      // « Identité » est plus juste et plus pro que l'ancien « Photos ». C'est
      // désormais une PAGE à part entière (/identite), comme Profil.
      cle: 'identite',
      icone: idCard,
      libelle: 'Identité',
      etiquette: 'Photos d’identité',
      agir: () => {
        haptique.leger()
        routeur.push('/identite', 'forward', 'push')
      },
    },
    {
      // Désormais une PAGE à part entière (/notifications), comme Identité.
      // La pastille porte le nombre de décisions encore non lues.
      cle: 'notifications',
      icone: notifications,
      libelle: 'Notifications',
      etiquette: 'Notifications',
      agir: () => {
        haptique.leger()
        routeur.push('/notifications', 'forward', 'push')
      },
    },
    {
      // Le relevé du compte IPM de l'agent (ticket modérateur + retenues) a
      // quitté le footer pour rejoindre le profil ici : tout le « compte/perso »
      // est désormais regroupé dans la barre du haut.
      cle: 'releve',
      icone: wallet,
      libelle: 'Mon relevé',
      etiquette: 'Mon relevé de compte IPM',
      agir: () => {
        haptique.leger()
        routeur.push('/releve', 'forward', 'push')
      },
    },
    {
      // Le profil remplace « Quitter » : la déconnexion ET l'apparence
      // (clair/sombre) s'y trouvent désormais, à l'intérieur de l'écran.
      cle: 'profil',
      icone: person,
      libelle: 'Profil',
      etiquette: 'Mon profil',
      agir: () => {
        haptique.leger()
        routeur.push('/profil', 'forward', 'push')
      },
    },
  ]

  return (
    <header className="ipm-navbar">
      <nav className="ipm-navbar__actions" aria-label="Actions">
        {actions.map((action) => {
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
              onClick={action.agir}
            >
              <span className="ipm-navbar__porte-icone">
                <IonIcon icon={action.icone} aria-hidden="true" />
                {pastille > 0 && (
                  <span className="ipm-navbar__pastille" aria-hidden="true">
                    {pastille > 9 ? '9+' : pastille}
                  </span>
                )}
              </span>
              <span className="ipm-navbar__libelle">{action.libelle}</span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}

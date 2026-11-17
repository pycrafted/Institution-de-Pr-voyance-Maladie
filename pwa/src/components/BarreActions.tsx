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
 * écrans lui réservent (`--barre-haut`). Elle porte aussi les fenêtres de ces
 * actions (photos, notifications, question de déconnexion) : elles s'ouvrent
 * de partout, elles appartiennent donc à la barre et non à un écran.
 */

import { IonIcon, useIonRouter } from '@ionic/react'
// Icônes PLEINES (en mode Material, le variant plein est rendu).
import { idCard, notifications, person, wallet } from 'ionicons/icons'
import { useState } from 'react'

import { haptique } from '../hooks/haptique'
import { BoutonPrincipal } from './Boutons'
import Feuille from './Feuille'

export default function BarreActions() {
  const routeur = useIonRouter()
  const [notifsOuvertes, setNotifsOuvertes] = useState(false)

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
      cle: 'notifications',
      icone: notifications,
      libelle: 'Notifications',
      etiquette: 'Notifications',
      agir: () => {
        haptique.leger()
        setNotifsOuvertes(true)
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
    <>
      <header className="ipm-navbar">
        <nav className="ipm-navbar__actions" aria-label="Actions">
          {actions.map((action) => (
            <button
              key={action.cle}
              type="button"
              className="ipm-navbar__icone ipm-appui"
              aria-label={action.etiquette}
              onClick={action.agir}
            >
              <IonIcon icon={action.icone} aria-hidden="true" />
              <span className="ipm-navbar__libelle">{action.libelle}</span>
            </button>
          ))}
        </nav>
      </header>

      <Feuille
        ouverte={notifsOuvertes}
        onFermer={() => setNotifsOuvertes(false)}
        titre="Notifications"
        icone={notifications}
      >
        <p className="ipm-feuille-texte">Vous n’avez aucune notification pour le moment.</p>
        <BoutonPrincipal onClick={() => setNotifsOuvertes(false)}>Compris</BoutonPrincipal>
      </Feuille>
    </>
  )
}

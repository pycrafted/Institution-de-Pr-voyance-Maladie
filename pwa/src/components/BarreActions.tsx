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

import { IonIcon } from '@ionic/react'
// Icônes PLEINES (en mode Material, le variant plein est rendu).
import { camera, logOut, moon, notifications, sunny } from 'ionicons/icons'
import { useState } from 'react'

import { haptique } from '../hooks/haptique'
import { useSession } from '../session'
import { basculerApparence, useApparence } from '../theme/apparence'
import { BoutonPrincipal } from './Boutons'
import Feuille from './Feuille'
import FeuilleChoix from './FeuilleChoix'
import PhotosModal from './PhotosModal'

export default function BarreActions() {
  const { deconnecter } = useSession()
  const sombre = useApparence() === 'sombre'
  const [photosOuvertes, setPhotosOuvertes] = useState(false)
  const [notifsOuvertes, setNotifsOuvertes] = useState(false)
  // Déconnexion : jamais sans confirmation, elle efface les bons du téléphone.
  const [deconnexionDemandee, setDeconnexionDemandee] = useState(false)

  // Les actions, réparties en quarts égaux sur la barre, comme les onglets du
  // bas : une icône et son libellé dessous.
  const actions = [
    {
      cle: 'photos',
      icone: camera,
      libelle: 'Photos',
      etiquette: 'Photos d’identité',
      agir: () => {
        haptique.leger()
        setPhotosOuvertes(true)
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
      cle: 'apparence',
      icone: sombre ? sunny : moon,
      libelle: sombre ? 'Clair' : 'Sombre',
      etiquette: sombre ? 'Passer en mode clair' : 'Passer en mode sombre',
      agir: () => {
        haptique.leger()
        basculerApparence()
      },
    },
    {
      cle: 'deconnexion',
      icone: logOut,
      libelle: 'Quitter',
      etiquette: 'Se déconnecter',
      agir: () => {
        haptique.avertissement()
        setDeconnexionDemandee(true)
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

      <PhotosModal ouverte={photosOuvertes} onFermer={() => setPhotosOuvertes(false)} />

      <Feuille
        ouverte={notifsOuvertes}
        onFermer={() => setNotifsOuvertes(false)}
        titre="Notifications"
        icone={notifications}
      >
        <p className="ipm-feuille-texte">Vous n’avez aucune notification pour le moment.</p>
        <BoutonPrincipal onClick={() => setNotifsOuvertes(false)}>Compris</BoutonPrincipal>
      </Feuille>

      <FeuilleChoix
        ouverte={deconnexionDemandee}
        onFermer={() => setDeconnexionDemandee(false)}
        titre="Se déconnecter d’IPM Mobile ?"
        message="Les bons enregistrés sur ce téléphone seront effacés. Vous les retrouverez en vous identifiant à nouveau."
        icone={logOut}
        choix={[
          {
            libelle: 'Se déconnecter',
            genre: 'principal',
            onClick: () => void deconnecter('volontaire'),
          },
          { libelle: 'Annuler' },
        ]}
      />
    </>
  )
}

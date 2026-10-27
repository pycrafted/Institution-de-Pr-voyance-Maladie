/**
 * Barre d'actions du HAUT, pendant de la barre d'onglets du bas.
 *
 * Elle porte les quatre actions qui ne dépendent d'aucun écran - apparence,
 * photos d'identité, notifications, déconnexion - et les montre donc sur
 * TOUS les écrans. Même forme que les onglets d'en bas, jusqu'au détail :
 * largeur en quarts égaux, icône pleine de 24 et libellé de 12 dessous.
 * Avant, elles vivaient dans l'en-tête de l'accueil : il fallait y revenir
 * pour se déconnecter ou changer de mode.
 *
 * Elle est posée par la coquille (App.tsx), à côté de la barre d'onglets, et
 * non par chaque page : une barre recopiée dans cinq écrans finit par diverger
 * de l'un à l'autre. Les écrans ne font que lui réserver sa hauteur, par le
 * retrait du haut de leur en-tête (`--barre-haut`, cf. composants.css).
 *
 * Elle porte aussi les fenêtres de ces actions (photos, notifications,
 * question de déconnexion) : elles s'ouvrent de partout, elles appartiennent
 * donc à la barre et non à un écran.
 */

import { IonIcon, useIonRouter } from '@ionic/react'
// Icônes PLEINES, comme la barre du bas : en mode Material, elle rend le
// variant plein (`md={iconePleine}`), jamais celui au trait. Les deux barres
// doivent se répondre.
import { camera, logOut, moon, notifications, sunny } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { haptique } from '../hooks/haptique'
import { useNotifications } from '../hooks/useNotifications'
import { useSession } from '../session'
import { basculerApparence, useApparence } from '../theme/apparence'
import { BoutonPrincipal } from './Boutons'
import Feuille from './Feuille'
import FeuilleChoix from './FeuilleChoix'
import PhotosModal from './PhotosModal'
import { dateHeure } from '../utils/format'

export default function BarreActions() {
  const { deconnecter } = useSession()
  const sombre = useApparence() === 'sombre'
  const [photosOuvertes, setPhotosOuvertes] = useState(false)
  const [notifsOuvertes, setNotifsOuvertes] = useState(false)
  const notifs = useNotifications()
  const routeur = useIonRouter()
  // La cloche ouverte : on relit, et tout ce qu'elle montre devient lu.
  useEffect(() => {
    if (notifsOuvertes) void notifs.relire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifsOuvertes])
  useEffect(() => {
    if (notifsOuvertes) notifs.marquerLues()
  }, [notifsOuvertes, notifs])
  // Déconnexion : jamais sans confirmation, elle efface les bons du téléphone.
  const [deconnexionDemandee, setDeconnexionDemandee] = useState(false)

  const actions = [
    {
      cle: 'apparence',
      icone: sombre ? sunny : moon,
      libelle: sombre ? 'Mode clair' : 'Mode sombre',
      etiquette: sombre ? 'Passer en mode clair' : 'Passer en mode sombre',
      agir: () => {
        haptique.leger()
        basculerApparence()
      },
    },
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
      etiquette: notifs.nonLues
        ? `Notifications : ${notifs.nonLues} nouvelle${notifs.nonLues > 1 ? 's' : ''}`
        : 'Notifications',
      pastille: notifs.nonLues,
      agir: () => {
        haptique.leger()
        setNotifsOuvertes(true)
      },
    },
    {
      cle: 'deconnexion',
      icone: logOut,
      libelle: 'Déconnexion',
      etiquette: 'Se déconnecter',
      agir: () => {
        haptique.avertissement()
        setDeconnexionDemandee(true)
      },
    },
  ]

  return (
    <>
      <nav className="ipm-barre-actions" aria-label="Actions">
        {actions.map((action) => (
          <button
            key={action.cle}
            type="button"
            className="ipm-barre-actions__bouton ipm-appui"
            aria-label={action.etiquette}
            onClick={action.agir}
          >
            <span className="ipm-barre-actions__icone">
              <IonIcon icon={action.icone} aria-hidden="true" />
              {'pastille' in action && action.pastille ? (
                <span className="ipm-barre-actions__pastille" aria-hidden="true">
                  {action.pastille > 9 ? '9+' : action.pastille}
                </span>
              ) : null}
            </span>
            <span className="ipm-barre-actions__libelle">{action.libelle}</span>
          </button>
        ))}
      </nav>

      <PhotosModal ouverte={photosOuvertes} onFermer={() => setPhotosOuvertes(false)} />

      <Feuille
        ouverte={notifsOuvertes}
        onFermer={() => setNotifsOuvertes(false)}
        titre="Notifications"
        icone={notifications}
      >
        {notifs.notifications.length === 0 ? (
          <p className="ipm-feuille-texte">Vous n’avez aucune notification pour le moment.</p>
        ) : (
          <ul className="notifs__liste">
            {notifs.notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="notifs__element ipm-appui"
                  disabled={!n.lien}
                  onClick={() => {
                    if (!n.lien) return
                    setNotifsOuvertes(false)
                    routeur.push(n.lien, 'forward', 'push')
                  }}
                >
                  <span className="notifs__titre">{n.titre}</span>
                  <span className="notifs__message">{n.message}</span>
                  <span className="notifs__date">{dateHeure(n.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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

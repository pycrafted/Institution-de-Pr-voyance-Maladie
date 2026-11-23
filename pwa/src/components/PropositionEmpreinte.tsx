/**
 * Une fois connecté (mot de passe ou code de l'IPM), l'application propose
 * UNE fois, sur cet appareil, d'activer la connexion par empreinte / Face ID.
 * Rien si le téléphone ne sait pas le faire, ou s'il porte déjà une clé.
 * Refuser n'empêche rien : l'option reste dans le Profil.
 */

import { fingerPrint } from 'ionicons/icons'
import { useEffect, useState } from 'react'

import { messageErreur } from '../api'
import { haptique } from '../hooks/haptique'
import { useParticipant } from '../session'
import { activerEmpreinte } from '../session/empreinte'
import {
  cleDeLAppareil,
  empreinteDisponible,
  estAbandon,
  noterProposition,
  propositionDejaFaite,
} from '../utils/clesAcces'
import { BoutonPrincipal, BoutonSecondaire } from './Boutons'
import Feuille from './Feuille'

export default function PropositionEmpreinte() {
  const { participant } = useParticipant()
  const [ouverte, setOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (propositionDejaFaite() || cleDeLAppareil()) return undefined
    let vivant = true
    // Laisser l'accueil s'afficher d'abord.
    const minuterie = window.setTimeout(() => {
      void empreinteDisponible().then((oui) => {
        if (vivant && oui) setOuverte(true)
      })
    }, 1200)
    return () => {
      vivant = false
      window.clearTimeout(minuterie)
    }
  }, [])

  function fermer() {
    noterProposition()
    setOuverte(false)
  }

  async function activer() {
    if (!participant) return
    setEnCours(true)
    setErreur(null)
    try {
      await activerEmpreinte(participant.matriculeAffiche)
      haptique.succes()
      fermer()
    } catch (e) {
      if (!estAbandon(e)) {
        haptique.erreur()
        setErreur(messageErreur(e))
      }
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Feuille ouverte={ouverte} onFermer={fermer} titre="Connexion rapide" icone={fingerPrint}>
      <p className="ipm-feuille__texte">
        La prochaine fois, connectez-vous d’un geste avec votre <strong>empreinte</strong> ou{' '}
        <strong>Face ID</strong>, sans retaper votre mot de passe.
      </p>
      <p className="ipm-feuille__texte ipm-feuille__texte--doux">
        Votre empreinte ne quitte jamais votre téléphone : ni l’IPM ni l’application ne la voient.
      </p>
      {erreur && (
        <p className="ipm-feuille__texte ipm-feuille__texte--erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="ipm-feuille__boutons">
        <BoutonPrincipal icone={fingerPrint} occupe={enCours} onClick={() => void activer()}>
          Activer
        </BoutonPrincipal>
        <BoutonSecondaire onClick={fermer}>Plus tard</BoutonSecondaire>
      </div>
    </Feuille>
  )
}

/**
 * « Changer mon mot de passe », ouvert depuis le Profil : l'actuel, le
 * nouveau, sa confirmation. Mêmes règles qu'à l'activation (cf.
 * identification/activation) ; c'est le serveur qui tranche.
 */

import { lockClosedOutline } from 'ionicons/icons'
import { useState } from 'react'

import { changerMotDePasse, messageErreur } from '../../api'
import { BoutonPrincipal } from '../../components/Boutons'
import { Saisie } from '../../components/ChampsFormulaire'
import Feuille from '../../components/Feuille'
import { haptique } from '../../hooks/haptique'
import { useParticipant } from '../../session'
import { verifierConfirmation, verifierNouveauMotDePasse } from '../identification/activation'

interface Props {
  ouverte: boolean
  onFermer: (change: boolean) => void
}

export default function ChangerMotDePasse({ ouverte, onFermer }: Props) {
  const { participant } = useParticipant()
  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const erreurs = {
    ancien: ancien ? undefined : 'Saisissez votre mot de passe actuel.',
    nouveau: verifierNouveauMotDePasse(nouveau, participant?.matricule ?? ''),
    confirmation: verifierConfirmation(nouveau, confirmation),
  }
  const affichees: Partial<typeof erreurs> = tente ? erreurs : {}

  function fermer(change: boolean) {
    setAncien('')
    setNouveau('')
    setConfirmation('')
    setTente(false)
    setErreur(null)
    onFermer(change)
  }

  async function valider() {
    setTente(true)
    if (Object.values(erreurs).some(Boolean)) {
      haptique.erreur()
      return
    }
    setEnvoi(true)
    setErreur(null)
    try {
      await changerMotDePasse(ancien, nouveau)
      haptique.succes()
      fermer(true)
    } catch (e) {
      haptique.erreur()
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Feuille ouverte={ouverte} onFermer={() => fermer(false)} titre="Mot de passe">
      <form className="ipm-formulaire" noValidate onSubmit={(e) => e.preventDefault()}>
        <Saisie
          libelle="Mot de passe actuel"
          type="password"
          icone={lockClosedOutline}
          autoComplete="current-password"
          enterKeyHint="next"
          valeur={ancien}
          erreur={affichees.ancien}
          onChanger={setAncien}
        />
        <Saisie
          libelle="Nouveau mot de passe"
          type="password"
          placeholder="8 caractères, lettres et chiffres"
          icone={lockClosedOutline}
          autoComplete="new-password"
          enterKeyHint="next"
          valeur={nouveau}
          erreur={affichees.nouveau}
          onChanger={setNouveau}
        />
        <Saisie
          libelle="Confirmer le nouveau mot de passe"
          type="password"
          icone={lockClosedOutline}
          autoComplete="new-password"
          enterKeyHint="go"
          valeur={confirmation}
          erreur={affichees.confirmation}
          onChanger={setConfirmation}
          onEntree={() => void valider()}
        />
        {erreur && (
          <p className="ipm-feuille__texte ipm-feuille__texte--erreur" role="alert">
            {erreur}
          </p>
        )}
        <div className="ipm-feuille__boutons">
          <BoutonPrincipal occupe={envoi} onClick={() => void valider()}>
            Enregistrer
          </BoutonPrincipal>
        </div>
      </form>
    </Feuille>
  )
}

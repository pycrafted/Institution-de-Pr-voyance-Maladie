/**
 * Hôte des assistants de demande (bon de pharmacie, bon d'optique, lettre de garantie) et
 * moyen de les ouvrir de n'importe où.
 *
 *   const { ouvrirNouveauBon, ouvrirAssistant } = useNouveauBon()
 *   <IonButton onClick={ouvrirNouveauBon}>Nouveau bon de pharmacie</IonButton>
 *   ouvrirAssistant('lettre-garantie')
 *
 * Les assistants sont src/pages/NouveauBon/, src/pages/NouveauBonOptique/ et
 * src/pages/NouvelleLettre/ ;
 * une fois le document créé, on l'ajoute à la liste partagée, on ferme le
 * modal et on ouvre son détail.
 */

import { IonModal, useIonRouter } from '@ionic/react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { memoriserBon } from '../data/bons'
import NouveauBon from '../pages/NouveauBon'
import NouveauBonOptique from '../pages/NouveauBonOptique'
import NouvelleLettre from '../pages/NouvelleLettre'
import type { Bon, GenreDocument } from '../types/api'
import { cheminDocument } from '../utils/documents'

interface ContexteNouveauBon {
  /** Sans argument : peut servir tel quel de gestionnaire de toucher. */
  ouvrirNouveauBon: () => void
  ouvrirAssistant: (genre: GenreDocument) => void
}

const Contexte = createContext<ContexteNouveauBon | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useNouveauBon(): ContexteNouveauBon {
  const contexte = useContext(Contexte)
  if (!contexte) throw new Error('useNouveauBon() hors de <NouveauBonProvider>.')
  return contexte
}

/** À placer sous IonReactRouter (la navigation vers le détail en a besoin). */
export function NouveauBonProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const [genre, setGenre] = useState<GenreDocument>('bon-pharmacie')
  // Clé changée à chaque ouverture : l'assistant repart d'une page blanche.
  const [cle, setCle] = useState(0)
  const routeur = useIonRouter()

  const ouvrirAssistant = useCallback((choisi: GenreDocument) => {
    setGenre(choisi)
    setCle((c) => c + 1)
    setOuvert(true)
  }, [])
  const ouvrirNouveauBon = useCallback(() => ouvrirAssistant('bon-pharmacie'), [ouvrirAssistant])

  const fermer = useCallback(() => setOuvert(false), [])

  const surCree = useCallback(
    (document: Bon) => {
      memoriserBon(document)
      setOuvert(false)
      routeur.push(cheminDocument(document), 'forward', 'push')
    },
    [routeur],
  )

  const valeur = useMemo(
    () => ({ ouvrirNouveauBon, ouvrirAssistant }),
    [ouvrirNouveauBon, ouvrirAssistant],
  )

  return (
    <Contexte.Provider value={valeur}>
      {children}
      <IonModal isOpen={ouvert} onDidDismiss={fermer} className="ipm-modal-nouveau-bon">
        {/* IonModal ne monte son contenu que présenté : rien n'est chargé avant l'ouverture. */}
        {genre === 'lettre-garantie' ? (
          <NouvelleLettre key={cle} onFermer={fermer} onCree={surCree} />
        ) : genre === 'bon-optique' ? (
          <NouveauBonOptique key={cle} onFermer={fermer} onCree={surCree} />
        ) : (
          <NouveauBon key={cle} onFermer={fermer} onCree={surCree} />
        )}
      </IonModal>
    </Contexte.Provider>
  )
}

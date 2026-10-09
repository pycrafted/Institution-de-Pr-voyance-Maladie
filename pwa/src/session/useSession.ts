import { useContext } from 'react'

import { SessionContext, type Session } from './SessionContext'

/** La session courante. À n'utiliser que sous <SessionProvider> (cf. App.tsx). */
export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession() hors de <SessionProvider>.')
  return session
}

/**
 * Le participant identifié. À n'utiliser que dans les écrans protégés par la
 * garde d'identification (onglets, détail, assistant), où il existe toujours.
 */
export function useParticipant() {
  const { participant, beneficiaires } = useSession()
  if (!participant) throw new Error('useParticipant() sans session identifiée.')
  return { participant, beneficiaires }
}

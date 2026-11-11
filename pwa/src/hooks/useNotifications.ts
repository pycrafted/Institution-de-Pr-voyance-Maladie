/**
 * Les notifications de l'employé : les décisions de l'IPM sur ses demandes
 * (photo réinitialisée ou conservée, bon d'optique accordé ou refusé).
 *
 * Le serveur les calcule ; le téléphone retient seul jusqu'où il les a déjà
 * montrées (date de la plus récente lue, dans localStorage). Elles se relisent
 * au lancement, toutes les deux minutes et à chaque ouverture de la cloche.
 */

import { useCallback, useEffect, useState } from 'react'

import { listerNotifications } from '../api'
import type { NotificationMobile } from '../types/api'
import { useOnline } from './useOnline'

const CLE_LU = 'ipm-notifications-lu'
const RELECTURE_MS = 120_000

function lireLu(): string {
  try {
    return window.localStorage.getItem(CLE_LU) ?? ''
  } catch {
    return ''
  }
}

export function useNotifications() {
  const enLigne = useOnline()
  const [notifications, setNotifications] = useState<NotificationMobile[]>([])
  const [lu, setLu] = useState(lireLu)

  const relire = useCallback(async () => {
    try {
      setNotifications(await listerNotifications())
    } catch {
      // Hors ligne ou serveur endormi : on garde ce qu'on avait.
    }
  }, [])

  useEffect(() => {
    if (!enLigne) return undefined
    void relire()
    const minuteur = window.setInterval(() => void relire(), RELECTURE_MS)
    return () => window.clearInterval(minuteur)
  }, [enLigne, relire])

  const nonLues = notifications.filter((n) => n.date > lu).length

  /** Tout ce qui est affiché est désormais lu. */
  const marquerLues = useCallback(() => {
    const plusRecente = notifications[0]?.date
    if (!plusRecente) return
    try {
      window.localStorage.setItem(CLE_LU, plusRecente)
    } catch {
      // Stockage indisponible (navigation privée) : la pastille reviendra.
    }
    setLu(plusRecente)
  }, [notifications])

  return { notifications, nonLues, relire, marquerLues, lu }
}

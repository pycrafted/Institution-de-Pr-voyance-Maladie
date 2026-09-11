/**
 * Système de toasts simple basé sur un événement global.
 * Le composant <ToastHost /> écoute et affiche les toasts.
 *
 * Usage : import { toast } from 'src/services/toast'
 *   toast.success('Produit créé')
 *   toast.error('Échec...')
 */

const EVENT_NAME = 'sar-fds-toast'

function push(level, message) {
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { level, message, id: Date.now() + Math.random() } }),
  )
}

export const toast = {
  success: (msg) => push('success', msg),
  info: (msg) => push('info', msg),
  warning: (msg) => push('warning', msg),
  error: (msg) => push('danger', msg),
  _eventName: EVENT_NAME,
}

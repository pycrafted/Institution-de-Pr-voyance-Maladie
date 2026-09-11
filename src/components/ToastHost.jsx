/**
 * Hôte de toasts : monté une fois dans le layout, écoute les événements
 * émis par `toast.success/info/warning/error` et les affiche en bas à droite.
 */

import React, { useEffect, useRef, useState } from 'react'
import { CToast, CToastBody, CToastClose, CToaster } from '@coreui/react'

import { toast } from '../services/toast'

const ToastHost = () => {
  const [items, setItems] = useState([])
  const toasterRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      const { level, message, id } = e.detail
      setItems((prev) => [...prev, { id, level, message }])
    }
    window.addEventListener(toast._eventName, handler)
    return () => window.removeEventListener(toast._eventName, handler)
  }, [])

  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id))

  return (
    <CToaster ref={toasterRef} placement="bottom-end" className="p-3">
      {items.map((it) => (
        <CToast
          key={it.id}
          autohide
          delay={4000}
          visible
          color={it.level}
          className="text-white align-items-center"
          onClose={() => removeItem(it.id)}
        >
          <div className="d-flex">
            <CToastBody>{it.message}</CToastBody>
            <CToastClose className="me-2 m-auto" white />
          </div>
        </CToast>
      ))}
    </CToaster>
  )
}

export default ToastHost

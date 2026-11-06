/**
 * DefaultLayout - le gabarit des écrans de l'application.
 *
 * Deux barres, et plus de menu latéral (2026-11-05) :
 *
 *   - **AppHeader**, en haut : le logo, les cinq sections, les trois icônes
 *     du compte ;
 *   - **AppNavPages**, en bas de l'écran : les pages de la section ouverte.
 *
 * Pourquoi la colonne de gauche a disparu : les écrans de l'IPM sont larges -
 * onze colonnes sur un aperçu d'écritures, sept sur les retenues - et le menu
 * prenait 15 % de la largeur en permanence pour une liste qu'on consulte
 * trois fois par jour. La même navigation à l'horizontale rend cette place au
 * tableau, et c'est le gabarit d'OpsDigital, que le métier a déjà sous les
 * yeux.
 */

import React from 'react'

import AppContent from '../components/AppContent'
import AppHeader from '../components/AppHeader'
import AppNavPages from '../components/AppNavPages'
import ToastHost from '../components/ToastHost'
import ApercuPdf from '../components/ApercuPdf'

const DefaultLayout = () => {
  return (
    <>
      <AppHeader />
      <div className="wrapper d-flex flex-column">
        <div className="body flex-grow-1 pt-3">
          <AppContent />
        </div>
        <ToastHost />
        {/* Aperçu des documents imprimés, ouvert par `ouvrirApercu`. */}
        <ApercuPdf />
      </div>
      <AppNavPages />
    </>
  )
}

export default DefaultLayout

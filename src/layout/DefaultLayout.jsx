/**
 * DefaultLayout - le gabarit des écrans de l'application.
 *
 * Une barre et un menu (2026-11-26) :
 *
 *   - **AppHeader**, en haut : le logo et les icônes du compte ;
 *   - **AppMenu**, à gauche : les cinq sections, chacune dépliable sur ses
 *     pages.
 *
 * **Le menu de gauche est de retour**, à la demande du métier. Entre le
 * 2026-11-05 et aujourd'hui, la navigation tenait dans deux barres
 * horizontales - les sections au centre de l'en-tête, les pages dans un
 * bandeau juste en dessous - pour rendre au tableau les 15 % de largeur que
 * prenait la colonne. Les écrans de l'IPM sont larges et l'argument tenait ;
 * les gens de l'IPM préfèrent néanmoins retrouver les sections à gauche,
 * comme dans l'application d'origine, et c'est leur outil.
 *
 * **Le menu et le contenu forment UN bloc** (`.app-gabarit`), et non deux
 * objets posés côte à côte. Le menu a d'abord été fixé à la fenêtre : il
 * restait en place pendant que la carte défilait, et l'on voyait bien deux
 * composants distincts qui se décalaient l'un par rapport à l'autre. Dans le
 * flux, la colonne grise prend exactement la hauteur de la carte, et tout
 * défile ensemble.
 *
 * Le retrait de la page (1 rem en haut, 1,5 rem sur les côtés) est porté par
 * le gabarit et non plus par le conteneur de <AppContent /> : il doit
 * entourer les DEUX, sinon il se glisserait entre eux.
 */

import React from 'react'

import AppContent from '../components/AppContent'
import AppHeader from '../components/AppHeader'
import AppMenu from '../components/AppMenu'
import ToastHost from '../components/ToastHost'
import ApercuPdf from '../components/ApercuPdf'

const DefaultLayout = () => {
  return (
    <>
      <AppHeader />
      <div className="wrapper d-flex flex-column">
        <div className="body flex-grow-1 pt-3">
          <div className="app-gabarit">
            <AppMenu />
            <div className="app-gabarit-contenu">
              <AppContent />
            </div>
          </div>
        </div>
        <ToastHost />
        {/* Aperçu des documents imprimés, ouvert par `ouvrirApercu`. */}
        <ApercuPdf />
      </div>
    </>
  )
}

export default DefaultLayout

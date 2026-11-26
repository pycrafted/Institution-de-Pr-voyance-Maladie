/**
 * Page « Données de base ».
 *
 * Ce n'est pas une page mais un conteneur de référentiels : chaque carte du
 * bandeau est une petite nomenclature (types de prestations, spécialités,
 * journaux…) qui sert de vocabulaire au reste de l'application.
 *
 * Les nomenclatures sont en cartes sur une ligne plutôt qu'en onglets
 * défilants : toutes restent visibles d'un coup d'œil, et une nomenclature de
 * plus resserre les autres au lieu de se cacher derrière une flèche. Elles
 * tenaient une colonne à gauche jusqu'au 2026-11-26 ; cette place est
 * maintenant celle du menu de l'application.
 */

import React, { useMemo, useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'

import { FAMILLES, REFERENTIELS } from './config'
import Referentiel from './Referentiel'
import './donnees-de-base.scss'
import './nomenclatures.scss'

/**
 * Combien de lignes un référentiel montre, sur les `total` qu'il possède.
 *
 * **Dix lignes, quel que soit le référentiel.** Rien n'est retiré de la base
 * ni du serveur : les 6 009 médicaments y sont tous, l'API les renvoie tous,
 * les autres écrans les voient. Seule cette page restreint ce qu'elle
 * affiche, et elle le fait ici, côté navigateur.
 *
 * **Tout visible (2026-11-12).** La restriction à dix lignes datait de la
 * base de démonstration ; sur les vraies nomenclatures LAMPS (6 009
 * médicaments, les spécialités, les actes…), l'app les montre toutes, la
 * pagination prenant le relais.
 *
 * **Pour re-restreindre, remettre un nombre ici** (c'est la seule fonction à
 * toucher) ; `Infinity` montre tout.
 */
const LIGNES_VISIBLES = Infinity
const lignesVisibles = (total) => Math.min(total, LIGNES_VISIBLES)

const DonneesDeBase = () => {
  const [cleActive, setCleActive] = useState(REFERENTIELS[0].cle)

  /**
   * Toutes les nomenclatures de la page partagent la même barre compacte :
   * recherche et outils sur une ligne, le bouton de création poussé à droite.
   * Posé ici plutôt que dans chacune des configs : c'est un choix de la page,
   * pas de tel ou tel référentiel.
   *
   * Dans le `useMemo` et non à l'appel : un objet neuf à chaque rendu ferait
   * croire au composant que son référentiel a changé.
   */
  const referentielActif = useMemo(() => {
    const referentiel = REFERENTIELS.find((r) => r.cle === cleActive) || REFERENTIELS[0]
    return {
      ...referentiel,
      barreCompacte: true,
      // Recherche soulignée, sans cadre ni loupe, comme sur les fournisseurs.
      champsSoulignes: true,
      // La recherche ouvre toujours la barre, tout à gauche : les listes à
      // segments (Structure, Médicaments) envoient leur sélecteur à droite,
      // contre le bouton de création.
      segmentsADroite: true,
      // Les actions de lot (Exclure, Réintégrer, Désactiver, pour les
      // médicaments) se montrent EN PERMANENCE dans le pied du panneau,
      // pâles tant qu'aucune ligne n'est cochée - comme sur les Règlements et
      // les Remboursements. Sans cela elles n'apparaîtraient qu'une fois une
      // ligne cochée, derrière une barre noire qui n'est plus la langue de
      // cette page depuis la refonte.
      actionsLotEnBarre: true,
      // Pas de pastille « Total : N » accolée au titre : la pagination, au
      // pied du tableau, dit déjà le compte de la vue - segment et recherche
      // compris. C'est la règle des autres écrans depuis la refonte.
      // Ce que la page accepte de montrer (cf. lignesVisibles ci-dessus).
      limiteAffichage: lignesVisibles,
      // On modifie en cliquant la ligne (le panneau s'ouvre) : pas de crayon,
      // et la ligne en cours d'édition se colore en rouge. Comme les fournisseurs.
      modificationParLigne: true,
    }
  }, [cleActive])

  const famillesAffichees = useMemo(
    () =>
      FAMILLES.map((famille) => ({
        ...famille,
        referentiels: REFERENTIELS.filter((r) => r.famille === famille.cle),
      })).filter((f) => f.referentiels.length > 0),
    [],
  )

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="ddb-grille">
          {/* Le RAIL des nomenclatures, qui tenait la colonne de gauche,
              est parti le 2026-11-26 : les cartes ci-dessous disent la même
              chose, et le menu de l'application a repris cette place. Deux
              colonnes à gauche auraient coûté un tiers de la largeur du
              tableau pour une navigation écrite deux fois. */}

          {/* ---- Le référentiel sélectionné ---- */}
          <section className="ddb-contenu ndb-page">
            {/* Les nomenclatures en cartes, au-dessus de la liste, dans la
                langue des onglets de Fournisseurs de Soins : carte à pointe,
                la retenue à l'accent. */}
            <nav className="ndb-cartes" aria-label="Nomenclatures">
              {famillesAffichees
                .flatMap((famille) => famille.referentiels)
                .map((ref) => (
                  <button
                    key={ref.cle}
                    type="button"
                    className={`ndb-carte${ref.cle === cleActive ? ' ndb-carte-active' : ''}`}
                    aria-current={ref.cle === cleActive ? 'page' : undefined}
                    onClick={() => setCleActive(ref.cle)}
                  >
                    <span className="ndb-carte-libelle">{ref.libelle}</span>
                  </button>
                ))}
            </nav>

            <Referentiel key={referentielActif.cle} referentiel={referentielActif} />
          </section>
        </div>
      </CCardBody>
    </CCard>
  )
}

export default DonneesDeBase

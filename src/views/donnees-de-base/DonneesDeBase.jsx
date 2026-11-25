/**
 * Page « Données de base ».
 *
 * Ce n'est pas une page mais un conteneur de référentiels : chaque entrée de
 * la liste de gauche est une petite nomenclature (types de prestations,
 * spécialités, journaux…) qui sert de vocabulaire au reste de l'application.
 *
 * La liste est verticale plutôt qu'en onglets défilants : tous les
 * référentiels restent visibles d'un coup d'œil, et la section peut grandir
 * sans que rien ne se cache derrière des flèches.
 */

import React, { useMemo, useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'

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
          {/* ---- Colonne gauche : les référentiels disponibles ---- */}
          <aside className="ddb-rail">
            <nav className="ddb-rail-liste">
              {famillesAffichees.map((famille) => (
                <div key={famille.cle} className="ddb-rail-famille">
                  <div className="ddb-rail-famille-titre">{famille.libelle}</div>
                  {famille.referentiels.map((ref) => (
                    <button
                      type="button"
                      key={ref.cle}
                      className={`ddb-rail-item${ref.cle === cleActive ? ' ddb-rail-item-actif' : ''}`}
                      onClick={() => setCleActive(ref.cle)}
                    >
                      <CIcon icon={ref.icone} className="ddb-rail-item-icone" />
                      <span className="ddb-rail-item-libelle">{ref.libelle}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </aside>

          {/* ---- Colonne droite : le référentiel sélectionné ---- */}
          <section className="ddb-contenu ndb-page">
            <Referentiel key={referentielActif.cle} referentiel={referentielActif} />
          </section>
        </div>
      </CCardBody>
    </CCard>
  )
}

export default DonneesDeBase

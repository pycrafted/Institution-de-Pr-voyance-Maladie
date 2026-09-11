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

const DonneesDeBase = () => {
  const [cleActive, setCleActive] = useState(REFERENTIELS[0].cle)

  /**
   * Toutes les nomenclatures de la page partagent la même barre compacte :
   * total, recherche et outils sur une ligne, le bouton de création poussé à
   * droite — comme les demandes d'agrément. Posé ici plutôt que dans chacune
   * des configs : c'est un choix de la page, pas de tel ou tel référentiel.
   *
   * Le total est celui de la vue — segment et recherche compris. Il ne se
   * nomme pas : le titre juste au-dessus dit déjà de quoi il est le compte.
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
      stats: (entrees) => `Total : ${entrees.length}`,
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
          <section className="ddb-contenu">
            <Referentiel key={referentielActif.cle} referentiel={referentielActif} />
          </section>
        </div>
      </CCardBody>
    </CCard>
  )
}

export default DonneesDeBase

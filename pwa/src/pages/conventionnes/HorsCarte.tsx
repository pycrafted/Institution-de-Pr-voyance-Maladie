/**
 * Les structures conventionnées SANS position : elles ne peuvent pas être un
 * point de la carte, mais restent conventionnées. Un bouton posé sur la carte
 * (« 19 hors carte ») les annonce, en suivant le filtre choisi ; il ouvre une
 * feuille qui les liste - nom, spécialité, adresse, et l'appel.
 */

import { IonIcon } from '@ionic/react'
import { callOutline, listOutline, locationOutline } from 'ionicons/icons'
import { useState } from 'react'

import Feuille from '../../components/Feuille'
import { haptique } from '../../hooks/haptique'
import type { Conventionne } from '../../types/api'
import { telephone as formaterTelephone } from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import { libelleSpecialite, lienTelephone, nomStructure } from './recherche'

export default function HorsCarte({ structures }: { structures: readonly Conventionne[] }) {
  const [ouverte, setOuverte] = useState(false)
  if (structures.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="conventionnes__hors-carte ipm-appui"
        onClick={() => {
          haptique.leger()
          setOuverte(true)
        }}
      >
        <IonIcon icon={listOutline} aria-hidden="true" />
        {structures.length} hors carte
      </button>

      <Feuille ouverte={ouverte} onFermer={() => setOuverte(false)} titre="Structures hors carte">
        <p className="conventionnes__hors-carte-intro">
          Conventionnées, mais pas encore placées sur la carte.
        </p>
        <ul className="conventionnes__hors-carte-liste">
          {structures.map((structure) => {
            const nom = nomStructure(structure)
            const adresse = nomPropre(structure.adresse)
            const lien = lienTelephone(structure.telephone)
            return (
              <li key={structure.code} className="conventionnes__hors-carte-ligne">
                <div className="conventionnes__hors-carte-textes">
                  <p className="conventionnes__hors-carte-nom">{nom}</p>
                  <p className="conventionnes__hors-carte-detail">
                    {libelleSpecialite(structure.specialite?.libelle)}
                  </p>
                  {adresse && (
                    <p className="conventionnes__hors-carte-detail">
                      <IonIcon icon={locationOutline} aria-hidden="true" /> {adresse}
                    </p>
                  )}
                  {lien && (
                    <p className="conventionnes__hors-carte-detail ipm-chiffres">
                      {formaterTelephone(structure.telephone)}
                    </p>
                  )}
                </div>
                {lien && (
                  <a
                    className="conventionnes__icone ipm-appui"
                    href={lien}
                    aria-label={`Appeler ${nom}`}
                    onClick={() => haptique.leger()}
                  >
                    <IonIcon icon={callOutline} aria-hidden="true" />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </Feuille>
    </>
  )
}

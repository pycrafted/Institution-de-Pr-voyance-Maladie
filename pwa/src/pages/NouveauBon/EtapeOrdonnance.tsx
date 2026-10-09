/**
 * Étape 4 : l'ordonnance. Sa date, choisie aux roues (de J-30 à aujourd'hui,
 * comme l'exige IPM), et le nombre d'articles prescrits, au compteur (1 à 8 :
 * le bon imprimé n'a que 8 lignes). La lettre de garantie la réemploie pour
 * la seule date de sa prescription, sans compteur.
 *
 * Refonte : deux cartes autonomes (§3.5) sous leur titre de section, et les
 * raccourcis « Aujourd'hui » / « Hier » en PUCES PILULES de la charte (§3.6)
 * — l'assistant n'a plus un seul bouton rectangulaire d'Ionic.
 */

import { IonDatetime, IonIcon } from '@ionic/react'
import { add, remove } from 'ionicons/icons'
import { useId } from 'react'

import PucesFiltre from '../../components/PucesFiltre'
import { haptique } from '../../hooks/haptique'
import type { DateISO } from '../../types/api'
import { ajouterJours, dateLongue } from '../../utils/format'
import Alerte from './Alerte'
import { ARTICLES_MAX, ARTICLES_MIN, bornesDate } from './assistant'

interface Props {
  aujourdhui: DateISO
  date: DateISO
  nbArticles?: number
  erreurDate?: string
  erreurArticles?: string
  onDate: (date: DateISO) => void
  /** Sans compteur (lettre de garantie) : la date seule. */
  onArticles?: (nombre: number) => void
  /** Ce que la date désigne : l'ordonnance (défaut) ou la prescription. */
  libelles?: { titre: string; roues: string; aide: string }
}

const LIBELLES_ORDONNANCE = {
  titre: 'Date de l’ordonnance',
  roues: 'Date de l’ordonnance',
  aide: 'Une ordonnance est acceptée pendant 30 jours.',
}

export default function EtapeOrdonnance(props: Props) {
  const { aujourdhui, date, nbArticles = 1, onDate, onArticles } = props
  const libelles = props.libelles ?? LIBELLES_ORDONNANCE
  const { min, max } = bornesDate(aujourdhui)
  const idDate = useId()
  const idArticles = useId()
  const hier = ajouterJours(aujourdhui, -1)

  const changerArticles = (nombre: number) => {
    haptique.selection()
    onArticles?.(nombre)
  }

  return (
    <>
      <section className="ipm-section" aria-labelledby={idDate}>
        <h3 id={idDate} className="ipm-titre-section">
          {libelles.titre}
        </h3>
        <div className="ipm-gouttiere nouveau-bon__bloc">
          <div className="ipm-carte nouveau-bon__carte-date">
            <p className="nouveau-bon__date-choisie ipm-chiffres" aria-live="polite">
              {dateLongue(date)}
            </p>
            {/* Les deux dates de très loin les plus fréquentes, d'un geste. */}
            <PucesFiltre
              className="nouveau-bon__raccourcis"
              etiquette="Dates fréquentes"
              puces={[
                { cle: aujourdhui, libelle: 'Aujourd’hui' },
                { cle: hier, libelle: 'Hier' },
              ]}
              active={date}
              onChanger={onDate}
            />
            <IonDatetime
              presentation="date"
              preferWheel
              locale="fr-FR"
              min={min}
              max={max}
              value={date}
              aria-label={libelles.roues}
              className="nouveau-bon__roues"
              onIonChange={(e) => {
                const valeur = Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value
                // IonDatetime peut rendre une date-heure : seule la date compte.
                if (typeof valeur === 'string' && valeur.length >= 10) onDate(valeur.slice(0, 10))
              }}
            />
          </div>
          <p className="nouveau-bon__aide">{libelles.aide}</p>
          {props.erreurDate && <Alerte message={props.erreurDate} />}
        </div>
      </section>

      {onArticles && (
        <section className="ipm-section" aria-labelledby={idArticles}>
          <h3 id={idArticles} className="ipm-titre-section">
            Nombre d’articles prescrits
          </h3>
          <div className="ipm-gouttiere nouveau-bon__bloc">
            <div className="ipm-carte nouveau-bon__compteur">
              <button
                type="button"
                className="nouveau-bon__compteur-bouton ipm-appui"
                aria-label="Retirer un article"
                disabled={nbArticles <= ARTICLES_MIN}
                onClick={() => changerArticles(nbArticles - 1)}
              >
                <IonIcon icon={remove} aria-hidden="true" />
              </button>
              <div
                className="nouveau-bon__compteur-valeur"
                role="spinbutton"
                aria-label="Nombre d’articles"
                aria-valuemin={ARTICLES_MIN}
                aria-valuemax={ARTICLES_MAX}
                aria-valuenow={nbArticles}
                aria-valuetext={`${nbArticles} article${nbArticles > 1 ? 's' : ''}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  // Clavier (lecteurs d'écran) : flèches haut/bas comme un vrai compteur.
                  if (e.key === 'ArrowUp' && nbArticles < ARTICLES_MAX)
                    changerArticles(nbArticles + 1)
                  if (e.key === 'ArrowDown' && nbArticles > ARTICLES_MIN)
                    changerArticles(nbArticles - 1)
                }}
              >
                <span className="nouveau-bon__compteur-chiffre ipm-chiffres">{nbArticles}</span>
                <span className="nouveau-bon__compteur-unite">
                  article{nbArticles > 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                className="nouveau-bon__compteur-bouton ipm-appui"
                aria-label="Ajouter un article"
                disabled={nbArticles >= ARTICLES_MAX}
                onClick={() => changerArticles(nbArticles + 1)}
              >
                <IonIcon icon={add} aria-hidden="true" />
              </button>
            </div>
            <p className="nouveau-bon__aide">
              {nbArticles >= ARTICLES_MAX
                ? `${ARTICLES_MAX} articles au plus : le bon imprimé n’a que ${ARTICLES_MAX} lignes.`
                : 'Comptez chaque médicament de l’ordonnance.'}
            </p>
            {props.erreurArticles && <Alerte message={props.erreurArticles} />}
          </div>
        </section>
      )}
    </>
  )
}

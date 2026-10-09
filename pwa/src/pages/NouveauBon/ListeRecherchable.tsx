/**
 * Liste de choix avec recherche, commune aux spécialités, prescripteurs et
 * pharmacies.
 *
 * Refonte (§1) : plus d'`IonList`/`IonItem` à filets ni d'`IonSearchbar`. La
 * recherche est le CHAMP de la charte (§3.8), chaque proposition est une
 * CARTE autonome (§3.5) dans une pile espacée de 12, et les intercalaires
 * alphabétiques — qui rendent une longue liste de pharmacies parcourable
 * comme l'application Contacts — sont devenus des titres de section.
 *
 * Toucher un élément le choisit : l'assistant passe seul à la suite.
 */

import { IonIcon } from '@ionic/react'
import { checkmarkCircle, cloudOfflineOutline, searchOutline } from 'ionicons/icons'
import { useMemo, useState, type ReactNode } from 'react'

import CarteListe from '../../components/CarteListe'
import Champ from '../../components/Champ'
import EtatVide from '../../components/EtatVide'
import { SqueletteCarte } from '../../components/Skeletons'
import { pluriel } from '../../utils/format'
import { correspond, grouperParLettre } from './assistant'

/** Au-delà, la liste reçoit des intercalaires alphabétiques. */
const SEUIL_INTERCALAIRES = 12

export interface ListeRecherchableProps<T> {
  elements: T[] | null
  chargement: boolean
  erreur: string | null
  onReessayer: () => void
  /** Identifiant stable d'un élément (son code). */
  cle: (element: T) => string
  titre: (element: T) => string
  sousTitre?: (element: T) => ReactNode
  /** Petite mention à droite (« 12 prescripteurs »). */
  note?: (element: T) => string | undefined
  /** Textes dans lesquels la recherche fouille. */
  textesRecherche: (element: T) => (string | null | undefined)[]
  /** Clé de l'élément déjà choisi, s'il y en a un. */
  selection: string | null
  onChoisir: (element: T) => void
  /** Libellé 13/600 posé au-dessus du champ de recherche (§3.8). */
  libelleRecherche: string
  placeholder: string
  /** Nom de la liste pour les lecteurs d'écran (« Pharmacies »). */
  nomListe: string
  /**
   * Nom court et stable de la liste, posé en `data-liste` : c'est la prise
   * des tests de bout en bout, comme `data-service` sur l'accueil. Le libellé
   * lu par le lecteur d'écran, lui, change avec la spécialité choisie.
   */
  cleListe: string
  /** « pharmacie » / « pharmacies » : compte des résultats. */
  mot: [singulier: string, pluriel: string]
  icone: string
  /** Liste vide côté serveur. */
  vide: { titre: string; message: string }
}

export default function ListeRecherchable<T>(props: ListeRecherchableProps<T>) {
  const { elements, chargement, erreur, onReessayer, cle, titre, textesRecherche, placeholder } =
    props
  const [recherche, setRecherche] = useState('')

  const trouves = useMemo(
    () => (elements ?? []).filter((e) => correspond(recherche, ...textesRecherche(e))),
    // textesRecherche est une fonction en ligne : la liste et le texte suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elements, recherche],
  )

  let contenu: ReactNode
  if (elements === null && erreur) {
    contenu = (
      <EtatVide
        icone={cloudOfflineOutline}
        teinte="annule"
        titre="Chargement impossible"
        message={erreur}
        action={{ libelle: 'Réessayer', onClick: onReessayer }}
      />
    )
  } else if (elements === null || (chargement && elements.length === 0)) {
    contenu = (
      <div className="ipm-pile" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <SqueletteCarte key={i} hauteur={72} />
        ))}
      </div>
    )
  } else if (elements.length === 0) {
    contenu = (
      <EtatVide
        icone={props.icone}
        teinte="neutre"
        titre={props.vide.titre}
        message={props.vide.message}
      />
    )
  } else if (trouves.length === 0) {
    contenu = (
      <EtatVide
        icone={searchOutline}
        teinte="neutre"
        titre="Aucun résultat"
        message={`Rien ne correspond à « ${recherche.trim()} ». Vérifiez l’orthographe ou essayez un autre mot.`}
      />
    )
  } else if (!recherche.trim() && trouves.length > SEUIL_INTERCALAIRES) {
    // Liste longue au repos : une section par initiale, titres de section de
    // la charte — jamais l'`IonItemDivider` gris à filet.
    contenu = (
      <div aria-label={props.nomListe}>
        {grouperParLettre(trouves, titre).map((groupe) => (
          <section key={groupe.lettre} className="nouveau-bon__groupe">
            <h3 className="ipm-titre-section">{groupe.lettre}</h3>
            {/* Une liste par initiale : les `listitem` restent enfants directs
                de leur `list`, sinon les lecteurs d'écran ne comptent rien. */}
            <div
              className="ipm-pile"
              role="list"
              aria-label={`${props.nomListe} en ${groupe.lettre}`}
            >
              {groupe.elements.map((element, i) => (
                <Carte key={cle(element)} {...props} element={element} rang={i} />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  } else {
    contenu = (
      <div className="ipm-pile" role="list" aria-label={props.nomListe}>
        {trouves.map((element, i) => (
          <Carte key={cle(element)} {...props} element={element} rang={i} />
        ))}
      </div>
    )
  }

  const compte =
    elements && elements.length > 0 && recherche.trim() && trouves.length > 0
      ? pluriel(trouves.length, ...props.mot)
      : null

  return (
    <>
      {/* Rien à chercher tant que la liste n'est pas là : le champ n'apparaît
          qu'une fois les propositions chargées. */}
      {elements !== null && elements.length > 0 && (
        <div className="nouveau-bon__recherche ipm-gouttiere">
          <Champ
            libelle={props.libelleRecherche}
            valeur={recherche}
            onChanger={setRecherche}
            placeholder={placeholder}
            icone={searchOutline}
            type="search"
            inputmode="search"
            enterkeyhint="search"
          />
          {compte && (
            <p className="nouveau-bon__compte" aria-live="polite">
              {compte}
            </p>
          )}
        </div>
      )}
      <div className="nouveau-bon__liste" data-liste={props.cleListe}>
        {contenu}
      </div>
    </>
  )
}

function Carte<T>(props: ListeRecherchableProps<T> & { element: T; rang: number }) {
  const { element, cle, titre, sousTitre, note, selection, onChoisir, icone, rang } = props
  const choisi = selection !== null && selection === cle(element)
  const sous = sousTitre?.(element)
  const mention = note?.(element)
  const libelle = titre(element)
  return (
    <div role="listitem">
      <CarteListe
        rang={rang}
        icone={icone}
        teinte={choisi ? 'rouge' : 'neutre'}
        titre={libelle}
        details={sous}
        meta={mention}
        puce={
          choisi ? (
            <IonIcon className="nouveau-bon__coche" icon={checkmarkCircle} aria-hidden="true" />
          ) : undefined
        }
        chevron={!choisi}
        etiquette={`${libelle}${mention ? `, ${mention}` : ''}${choisi ? '. Choix actuel' : ''}`}
        className={choisi ? 'nouveau-bon__carte--choisie' : undefined}
        onClick={() => onChoisir(element)}
      />
    </div>
  )
}

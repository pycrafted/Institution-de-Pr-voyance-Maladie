/**
 * Les briques des formulaires de demande (bon de pharmacie, lettre de
 * garantie) : une SECTION titrée, un MENU déroulant, un champ de saisie.
 *
 * Elles reprennent la forme des écrans web correspondants - un titre en
 * petites capitales sur un filet, puis les champs - pour que le même
 * document se demande de la même façon des deux côtés.
 *
 * Le menu est un `select` NATIF : sur le téléphone il ouvre le sélecteur du
 * système, celui que l'employé connaît, et il reste accessible au clavier
 * sans rien coder. On ne lui reprend que le cadre.
 */

import { IonIcon } from '@ionic/react'
import { chevronDown } from 'ionicons/icons'
import type { ReactNode, Ref } from 'react'

export function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="ipm-formulaire__section">
      <h2 className="ipm-formulaire__titre">{titre}</h2>
      {children}
    </section>
  )
}

export interface Option {
  valeur: string
  libelle: string
  /**
   * Titre du groupe sous lequel ranger cette option et les suivantes. Le
   * `select` natif le rend en `optgroup` : l'employé voit d'abord ce qui le
   * concerne, le reste suit sans disparaître.
   */
  groupe?: string
}

interface PropsChoix {
  libelle: string
  requis?: boolean
  valeur: string
  options: Option[]
  desactive?: boolean
  chargement?: boolean
  erreur?: string | null
  onReessayer?: () => void
  onChanger: (valeur: string) => void
}

/**
 * Découpe les options en tranches successives selon leur `groupe`, dans
 * l'ordre reçu : l'API a déjà rangé la liste, on ne la retrie pas.
 */
function grouper(options: Option[]): [string | undefined, Option[]][] {
  const tranches: [string | undefined, Option[]][] = []
  for (const option of options) {
    const derniere = tranches[tranches.length - 1]
    if (derniere && derniere[0] === option.groupe) derniere[1].push(option)
    else tranches.push([option.groupe, [option]])
  }
  return tranches
}

export function Choix({
  libelle,
  requis,
  valeur,
  options,
  desactive,
  chargement,
  erreur,
  onReessayer,
  onChanger,
}: PropsChoix) {
  const id = `champ-${libelle.toLocaleLowerCase('fr-FR').replace(/[^a-z]+/g, '-')}`
  return (
    <div className="ipm-formulaire__champ">
      <label className="ipm-formulaire__libelle" htmlFor={id}>
        {libelle}
        {requis && <span className="ipm-formulaire__requis"> *</span>}
      </label>
      <div className="ipm-formulaire__cadre">
        <select
          id={id}
          className="ipm-formulaire__saisie"
          value={valeur}
          disabled={desactive || chargement || options.length === 0}
          onChange={(e) => onChanger(e.target.value)}
        >
          {/* Le meme mot que l'ecran web : « Choisir... » quand le champ est
              exige, « - Aucun - » quand il peut rester vide (cf.
              donnees-de-base/FormulaireEntree.jsx). */}
          <option value="">
            {chargement ? 'Chargement…' : requis ? 'Choisir…' : '- Aucun -'}
          </option>
          {grouper(options).map(([groupe, lot]) =>
            groupe ? (
              <optgroup key={groupe} label={groupe}>
                {lot.map((option) => (
                  <option key={option.valeur} value={option.valeur}>
                    {option.libelle}
                  </option>
                ))}
              </optgroup>
            ) : (
              lot.map((option) => (
                <option key={option.valeur} value={option.valeur}>
                  {option.libelle}
                </option>
              ))
            ),
          )}
        </select>
        <IonIcon className="ipm-formulaire__chevron" icon={chevronDown} aria-hidden="true" />
      </div>
      {erreur && (
        <p className="ipm-formulaire__erreur">
          {erreur}{' '}
          {onReessayer && (
            <button type="button" className="ipm-formulaire__reessayer" onClick={onReessayer}>
              Réessayer
            </button>
          )}
        </p>
      )}
    </div>
  )
}


interface PropsSaisie {
  libelle: string
  requis?: boolean
  valeur: string
  onChanger: (valeur: string) => void
  type?: 'text' | 'password'
  placeholder?: string
  /** Icône posée dans le cadre, à gauche. */
  icone?: string
  /** Bouton posé dans le cadre, à droite (voir le mot de passe…). */
  action?: ReactNode
  erreur?: string | null
  inputMode?: 'text' | 'numeric'
  autoComplete?: string
  enterKeyHint?: 'next' | 'go'
  reference?: Ref<HTMLInputElement>
  onEntree?: () => void
}

/** Champ de saisie, dans la même forme que le menu : un `input` natif. */
export function Saisie({
  libelle,
  requis,
  valeur,
  onChanger,
  type = 'text',
  placeholder,
  icone,
  action,
  erreur,
  inputMode,
  autoComplete,
  enterKeyHint,
  reference,
  onEntree,
}: PropsSaisie) {
  const id = `champ-${libelle.toLocaleLowerCase('fr-FR').replace(/[^a-z]+/g, '-')}`
  return (
    <div className="ipm-formulaire__champ">
      <label className="ipm-formulaire__libelle" htmlFor={id}>
        {libelle}
        {requis && <span className="ipm-formulaire__requis"> *</span>}
      </label>
      <div className="ipm-formulaire__cadre">
        {icone && (
          <IonIcon className="ipm-formulaire__icone" icon={icone} aria-hidden="true" />
        )}
        <input
          id={id}
          ref={reference}
          type={type}
          className={[
            'ipm-formulaire__saisie',
            icone && 'ipm-formulaire__saisie--avec-icone',
            action && 'ipm-formulaire__saisie--avec-action',
          ]
            .filter(Boolean)
            .join(' ')}
          value={valeur}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
          aria-invalid={Boolean(erreur)}
          onChange={(e) => onChanger(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEntree) {
              e.preventDefault()
              onEntree()
            }
          }}
        />
        {action}
      </div>
      {erreur && <p className="ipm-formulaire__erreur">{erreur}</p>}
    </div>
  )
}

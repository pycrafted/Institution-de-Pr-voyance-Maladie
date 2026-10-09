/**
 * Champ de saisie (SPEC_DESIGN §3.8) : hauteur 56, rayon 18, fond
 * `--ipm-surface-2`, SANS bordure au repos, bordure rouge 2 px au focus,
 * libellé 13/600 au-dessus, message d'erreur 12.5/500 en rouge.
 *
 * Le libellé est posé au-dessus du cadre (et non dans le champ, façon
 * « stacked » d'Ionic) : la hauteur du champ ne bouge donc pas selon qu'il
 * est vide ou rempli, et l'erreur s'ajoute sous le cadre sans le déformer.
 *
 * IonInput est conservé à l'intérieur : c'est lui qui gère le clavier, la
 * saisie assistée et l'accessibilité ; on lui retire seulement son habillage.
 */

import { IonIcon, IonInput } from '@ionic/react'
import type { Ref } from 'react'
import { useId } from 'react'

interface Props {
  libelle: string
  valeur: string
  /** Reçoit la valeur saisie ; peut renvoyer la version nettoyée à réafficher. */
  onChanger: (valeur: string) => string | void
  /** Message d'erreur sous le champ ; met aussi le cadre en rouge. */
  erreur?: string
  /** Aide discrète sous le champ, quand il n'y a pas d'erreur. */
  aide?: string
  placeholder?: string
  /** Icône ionicons posée à gauche dans le cadre. */
  icone?: string
  type?: 'text' | 'tel' | 'number' | 'search' | 'password'
  inputmode?: 'text' | 'numeric' | 'tel' | 'search'
  enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send'
  autocomplete?: 'off' | 'on' | 'current-password' | 'username'
  /** Touche « Entrée » / « Suivant » du clavier. */
  onEntree?: () => void
  /** Accès à l'IonInput (pour `setFocus()`). */
  reference?: Ref<HTMLIonInputElement>
  className?: string
}

export default function Champ({
  libelle,
  valeur,
  onChanger,
  erreur,
  aide,
  placeholder,
  icone,
  type = 'text',
  inputmode,
  enterkeyhint,
  autocomplete = 'off',
  onEntree,
  reference,
  className,
}: Props) {
  const idErreur = useId()
  const classes = [
    'ipm-champ',
    erreur ? 'ipm-champ--erreur' : '',
    icone ? 'ipm-champ--icone' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <label className="ipm-champ__libelle" htmlFor={`${idErreur}-saisie`}>
        {libelle}
      </label>
      <div className="ipm-champ__cadre">
        {icone && <IonIcon className="ipm-champ__icone" icon={icone} aria-hidden="true" />}
        <IonInput
          ref={reference}
          id={`${idErreur}-saisie`}
          className="ipm-champ__saisie"
          aria-label={libelle}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? idErreur : undefined}
          type={type}
          inputmode={inputmode}
          enterkeyhint={enterkeyhint}
          autocomplete={autocomplete}
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          placeholder={placeholder}
          value={valeur}
          onIonInput={(evenement) => {
            const saisie = String(evenement.detail.value ?? '')
            const propre = onChanger(saisie)
            // Le champ affiche aussitôt la version nettoyée (caractère refusé,
            // espace changé en tiret), même si l'état React n'a pas changé.
            if (typeof propre === 'string' && propre !== saisie) evenement.target.value = propre
          }}
          onKeyDown={(evenement) => {
            if (evenement.key === 'Enter' && onEntree) {
              evenement.preventDefault()
              onEntree()
            }
          }}
        />
      </div>
      {erreur ? (
        <p className="ipm-champ__erreur" id={idErreur} role="alert">
          {erreur}
        </p>
      ) : (
        aide && <p className="ipm-champ__aide">{aide}</p>
      )}
    </div>
  )
}

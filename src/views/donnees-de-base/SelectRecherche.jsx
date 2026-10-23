/**
 * Liste déroulante AVEC recherche (combobox).
 *
 * Remplace le `<select>` natif partout dans les formulaires : le champ montre la
 * valeur choisie et, une fois ouvert, filtre ses options à la frappe (par
 * libellé et par code), indispensable pour les listes longues - participants,
 * fournisseurs, médicaments… La navigation clavier (flèches, Entrée, Échap) rend
 * la saisie rapide. Le composant vit dans le même groupe que le label flottant,
 * pour que celui-ci continue de remonter à l'ouverture (`:focus-within`).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

/** Comparaison sans casse ni accents : « Épouse » trouve « epouse ». */
const normaliser = (texte) =>
  String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const SelectRecherche = ({
  id,
  value,
  options,
  texte,
  placeholder = '',
  effacable = false,
  disabled = false,
  autoFocus = false,
  onChange,
}) => {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [surligne, setSurligne] = useState(0)
  const conteneur = useRef(null)
  const champRecherche = useRef(null)

  const choisie = options.find((o) => o.valeur === value) || null
  const libelleAffiche = choisie ? texte(choisie) : ''

  const filtrees = useMemo(() => {
    const terme = normaliser(recherche)
    if (!terme) return options
    return options.filter(
      (o) => normaliser(texte(o)).includes(terme) || normaliser(o.valeur).includes(terme),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, recherche])

  // Fermer au clic en dehors.
  useEffect(() => {
    if (!ouvert) return undefined
    const auClic = (e) => {
      if (conteneur.current && !conteneur.current.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    return () => document.removeEventListener('mousedown', auClic)
  }, [ouvert])

  // Focus le champ de recherche à l'ouverture.
  useEffect(() => {
    if (ouvert && champRecherche.current) champRecherche.current.focus()
  }, [ouvert])

  const ouvrir = () => {
    if (disabled) return
    setRecherche('')
    setSurligne(0)
    setOuvert(true)
  }
  const choisir = (v) => {
    onChange(v)
    setOuvert(false)
    setRecherche('')
  }

  const auClavier = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, filtrees.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtrees[surligne]) choisir(filtrees[surligne].valeur)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOuvert(false)
    }
  }

  return (
    <div className="ddb-combo" ref={conteneur}>
      <button
        type="button"
        id={id}
        className="ddb-champ ddb-champ-liste ddb-combo-declencheur"
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
      >
        <span className="ddb-combo-valeur">{libelleAffiche || placeholder}</span>
      </button>

      {ouvert && (
        <div className="ddb-combo-panneau">
          <input
            ref={champRecherche}
            className="ddb-combo-recherche"
            value={recherche}
            onChange={(e) => {
              setRecherche(e.target.value)
              setSurligne(0)
            }}
            onKeyDown={auClavier}
            placeholder="Rechercher…"
            autoComplete="off"
          />
          <ul className="ddb-combo-liste" role="listbox">
            {effacable && (
              <li
                className={`ddb-combo-option ddb-combo-option-effacer${
                  value === '' ? ' ddb-combo-coche' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choisir('')
                }}
              >
                - Aucun -
              </li>
            )}
            {filtrees.length === 0 ? (
              <li className="ddb-combo-aucun">Aucun résultat</li>
            ) : (
              filtrees.map((o, i) => (
                <React.Fragment key={o.valeur}>
                  {/* Un titre quand le groupe change : la liste rangée (les
                      natures d'une spécialité, puis les autres) dit où elle
                      bascule. Le titre n'est pas une option : rien à choisir
                      dessus, et le clavier le saute. */}
                  {o.groupe && o.groupe !== filtrees[i - 1]?.groupe && (
                    <li className="ddb-combo-groupe" role="presentation">
                      {o.groupe}
                    </li>
                  )}
                  <li
                    role="option"
                    aria-selected={o.valeur === value}
                    className={`ddb-combo-option${i === surligne ? ' ddb-combo-surligne' : ''}${
                      o.valeur === value ? ' ddb-combo-coche' : ''
                    }`}
                    onMouseEnter={() => setSurligne(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      choisir(o.valeur)
                    }}
                  >
                    {texte(o)}
                  </li>
                </React.Fragment>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SelectRecherche

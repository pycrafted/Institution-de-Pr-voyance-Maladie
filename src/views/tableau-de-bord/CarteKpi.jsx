/**
 * Tuile d'indicateur — la rangée de tête du tableau de bord.
 *
 * Réduite à l'os, sur le modèle de « Données de base » : un intitulé, un
 * chiffre, un écart. Les versions précédentes portaient en plus un filet
 * coloré par indicateur et la période de comparaison en toutes lettres ;
 * quatre fois de suite, cela faisait une rangée bavarde et bariolée pour
 * quatre nombres. La période est déjà annoncée par le sélecteur au-dessus,
 * elle n'a pas à être répétée dans chaque tuile — elle reste accessible au
 * survol, sans occuper de ligne.
 *
 * Seul l'écart garde une couleur, et seulement parce qu'elle porte un sens :
 * favorable ou non. Elle vient toujours doublée d'une flèche.
 */

import React from 'react'
import PropTypes from 'prop-types'
import CIcon from '@coreui/icons-react'
import { cilArrowTop, cilArrowBottom } from '@coreui/icons'

import { formaterEntier, formaterMontant, formaterEcart } from './donnees'
import { avecAlpha } from './palette'

/**
 * Courbe de tendance : douze points, tracés d'un trait effacé, le point
 * courant seul en graphite plein. Elle situe la valeur dans son mouvement —
 * elle ne se lit pas au chiffre près.
 */
const Tendance = ({ points, teinte, surface }) => {
  const min = Math.min(...points)
  const max = Math.max(...points)
  const amplitude = max - min || 1
  const largeur = 68
  const hauteur = 24
  const pas = largeur / (points.length - 1)

  const coord = (v, i) => [i * pas, hauteur - 3 - ((v - min) / amplitude) * (hauteur - 6)]
  const trace = points
    .map((v, i) =>
      coord(v, i)
        .map((n) => n.toFixed(1))
        .join(' '),
    )
    .join(' L ')
  const [cx, cy] = coord(points[points.length - 1], points.length - 1)

  return (
    <svg
      className="tdb-tendance"
      viewBox={`0 0 ${largeur} ${hauteur}`}
      width={largeur}
      height={hauteur}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={`M ${trace}`}
        fill="none"
        stroke={avecAlpha(teinte, 0.35)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Anneau à la couleur de la surface : le point reste lisible même
          lorsqu'il chevauche la fin du trait. */}
      <circle cx={cx} cy={cy} r="3.5" fill={teinte} stroke={surface} strokeWidth="2" />
    </svg>
  )
}

Tendance.propTypes = {
  points: PropTypes.arrayOf(PropTypes.number).isRequired,
  teinte: PropTypes.string.isRequired,
  surface: PropTypes.string.isRequired,
}

const valeurFormatee = (kpi) => {
  if (kpi.format === 'montant') return formaterMontant(kpi.valeur)
  if (kpi.format === 'jours') return kpi.valeur.toLocaleString('fr-FR')
  return formaterEntier(kpi.valeur)
}

const uniteAffichee = (kpi) => {
  if (kpi.format === 'montant') return kpi.unite
  if (kpi.format === 'jours') return 'jours'
  return null
}

const CarteKpi = ({ kpi, icone, comparaison, palette }) => {
  // Une hausse n'est pas bonne en soi : sur un délai de règlement, c'est
  // l'inverse. Le sens est déclaré par l'indicateur, pas déduit du signe.
  const favorable = kpi.ecart > 0 === kpi.hausseFavorable

  return (
    <article className="tdb-kpi">
      <header className="tdb-kpi-entete">
        <span className="tdb-kpi-pastille">
          <CIcon icon={icone} />
        </span>
        <h3 className="tdb-kpi-libelle">{kpi.libelle}</h3>
      </header>

      <p className="tdb-kpi-valeur">
        {valeurFormatee(kpi)}
        {uniteAffichee(kpi) && <span className="tdb-kpi-unite">{uniteAffichee(kpi)}</span>}
      </p>

      <footer className="tdb-kpi-pied">
        <span
          className="tdb-kpi-ecart"
          style={{ color: favorable ? palette.etats.hausse : palette.etats.baisse }}
          title={comparaison}
        >
          <CIcon icon={kpi.ecart > 0 ? cilArrowTop : cilArrowBottom} className="tdb-kpi-fleche" />
          {formaterEcart(kpi.ecart)}
        </span>
        <Tendance points={kpi.tendance} teinte={palette.neutre} surface={palette.surface} />
      </footer>
    </article>
  )
}

CarteKpi.propTypes = {
  kpi: PropTypes.object.isRequired,
  icone: PropTypes.oneOfType([PropTypes.string, PropTypes.array]).isRequired,
  comparaison: PropTypes.string.isRequired,
  palette: PropTypes.object.isRequired,
}

export default CarteKpi

/**
 * Page « Tableau de bord ».
 *
 * Vue de synthèse : elle ne relève ni des fichiers ni de la gestion, elle
 * les résume. La lecture descend en trois paliers — d'abord quatre chiffres
 * de tête, puis la courbe qui les explique, enfin le détail par type, par
 * fournisseur et par dossier.
 *
 * Deux règles héritées de « Données de base », qui donnent son calme à cette
 * application et que cette page applique à la lettre :
 *
 *   1. **Deux couleurs, pas plus.** Du graphite pour les marques, le rouge
 *      SAR pour ce qui compte vraiment. Une part se distingue de sa voisine
 *      par sa clarté, jamais par une teinte de plus.
 *   2. **Un titre, rien dessous.** Pas de sous-titre, pas de mention d'unité,
 *      pas de pourcentage doublant une valeur déjà écrite. Ce qui peut se
 *      lire dans la figure ne se réécrit pas à côté d'elle.
 *
 * Un seul filtre de période, posé au-dessus de tout ce qu'il cadre. Les
 * cartes qui n'en dépendent pas portent la mention dans leur intitulé plutôt
 * qu'un sélecteur à elles : deux filtres pour un même écran, et personne ne
 * sait plus ce qu'il regarde.
 */

import React, { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilAddressBook,
  cilPeople,
  cilMoney,
  cilClock,
  cilCheckCircle,
  cilHistory,
  cilWarning,
  cilXCircle,
} from '@coreui/icons'

import Graphique from './Graphique'
import CarteKpi from './CarteKpi'
import { PALETTE as p, avecAlpha } from './palette'
import {
  PERIODES,
  jeuPour,
  PRESTATIONS_PAR_TYPE,
  REPARTITION_PARTICIPANTS,
  PROFIL_SPECIALITES,
  DEPENSES_PAR_SECTEUR,
  CONSOMMATION_PAR_AGE,
  TOP_FOURNISSEURS,
  ETAT_DOSSIERS,
  DERNIERS_REMBOURSEMENTS,
  LIBELLES_ETAT,
  formaterEntier,
  formaterMontant,
  formaterPourcent,
} from './donnees'
import './tableau-de-bord.scss'

const POLICE = 'system-ui, -apple-system, "Segoe UI", sans-serif'

// Une icône par indicateur, dans l'ordre de la rangée.
const ICONES_KPI = [cilAddressBook, cilPeople, cilMoney, cilClock]

// Les états de dossier portent chacun leur icône : la couleur ne dit jamais
// seule ce qui est validé, en cours ou rejeté.
const ICONES_ETAT = {
  valide: cilCheckCircle,
  encours: cilHistory,
  attente: cilWarning,
  rejete: cilXCircle,
}

const nombreFr = (v) => v.toLocaleString('fr-FR')

// -----------------------------------------------------------------------------
// Greffons de dessin
// -----------------------------------------------------------------------------

/**
 * Trait vertical sous le point survolé. Dessiné avant les courbes pour
 * passer dessous : un repère ne doit pas masquer la donnée qu'il repère.
 */
const greffonCurseur = (couleur) => ({
  id: 'tdbCurseur',
  beforeDatasetsDraw(chart) {
    const actifs = chart.tooltip?.getActiveElements?.() ?? []
    if (!actifs.length) return

    const { ctx, chartArea } = chart
    const x = actifs[0].element.x
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, chartArea.top)
    ctx.lineTo(x, chartArea.bottom)
    ctx.lineWidth = 1
    ctx.strokeStyle = couleur
    ctx.stroke()
    ctx.restore()
  },
})

/**
 * Valeur posée sur la tête de chaque barre. Six barres, six étiquettes : à
 * ce compte-là elles se lisent, et l'axe des ordonnées devient inutile — on
 * le retire plutôt que de dire deux fois la même chose.
 */
const greffonEtiquettesBarres = (couleur, suffixe) => ({
  id: 'tdbEtiquettesBarres',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    ctx.font = `600 11px ${POLICE}`
    ctx.fillStyle = couleur
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    chart.getDatasetMeta(0).data.forEach((barre, i) => {
      ctx.fillText(`${nombreFr(chart.data.datasets[0].data[i])}${suffixe}`, barre.x, barre.y - 7)
    })
    ctx.restore()
  },
})

// -----------------------------------------------------------------------------
// Fragments de mise en page
// -----------------------------------------------------------------------------

/**
 * En-tête de carte : un intitulé, éventuellement une action à droite.
 *
 * Volontairement dépourvu de sous-titre — c'est la ligne qu'on ajoute « pour
 * préciser » et qui, répétée sur huit cartes, transforme la page en notice.
 */
const EnteteCarte = ({ titre, action }) => (
  <header className="tdb-carte-entete">
    <h2 className="tdb-carte-titre">{titre}</h2>
    {action}
  </header>
)

EnteteCarte.propTypes = {
  titre: PropTypes.string.isRequired,
  action: PropTypes.node,
}

/**
 * Légende : toujours présente dès deux séries. C'est le canal d'identité
 * fiable — jamais l'appariement de couleurs à l'œil.
 */
const Legende = ({ entrees }) => (
  <ul className="tdb-legende">
    {entrees.map((e) => (
      <li key={e.libelle} className="tdb-legende-item">
        <span
          className="tdb-legende-puce"
          style={{ backgroundColor: e.teinte }}
          aria-hidden="true"
        />
        {e.libelle}
      </li>
    ))}
  </ul>
)

Legende.propTypes = {
  entrees: PropTypes.arrayOf(
    PropTypes.shape({ libelle: PropTypes.string, teinte: PropTypes.string }),
  ).isRequired,
}

/**
 * Relevé chiffré d'une figure circulaire — anneau, camembert, aire polaire.
 *
 * Il tient lieu de légende ET de jumeau tabulaire : la teinte situe le
 * secteur, le chiffre le renseigne. Sans lui, la seule façon de lire une
 * valeur serait de survoler, et une infobulle ne doit jamais être le seul
 * accès à la donnée.
 *
 * Une seule valeur par ligne : la part en pourcentage figurait ici en plus
 * du nombre, alors que la taille du secteur la donne déjà. Elle reste dans
 * l'infobulle, où elle ne coûte rien.
 */
const Releve = ({ entrees }) => (
  <ul className="tdb-releve">
    {entrees.map((e) => (
      <li key={e.libelle} className="tdb-releve-item">
        <span
          className="tdb-legende-puce tdb-legende-puce-pleine"
          style={{ backgroundColor: e.teinte }}
          aria-hidden="true"
        />
        <span className="tdb-releve-libelle">{e.libelle}</span>
        <span className="tdb-releve-valeur">{e.valeur}</span>
      </li>
    ))}
  </ul>
)

Releve.propTypes = {
  entrees: PropTypes.arrayOf(
    PropTypes.shape({
      libelle: PropTypes.string,
      teinte: PropTypes.string,
      valeur: PropTypes.string,
    }),
  ).isRequired,
}

// -----------------------------------------------------------------------------
// Vue
// -----------------------------------------------------------------------------

const TableauDeBord = () => {
  const [periode, setPeriode] = useState('exercice')
  // L'infobulle enrichit, elle ne conditionne pas : la même donnée reste
  // atteignable au clavier via la vue tableau du graphique principal.
  const [vueActivite, setVueActivite] = useState('graphique')

  const { kpis, comparaison, activite, synthese } = useMemo(() => jeuPour(periode), [periode])

  // --- Base commune des options : chrome effacé, données seules en avant ---
  const socle = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      font: { family: POLICE },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.infobulle.fond,
          titleColor: p.infobulle.titre,
          bodyColor: p.infobulle.corps,
          borderWidth: 0,
          cornerRadius: 6,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          titleFont: { family: POLICE, size: 12, weight: '600' },
          bodyFont: { family: POLICE, size: 12 },
          displayColors: true,
        },
      },
    }),
    [],
  )

  // --- Graphique principal : deux séries, même unité, un seul axe ---------
  // Le rouge SAR va à la dépense engagée — la seule ligne de l'écran qu'on
  // surveille vraiment ; le remboursement, qui la suit, reste en graphite.
  // Deux courbes nues, sans aplat : les deux séries évoluant à quelques
  // points l'une de l'autre, deux lavis superposés se mélangeaient en une
  // masse qui écrasait l'écart — c'est-à-dire l'information même.
  const donneesActivite = useMemo(() => {
    const courbe = (label, data, teinte) => ({
      label,
      data,
      borderColor: teinte,
      borderWidth: 2,
      borderCapStyle: 'round',
      borderJoinStyle: 'round',
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: teinte,
      // Anneau à la couleur de la surface : les deux marqueurs restent
      // lisibles là où les courbes se croisent.
      pointHoverBorderColor: p.surface,
      pointHoverBorderWidth: 2,
    })

    return {
      labels: activite.axes,
      datasets: [
        courbe('Dépenses engagées', activite.engage, p.accent),
        courbe('Remboursements versés', activite.rembourse, p.neutre),
      ],
    }
  }, [activite])

  // Cadrage vertical calculé sur la plage réellement occupée : laissé à
  // Chart.js, l'axe s'arrondissait à la dizaine inférieure et un bon quart du
  // cadre restait vide sous les courbes. Les bornes retombent sur un pas rond
  // (1, 2 ou 5 × une puissance de dix) : des graduations à « 46 M » et
  // « 71 M » se lisent moins bien que « 45 M » et « 70 M ».
  const bornesActivite = useMemo(() => {
    const valeurs = [...activite.engage, ...activite.rembourse]
    const bas = Math.min(...valeurs)
    const haut = Math.max(...valeurs)
    const brut = (haut - bas) / 4 || 1
    const puissance = 10 ** Math.floor(Math.log10(brut))
    const rapport = brut / puissance
    const pas = puissance * (rapport <= 1 ? 1 : rapport <= 2 ? 2 : rapport <= 5 ? 5 : 10)

    return {
      pas,
      min: Math.floor(bas / pas) * pas,
      max: Math.ceil(haut / pas) * pas,
    }
  }, [activite])

  const optionsActivite = useMemo(
    () => ({
      ...socle,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      scales: {
        x: {
          grid: { display: false },
          border: { color: p.axe },
          ticks: { color: p.encreMuette, font: { family: POLICE, size: 11 }, padding: 8 },
        },
        y: {
          // Une courbe encode une position, pas une longueur : elle n'a pas
          // besoin de partir de zéro, et cadrer sur la plage utile rend
          // l'écart entre les deux séries lisible. Les valeurs exactes
          // restent à un clic, dans la vue tableau.
          beginAtZero: false,
          min: bornesActivite.min,
          max: bornesActivite.max,
          grid: { color: p.grille, drawTicks: false },
          border: { display: false },
          ticks: {
            color: p.encreMuette,
            font: { family: POLICE, size: 11 },
            padding: 12,
            stepSize: bornesActivite.pas,
            callback: (v) => `${nombreFr(v)} M`,
          },
        },
      },
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: {
            label: (c) => ` ${c.dataset.label} : ${nombreFr(c.parsed.y)} M FCFA`,
          },
        },
      },
    }),
    [socle, bornesActivite],
  )

  const greffonsActivite = useMemo(() => [greffonCurseur(p.axe)], [])

  // --- Dépenses par type : une seule série, donc une seule teinte ---------
  const donneesTypes = useMemo(
    () => ({
      labels: PRESTATIONS_PAR_TYPE.map((t) => t.libelle),
      datasets: [
        {
          label: 'Dépenses',
          data: PRESTATIONS_PAR_TYPE.map((t) => t.valeur),
          backgroundColor: p.neutre,
          hoverBackgroundColor: p.neutre,
          maxBarThickness: 22,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
        },
      ],
    }),
    [],
  )

  const optionsTypes = useMemo(
    () => ({
      ...socle,
      layout: { padding: { top: 22 } },
      scales: {
        x: {
          grid: { display: false },
          border: { color: p.axe },
          ticks: {
            color: p.encreMuette,
            font: { family: POLICE, size: 11 },
            padding: 8,
            maxRotation: 0,
            autoSkip: false,
          },
        },
        // Chaque tête de barre porte sa valeur : l'axe redirait la même chose.
        y: { display: false, beginAtZero: true, grace: '12%' },
      },
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: { label: (c) => ` ${nombreFr(c.parsed.y)} M FCFA` },
        },
      },
    }),
    [socle],
  )

  const greffonsTypes = useMemo(() => [greffonEtiquettesBarres(p.encreMuette, ' M')], [])

  // --- Répartition des participants : part d'un tout, quatre segments -----
  const totalParticipants = REPARTITION_PARTICIPANTS.reduce((s, r) => s + r.valeur, 0)

  const donneesRepartition = useMemo(
    () => ({
      labels: REPARTITION_PARTICIPANTS.map((r) => r.libelle),
      datasets: [
        {
          data: REPARTITION_PARTICIPANTS.map((r) => r.valeur),
          backgroundColor: REPARTITION_PARTICIPANTS.map((_, i) => p.rampe[i]),
          // L'écart entre segments est fait par un vide à la couleur de la
          // surface, pas par un contour : un trait ajouterait de l'encre qui
          // n'est pas de la donnée.
          borderColor: p.surface,
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    }),
    [],
  )

  const optionsRepartition = useMemo(
    () => ({
      ...socle,
      cutout: '68%',
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: {
            label: (c) =>
              ` ${formaterEntier(c.parsed)} · ${formaterPourcent((c.parsed / totalParticipants) * 100)}`,
          },
        },
      },
    }),
    [socle, totalParticipants],
  )

  // --- Profil par spécialité : deux populations, mêmes axes ---------------
  const donneesProfil = useMemo(() => {
    const teintes = [p.accent, p.neutre]
    return {
      labels: PROFIL_SPECIALITES.axes,
      datasets: PROFIL_SPECIALITES.series.map((s, i) => ({
        label: s.libelle,
        data: s.valeurs,
        borderColor: teintes[i],
        // Lavis à 10 % : sur un radar les deux surfaces se recouvrent peu,
        // l'aplat reste lisible là où il aurait noirci un graphique en aires.
        backgroundColor: avecAlpha(teintes[i], 0.1),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: teintes[i],
        pointHoverBorderColor: p.surface,
        pointHoverBorderWidth: 2,
      })),
    }
  }, [])

  const optionsProfil = useMemo(
    () => ({
      ...socle,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          grid: { color: p.grille },
          angleLines: { color: p.grille },
          pointLabels: { color: p.encreMuette, font: { family: POLICE, size: 11 } },
          // Les graduations radiales encombreraient le centre : l'infobulle
          // donne l'indice exact au survol.
          ticks: { display: false },
        },
      },
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: { label: (c) => ` ${c.dataset.label} : indice ${nombreFr(c.parsed.r)}` },
        },
      },
    }),
    [socle],
  )

  // --- Dépenses par secteur : camembert, quatre parts ----------------------
  const totalSecteurs = DEPENSES_PAR_SECTEUR.reduce((s, r) => s + r.valeur, 0)

  const donneesSecteurs = useMemo(
    () => ({
      labels: DEPENSES_PAR_SECTEUR.map((r) => r.libelle),
      datasets: [
        {
          data: DEPENSES_PAR_SECTEUR.map((r) => r.valeur),
          backgroundColor: DEPENSES_PAR_SECTEUR.map((_, i) => p.rampe[i]),
          borderColor: p.surface,
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    }),
    [],
  )

  const optionsSecteurs = useMemo(
    () => ({
      ...socle,
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: {
            label: (c) =>
              ` ${formaterMontant(c.parsed)} FCFA · ${formaterPourcent((c.parsed / totalSecteurs) * 100)}`,
          },
        },
      },
    }),
    [socle, totalSecteurs],
  )

  // --- Consommation par tranche d'âge : aire polaire -----------------------
  // Ici les catégories sont réellement ordonnées : la rampe suit l'âge, ce
  // qui est le seul cas où une clarté croissante dit quelque chose de vrai.
  const totalAges = CONSOMMATION_PAR_AGE.reduce((s, r) => s + r.valeur, 0)

  const donneesAges = useMemo(
    () => ({
      labels: CONSOMMATION_PAR_AGE.map((r) => r.libelle),
      datasets: [
        {
          data: CONSOMMATION_PAR_AGE.map((r) => r.valeur),
          // Teintes pleines : c'est à pleine opacité que la rampe a été
          // vérifiée. La voiler pour laisser transparaître la grille la
          // délaverait sur fond clair et la brunirait sur fond sombre.
          backgroundColor: CONSOMMATION_PAR_AGE.map((_, i) => p.rampe[i]),
          borderColor: p.surface,
          borderWidth: 2,
        },
      ],
    }),
    [],
  )

  const optionsAges = useMemo(
    () => ({
      ...socle,
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: p.grille },
          angleLines: { color: p.grille },
          // Les graduations d'une aire polaire s'empilent toutes au même
          // endroit, au centre, par-dessus les secteurs : illisibles, et
          // inutiles ici puisque le relevé donne chaque valeur au-dessous.
          ticks: { display: false },
        },
      },
      plugins: {
        ...socle.plugins,
        tooltip: {
          ...socle.plugins.tooltip,
          callbacks: { label: (c) => ` ${nombreFr(c.parsed.r)} M FCFA` },
        },
      },
    }),
    [socle],
  )

  const maxFournisseur = Math.max(...TOP_FOURNISSEURS.map((f) => f.valeur))
  const totalDossiers = ETAT_DOSSIERS.reduce((s, e) => s + e.valeur, 0)

  return (
    <div className="tdb">
      {/* ---- En-tête de page : titre, période, actions ---------------- */}
      {/* Le titre est nu, comme « Structure » dans Données de base : la
          période est dite par le sélecteur juste à côté, la répéter en
          sous-titre serait la dire deux fois. */}
      <header className="tdb-entete">
        <h1 className="tdb-titre">Tableau de bord</h1>

        {/* Un seul filtre, au-dessus de tout ce qu'il cadre. */}
        <div className="tdb-segments" role="group" aria-label="Période observée">
          {PERIODES.map((item) => (
            <button
              type="button"
              key={item.cle}
              className={`tdb-segment${item.cle === periode ? ' tdb-segment-actif' : ''}`}
              aria-pressed={item.cle === periode}
              onClick={() => setPeriode(item.cle)}
            >
              {item.libelle}
            </button>
          ))}
        </div>
      </header>

      {/* ---- Rangée d'indicateurs ------------------------------------- */}
      <section className="tdb-kpis" aria-label="Indicateurs de tête">
        {kpis.map((kpi, i) => (
          <CarteKpi
            key={kpi.cle}
            kpi={kpi}
            icone={ICONES_KPI[i]}
            comparaison={comparaison}
            palette={p}
          />
        ))}
      </section>

      {/* ---- Graphique principal -------------------------------------- */}
      <CCard className="tdb-carte">
        <CCardBody className="tdb-carte-corps">
          <EnteteCarte
            titre="Engagements et remboursements"
            action={
              <div className="tdb-segments tdb-segments-fin" role="group" aria-label="Affichage">
                <button
                  type="button"
                  className={`tdb-segment${vueActivite === 'graphique' ? ' tdb-segment-actif' : ''}`}
                  aria-pressed={vueActivite === 'graphique'}
                  onClick={() => setVueActivite('graphique')}
                >
                  Graphique
                </button>
                <button
                  type="button"
                  className={`tdb-segment${vueActivite === 'tableau' ? ' tdb-segment-actif' : ''}`}
                  aria-pressed={vueActivite === 'tableau'}
                  onClick={() => setVueActivite('tableau')}
                >
                  Tableau
                </button>
              </div>
            }
          />

          {/* La légende nomme des couleurs : elle n'a plus d'objet dès que la
              donnée passe en colonnes. */}
          {vueActivite === 'graphique' && (
            <Legende
              entrees={[
                { libelle: 'Dépenses engagées', teinte: p.accent },
                { libelle: 'Remboursements versés', teinte: p.neutre },
              ]}
            />
          )}

          {vueActivite === 'graphique' ? (
            <Graphique
              key={`activite-${periode}`}
              type="line"
              data={donneesActivite}
              options={optionsActivite}
              plugins={greffonsActivite}
              hauteur={300}
              aria={`Dépenses engagées et remboursements versés, ${activite.intitule}`}
            />
          ) : (
            // Le jumeau tabulaire du graphique : même donnée, sans couleur.
            <div className="tdb-tableau-conteneur tdb-tableau-jumeau">
              <table className="tdb-tableau">
                <thead>
                  <tr>
                    <th scope="col">Période</th>
                    <th scope="col" className="tdb-col-nombre">
                      Engagé
                    </th>
                    <th scope="col" className="tdb-col-nombre">
                      Remboursé
                    </th>
                    <th scope="col" className="tdb-col-nombre">
                      Reste à charge
                    </th>
                    <th scope="col" className="tdb-col-nombre">
                      Taux
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activite.axes.map((axe, i) => {
                    const engage = activite.engage[i]
                    const rembourse = activite.rembourse[i]
                    return (
                      <tr key={axe}>
                        <th scope="row" className="tdb-cellule-titre">
                          {axe}
                        </th>
                        <td className="tdb-col-nombre">{nombreFr(engage)}</td>
                        <td className="tdb-col-nombre">{nombreFr(rembourse)}</td>
                        <td className="tdb-col-nombre tdb-cellule-douce">
                          {nombreFr(Math.round((engage - rembourse) * 10) / 10)}
                        </td>
                        <td className="tdb-col-nombre tdb-cellule-douce">
                          {formaterPourcent((rembourse / engage) * 100)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pied de carte : les quatre agrégats de la même période. */}
          <div className="tdb-synthese">
            {synthese.map((item) => {
              const part = Math.min(100, (item.valeur / item.cible) * 100)
              return (
                <div key={item.cle} className="tdb-synthese-item">
                  <span className="tdb-synthese-libelle">{item.libelle}</span>
                  <span className="tdb-synthese-valeur">
                    {item.cible === 100
                      ? formaterPourcent(item.valeur)
                      : formaterEntier(item.valeur)}
                  </span>
                  {/* Jauge : la piste est le même graphite éclairci, l'état se
                      lit donc sur toute la largeur, pas seulement sur la part
                      remplie. */}
                  <span
                    className="tdb-jauge"
                    style={{ backgroundColor: avecAlpha(p.neutre, 0.16) }}
                    role="img"
                    aria-label={`${item.libelle} : ${Math.round(part)} % de la cible`}
                  >
                    <span
                      className="tdb-jauge-part"
                      style={{ width: `${part}%`, backgroundColor: p.neutre }}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        </CCardBody>
      </CCard>

      {/* ---- Dépenses par type · Répartition des participants ---------- */}
      <div className="tdb-duo tdb-duo-large">
        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Dépenses par type de prestation" />
            <Graphique
              type="bar"
              data={donneesTypes}
              options={optionsTypes}
              plugins={greffonsTypes}
              hauteur={268}
              aria="Dépenses par type de prestation, cumul de l’exercice"
            />
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Répartition des participants" />
            <div className="tdb-anneau">
              <Graphique
                type="doughnut"
                data={donneesRepartition}
                options={optionsRepartition}
                hauteur={178}
                aria="Répartition des participants par qualité"
              />
              <Releve
                entrees={REPARTITION_PARTICIPANTS.map((r, i) => ({
                  libelle: r.libelle,
                  teinte: p.rampe[i],
                  valeur: formaterEntier(r.valeur),
                }))}
              />
            </div>
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Profil · Secteurs · Tranches d'âge ------------------------ */}
      <div className="tdb-trio">
        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Profil de consommation" />
            <Legende
              entrees={PROFIL_SPECIALITES.series.map((s, i) => ({
                libelle: s.libelle,
                teinte: [p.accent, p.neutre][i],
              }))}
            />
            <div className="tdb-figure tdb-figure-pleine">
              <Graphique
                type="radar"
                data={donneesProfil}
                options={optionsProfil}
                hauteur={310}
                aria="Profil de consommation des adhérents et des ayants droit, par spécialité"
              />
            </div>
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Dépenses par secteur" />
            <div className="tdb-figure">
              <Graphique
                type="pie"
                data={donneesSecteurs}
                options={optionsSecteurs}
                hauteur={210}
                aria="Répartition des dépenses par secteur de soins"
              />
              <Releve
                entrees={DEPENSES_PAR_SECTEUR.map((r, i) => ({
                  libelle: r.libelle,
                  teinte: p.rampe[i],
                  valeur: formaterMontant(r.valeur),
                }))}
              />
            </div>
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Consommation par âge" />
            <div className="tdb-figure">
              <Graphique
                type="polarArea"
                data={donneesAges}
                options={optionsAges}
                hauteur={210}
                aria="Consommation par tranche d’âge des participants"
              />
              <Releve
                entrees={CONSOMMATION_PAR_AGE.map((r, i) => ({
                  libelle: r.libelle,
                  teinte: p.rampe[i],
                  valeur: `${nombreFr(r.valeur)} M`,
                }))}
              />
            </div>
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Fournisseurs · États des dossiers ------------------------- */}
      <div className="tdb-duo">
        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Principaux fournisseurs de soins" />
            <ol className="tdb-classement">
              {TOP_FOURNISSEURS.map((f) => (
                <li key={f.libelle} className="tdb-classement-item">
                  <div className="tdb-classement-ligne">
                    <span className="tdb-classement-libelle">{f.libelle}</span>
                    <span className="tdb-classement-valeur">{formaterMontant(f.valeur)}</span>
                  </div>
                  <span
                    className="tdb-jauge"
                    style={{ backgroundColor: avecAlpha(p.neutre, 0.16) }}
                    aria-hidden="true"
                  >
                    <span
                      className="tdb-jauge-part"
                      style={{
                        width: `${(f.valeur / maxFournisseur) * 100}%`,
                        backgroundColor: p.neutre,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </CCardBody>
        </CCard>

        <CCard className="tdb-carte">
          <CCardBody className="tdb-carte-corps">
            <EnteteCarte titre="Traitement des dossiers" />
            <ul className="tdb-etats">
              {ETAT_DOSSIERS.map((e) => (
                <li key={e.cle} className="tdb-etats-item">
                  {/* La couleur d'état tient dans l'icône, pas dans la barre :
                      quatre jauges teintées en pleine largeur faisaient le
                      bloc le plus criard de la page pour une information que
                      l'icône et le libellé donnent déjà. */}
                  <span className="tdb-etats-icone" style={{ color: p.etats[e.cle] }}>
                    <CIcon icon={ICONES_ETAT[e.cle]} />
                  </span>
                  <span className="tdb-etats-libelle">{e.libelle}</span>
                  <span className="tdb-etats-valeur">{formaterEntier(e.valeur)}</span>
                  <span
                    className="tdb-jauge tdb-jauge-fine"
                    style={{ backgroundColor: avecAlpha(p.neutre, 0.16) }}
                    aria-hidden="true"
                  >
                    <span
                      className="tdb-jauge-part"
                      style={{
                        width: `${(e.valeur / totalDossiers) * 100}%`,
                        backgroundColor: p.neutre,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </CCardBody>
        </CCard>
      </div>

      {/* ---- Derniers remboursements ---------------------------------- */}
      <CCard className="tdb-carte">
        <CCardBody className="tdb-carte-corps">
          <EnteteCarte
            titre="Derniers remboursements"
            action={
              <button type="button" className="tdb-lien">
                Ouvrir les traitements
              </button>
            }
          />
          <div className="tdb-tableau-conteneur">
            <table className="tdb-tableau">
              <thead>
                <tr>
                  <th scope="col">Dossier</th>
                  <th scope="col">Participant</th>
                  <th scope="col">Fournisseur</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="tdb-col-nombre">
                    Montant
                  </th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {DERNIERS_REMBOURSEMENTS.map((r) => (
                  <tr key={r.dossier}>
                    <th scope="row" className="tdb-cellule-titre tdb-mono">
                      {r.dossier}
                    </th>
                    <td>{r.participant}</td>
                    <td className="tdb-cellule-douce">{r.fournisseur}</td>
                    <td className="tdb-cellule-douce">{r.type}</td>
                    <td className="tdb-col-nombre">{formaterEntier(r.montant)}</td>
                    <td>
                      {/* Pastille + libellé : l'état ne tient jamais à la
                          seule couleur. */}
                      <span className="tdb-badge">
                        <span
                          className="tdb-badge-point"
                          style={{ backgroundColor: p.etats[r.etat] }}
                          aria-hidden="true"
                        />
                        {LIBELLES_ETAT[r.etat]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CCardBody>
      </CCard>
    </div>
  )
}

export default TableauDeBord

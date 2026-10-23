/**
 * Carte d'identité d'adhérent — celle de l'accueil.
 *
 * Elle se lit comme la carte que l'organisation remet à ses employés : une
 * photo d'identité à gauche, et à droite des champs nommés, « Nom »,
 * « Prénom(s) », « Matricule », « Société »… C'est la carte que l'employé
 * montre au comptoir de la pharmacie, et qu'un agent doit pouvoir lire d'un
 * coup d'œil, champ par champ.
 *
 * Elle reprend l'habillage de la carte d'adhérent (dégradé rouge SAR,
 * filigrane, rayon, ombre — classes .ipm-carte-adherent) ; seule la
 * disposition intérieure change. La MÊME carte sert à l'accueil et à la
 * présentation plein écran (components/CartePleinEcran).
 *
 * Rien ne s'y touche : une pièce d'identité ne se modifie pas au moment où
 * on la présente. La photo s'envoie depuis la feuille « Photos d'identité »
 * de l'accueil, et une seule fois (cf. apps/mobile/views.py).
 */

import { dateCourte, initiales } from '../utils/format'
import LogoSar from './LogoSar'

interface Props {
  nom: string
  prenoms: string
  /** Matricule affiché, « 01-1204 ». */
  matricule: string
  societe?: string
  /** Date ISO « 1962-01-01 » ; le champ est omis si elle manque. */
  dateNaissance?: string | null
  /** Photo d'identité (URL de données) ; à défaut, les initiales. */
  photo?: string | null
  /** Intitulé de la pièce : « Carte d'adhérent » (défaut) ou « Carte d'ayant droit ». */
  intitule?: string
  /** Qualité d'un ayant droit (« Conjointe », « Enfant »…), champ ajouté. */
  qualite?: string
  /** Titulaire auquel l'ayant droit est rattaché (« Abdoulaye MBAYE · 1204 »). */
  rattachement?: string
  className?: string
}

export default function CarteIdentite({
  nom,
  prenoms,
  matricule,
  societe,
  dateNaissance,
  photo,
  intitule = 'Carte d’adhérent',
  qualite,
  rattachement,
  className,
}: Props) {
  const naissance = dateCourte(dateNaissance)
  // Un champ vide n'est pas imprimé : une carte d'identité n'a pas de case
  // blanche, et « Né(e) le : » sans date fait brouillon.
  const champs: [string, string, string?][] = [
    ['Nom', nom.toUpperCase()],
    ['Prénom(s)', prenoms],
    ...(qualite ? ([['Qualité', qualite]] as [string, string][]) : []),
    ['Matricule', matricule, 'ipm-chiffres'],
    ...(naissance ? ([['Né(e) le', naissance, 'ipm-chiffres']] as [string, string, string][]) : []),
    ...(societe ? ([['Société', societe]] as [string, string][]) : []),
    ...(rattachement ? ([['Ayant droit de', rattachement]] as [string, string][]) : []),
  ]

  return (
    <section
      className={['ipm-carte-adherent', 'ipm-carte-identite', className ?? '']
        .filter(Boolean)
        .join(' ')}
      aria-label={intitule}
    >
      {/* Filigrane de sécurité : le logo de l'émetteur, en très grand et
          presque transparent, derrière les champs — comme l'emblème d'une
          pièce officielle. Il remplace les cercles génériques. */}
      <span className="ipm-carte-identite__embleme" aria-hidden="true">
        <LogoSar largeur={230} ton="blanc" />
      </span>

      {/* En-tête d'une pièce d'identité : l'intitulé à gauche, le sceau de
          l'émetteur au coin opposé — et donc plus au-dessus de la photo. Le
          logo y est en blanc, directement sur le rouge, comme l'intitulé. */}
      <div className="ipm-carte-identite__entete">
        <span className="ipm-carte-identite__intitule">
          {intitule}
          <span className="ipm-carte-identite__organisme">IPM SAR</span>
        </span>
        <span className="ipm-carte-identite__sceau">
          <LogoSar largeur={48} ton="blanc" />
        </span>
      </div>

      <div className="ipm-carte-identite__corps">
        <span className="ipm-carte-identite__portrait">
          <Photo photo={photo} prenoms={prenoms} nom={nom} />
        </span>

        <dl className="ipm-carte-identite__champs">
          {champs.map(([libelle, valeur, classe]) => (
            <div key={libelle} className="ipm-carte-identite__champ">
              <dt>{libelle}</dt>
              <dd className={classe}>{valeur}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** La photo d'identité, ou les initiales à sa place. */
function Photo({ photo, prenoms, nom }: { photo?: string | null; prenoms: string; nom: string }) {
  return (
    <span className="ipm-carte-identite__photo" aria-hidden="true">
      {photo ? (
        <img src={photo} alt="" width={76} height={96} loading="lazy" />
      ) : (
        <span className="ipm-carte-identite__initiales">{initiales(`${prenoms} ${nom}`)}</span>
      )}
    </span>
  )
}

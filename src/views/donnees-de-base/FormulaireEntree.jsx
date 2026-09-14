/**
 * Panneau de saisie d'une entrée de référentiel.
 *
 * Le même panneau sert à la création et à la modification : cliquer une ligne
 * du tableau l'ouvre pré-rempli.
 *
 * Deux mises en page selon la richesse du référentiel :
 *   - par défaut, les champs s'enchaînent dans l'ordre des colonnes ;
 *   - si le référentiel déclare un `formulaire`, ils se répartissent en
 *     onglets et en sections (fiche fournisseur, adhérent…).
 *
 * Les champs reprennent le style du template : label en petit au-dessus,
 * valeur soulignée d'un trait qui passe au rouge SAR au focus.
 */

import React, { useMemo, useRef, useState } from 'react'
import { COffcanvas, COffcanvasBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilLockUnlocked, cilUser, cilX } from '@coreui/icons'

import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { champRequis, champVisible, optionsDe, texteOption } from './optionsChamp'

/**
 * Forme d'une adresse électronique : de quoi arrêter une faute de frappe avant
 * l'aller-retour au serveur, qui reste seul juge du reste.
 */
const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Côté maximal d'une photo enregistrée, en pixels.
 *
 * Les fiches vivent dans le stockage du navigateur, dont le quota se compte
 * en mégaoctets : une photo d'appareil moderne le remplirait à elle seule.
 * Redimensionnée à 320 px et réencodée en JPEG, une photo d'identité pèse
 * une vingtaine de kilo-octets, ce qui laisse de la place pour des centaines
 * de participants.
 */
const COTE_PHOTO = 320

/** Lit un fichier image, le réduit et le rend en URL de données. */
const reduireImage = (fichier) =>
  new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error('Fichier illisible'))
    lecteur.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Ce fichier n’est pas une image'))
      image.onload = () => {
        const echelle = Math.min(1, COTE_PHOTO / Math.max(image.width, image.height))
        const canevas = document.createElement('canvas')
        canevas.width = Math.round(image.width * echelle)
        canevas.height = Math.round(image.height * echelle)
        canevas.getContext('2d').drawImage(image, 0, 0, canevas.width, canevas.height)
        resolve(canevas.toDataURL('image/jpeg', 0.8))
      }
      image.src = lecteur.result
    }
    lecteur.readAsDataURL(fichier)
  })

/**
 * Photo d'identité : un cadre au format 3/4, et le choix du fichier à côté.
 *
 * Le champ de fichier natif est masqué — son bouton « Parcourir… » et son
 * « Aucun fichier sélectionné » n'obéissent à aucune feuille de styles et
 * jureraient au milieu de champs soulignés.
 */
const ChampPhoto = ({ col, valeur, onChanger }) => {
  const champFichier = useRef(null)
  const [erreur, setErreur] = useState(null)

  const choisir = async (fichier) => {
    if (!fichier) return
    try {
      onChanger(col, await reduireImage(fichier))
      setErreur(null)
    } catch (e) {
      setErreur(e.message)
    }
  }

  return (
    <div className="ddb-groupe">
      <label>{col.libelleForm || col.libelle}</label>

      <div className="ddb-photo">
        <span className="ddb-photo-cadre">
          {valeur ? (
            <img src={valeur} alt="" className="ddb-photo-image" />
          ) : (
            <CIcon icon={cilUser} className="ddb-photo-silhouette" />
          )}
        </span>

        <div className="ddb-photo-actions">
          <button
            type="button"
            className="ddb-photo-bouton"
            onClick={() => champFichier.current?.click()}
          >
            {valeur ? 'Remplacer' : 'Choisir une photo'}
          </button>

          {valeur && (
            <button
              type="button"
              className="ddb-photo-bouton ddb-photo-bouton-retirer"
              onClick={() => onChanger(col, '')}
            >
              Retirer
            </button>
          )}

          <span className="ddb-photo-aide">Réduite à {COTE_PHOTO} px avant enregistrement</span>

          <input
            ref={champFichier}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => choisir(e.target.files?.[0])}
          />
        </div>
      </div>

      {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
    </div>
  )
}

const valeursVides = (colonnes) =>
  colonnes.reduce((acc, col) => {
    // Valeur de départ : `false` pour une case, la valeur `defaut` déclarée par
    // la colonne si elle en a une (prix prérempli à 0…), vide sinon. `defaut`
    // peut être une fonction, évaluée à l'ouverture du formulaire : une date du
    // jour figée au chargement de la page serait fausse passé minuit.
    const defaut = typeof col.defaut === 'function' ? col.defaut() : col.defaut
    const depart = col.type === 'booleen' ? false : (defaut ?? '')
    return { ...acc, [col.nom]: depart }
  }, {})

/**
 * Structure de saisie effective : celle déclarée par le référentiel, ou à
 * défaut un onglet unique listant les colonnes une par ligne.
 */
const structure = (referentiel) =>
  referentiel.formulaire || [
    {
      sections: [
        {
          // Les champs engendrés par l'application (code séquentiel…) ne se
          // saisissent pas : ils sont calculés à l'enregistrement.
          lignes: referentiel.colonnes.filter((col) => !col.calcule).map((col) => [col.nom]),
        },
      ],
    },
  ]

/** Tous les noms de champs d'un onglet, sections et lignes confondues. */
const champsDeLOnglet = (onglet) => onglet.sections.flatMap((section) => section.lignes.flat())

// ---------------------------------------------------------------------------
// Un champ
// ---------------------------------------------------------------------------
const Champ = ({ col, valeur, valeurs, entrees, erreur, autoFocus, onChanger }) => {
  const identifiant = `champ-${col.nom}`
  const requis = champRequis(col, valeurs)

  if (col.type === 'photo') {
    return <ChampPhoto col={col} valeur={valeur} onChanger={onChanger} />
  }

  // Une case à cocher porte son propre libellé : pas de label au-dessus.
  if (col.type === 'booleen') {
    return (
      <label className="ddb-case">
        <input
          type="checkbox"
          id={identifiant}
          checked={Boolean(valeur)}
          onChange={(e) => onChanger(col, e.target.checked)}
        />
        <span>{col.libelleForm || col.libelle}</span>
      </label>
    )
  }

  // État à deux positions : Actif / Suspendu (bascule segmentée). Un adhérent
  // suspendu reste enregistré, simplement mis hors circuit.
  if (col.type === 'etat') {
    const actif = Boolean(valeur)
    return (
      <div className="ddb-groupe">
        <label>{col.libelleForm || col.libelle}</label>
        <div className="ddb-etat" role="group" aria-label={col.libelleForm || col.libelle}>
          <button
            type="button"
            className={`ddb-etat-choix${actif ? ' ddb-etat-actif' : ''}`}
            onClick={() => onChanger(col, true)}
          >
            Actif
          </button>
          <button
            type="button"
            className={`ddb-etat-choix${actif ? '' : ' ddb-etat-suspendu'}`}
            onClick={() => onChanger(col, false)}
          >
            Suspendu
          </button>
        </div>
      </div>
    )
  }

  // Choix fermé rendu en boutons radio (sexe, type de contrat…).
  if (col.type === 'radio') {
    return (
      <div className={`ddb-groupe${erreur ? ' ddb-groupe-erreur' : ''}`}>
        <label>
          {col.libelleForm || col.libelle}
          {requis && <span className="ddb-requis"> *</span>}
        </label>
        <div className="ddb-radios">
          {optionsDe(col, valeurs, entrees).map((option) => (
            <label key={option.valeur} className="ddb-radio">
              <input
                type="radio"
                name={identifiant}
                checked={valeur === option.valeur}
                onChange={() => onChanger(col, option.valeur)}
              />
              <span>{option.libelle}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  // Champ calculé par l'application : montré pour information, jamais saisi.
  if (col.lectureSeule) {
    const brute = col.valeur ? col.valeur(valeurs) : valeur
    const option = col.options
      ? optionsDe(col, valeurs, entrees).find((o) => o.valeur === brute)
      : null
    return (
      <div className="ddb-groupe ddb-groupe-fige">
        <label htmlFor={identifiant}>{col.libelleForm || col.libelle}</label>
        <div className="ddb-champ-enveloppe">
          <input
            id={identifiant}
            className={`ddb-champ${col.mono ? ' ddb-mono' : ''}`}
            value={option ? texteOption(option, col) : brute || ''}
            readOnly
            tabIndex={-1}
          />
        </div>
      </div>
    )
  }

  // Libellé flottant, comme l'application d'origine : dans le champ tant qu'il
  // est vide, au-dessus dès qu'on y entre ou qu'il porte une valeur. Un champ
  // qui affiche toujours quelque chose — l'indicatif « +221 », le « jj/mm/aaaa »
  // d'une date — garde son libellé au-dessus : il n'y aurait pas la place dedans.
  const flottant = !col.prefixe && col.type !== 'date'
  const vide = valeur === '' || valeur === null || valeur === undefined
  const classes = [
    'ddb-groupe',
    flottant && 'ddb-groupe-flottant',
    flottant && vide && 'ddb-groupe-vide',
    erreur && 'ddb-groupe-erreur',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <label htmlFor={identifiant}>
        {col.libelleForm || col.libelle}
        {requis && <span className="ddb-requis"> *</span>}
      </label>

      {col.options ? (
        <select
          id={identifiant}
          className="ddb-champ ddb-champ-liste"
          value={valeur}
          onChange={(e) => onChanger(col, e.target.value)}
          autoFocus={autoFocus}
        >
          {/* Vide : c'est le libellé, posé dans le champ, qui dit quoi choisir. */}
          <option value="">{flottant ? '' : requis ? 'Choisir…' : '— Aucun —'}</option>
          {optionsDe(col, valeurs, entrees).map((option) => (
            <option key={option.valeur} value={option.valeur}>
              {texteOption(option, col)}
            </option>
          ))}
        </select>
      ) : (
        <div className={`ddb-champ-enveloppe${col.prefixe ? ' ddb-champ-prefixe' : ''}`}>
          {col.prefixe && <span className="ddb-prefixe">{col.prefixe}</span>}
          <input
            id={identifiant}
            type={col.type || 'text'}
            className={`ddb-champ${col.mono ? ' ddb-mono' : ''}`}
            value={valeur}
            onChange={(e) => onChanger(col, e.target.value)}
            maxLength={col.maxLength}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder={col.placeholder}
          />
        </div>
      )}

      {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Corps du formulaire
// ---------------------------------------------------------------------------
/**
 * Monté avec une `key` liée à l'entrée éditée : changer de cible remonte le
 * composant, ce qui réinitialise la saisie sans effet.
 */
export const CorpsFormulaire = ({ referentiel, entree, entrees, valeursDefaut, onEnregistrer }) => {
  const { colonnes } = referentiel
  const onglets = useMemo(() => structure(referentiel), [referentiel])
  const parNom = useMemo(
    () => Object.fromEntries(colonnes.map((col) => [col.nom, col])),
    [colonnes],
  )

  const [ongletActif, setOngletActif] = useState(0)
  const [valeurs, setValeurs] = useState(() => {
    if (entree) return { ...valeursVides(colonnes), ...entree }
    const depart = { ...valeursVides(colonnes), ...valeursDefaut }
    // Un code montré en lecture seule (adhérents) se lit dès l'ouverture, comme
    // dans l'application d'origine : on l'attribue ici plutôt qu'à
    // l'enregistrement, et c'est lui qui sera gardé.
    if (referentiel.genererCode && parNom.code?.lectureSeule) {
      depart.code = referentiel.genererCode(depart, entrees || [])
    }
    // Valeurs proposées d'après la saisie de départ — le compte d'un adhérent
    // suit son code : préremplies, mais librement modifiables ensuite.
    colonnes.forEach((col) => {
      if (col.valeurProposee && !depart[col.nom]) depart[col.nom] = col.valeurProposee(depart)
    })
    return depart
  })
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)

  /**
   * Verrou de sécurité : une fiche existante s'ouvre en lecture, champs figés.
   * Il faut décocher le cadenas pour pouvoir écrire — un clic de trop sur une
   * ligne du tableau ne peut donc plus altérer une donnée en place.
   *
   * La création n'est pas concernée : il n'y a rien à protéger dans une fiche
   * vide, et faire décocher un cadenas avant chaque saisie serait une gêne
   * sans contrepartie.
   */
  const verrouillable = Boolean(entree)
  const [verrouille, setVerrouille] = useState(verrouillable)

  // Champs dont la valeur devient caduque quand celui-ci change.
  const dependants = useMemo(
    () =>
      colonnes
        .filter((c) => c.dependDe)
        .reduce((acc, c) => {
          acc[c.dependDe] = [...(acc[c.dependDe] || []), c.nom]
          return acc
        }, {}),
    [colonnes],
  )

  const changer = (col, valeurBrute) => {
    const valeur =
      col.majuscules && typeof valeurBrute === 'string' ? valeurBrute.toUpperCase() : valeurBrute
    const aVider = dependants[col.nom] || []

    setValeurs((v) => {
      const suivant = { ...v, [col.nom]: valeur }
      // Changer le type d'une entité invalide son rattachement : le conserver
      // laisserait un service pointer sur une direction.
      aVider.forEach((nom) => {
        suivant[nom] = ''
      })
      return suivant
    })
    setErreurs((e) => ({
      ...e,
      [col.nom]: null,
      ...Object.fromEntries(aVider.map((n) => [n, null])),
    }))
  }

  const valider = (candidat) => {
    const trouvees = {}
    colonnes.forEach((col) => {
      if (col.calcule || col.lectureSeule || col.type === 'booleen') return // rien à exiger
      if (!champVisible(col, candidat)) return // champ masqué : rien à exiger
      const valeur = candidat[col.nom]
      if (champRequis(col, candidat) && !valeur) {
        trouvees[col.nom] = 'Champ obligatoire'
        return
      }
      // Une faute de frappe dans une adresse s'arrête ici, sous le champ,
      // plutôt qu'après un aller-retour au serveur.
      if (col.type === 'email' && valeur && !FORME_EMAIL.test(valeur)) {
        trouvees[col.nom] = 'Adresse e-mail invalide — exemple : contact@clinique.sn'
        return
      }
      if (col.unique && valeur) {
        const doublon = entrees.some(
          (e) =>
            e.id !== entree?.id && String(e[col.nom] || '').toLowerCase() === valeur.toLowerCase(),
        )
        if (doublon) trouvees[col.nom] = 'Cette valeur existe déjà'
      }
    })
    return trouvees
  }

  const soumettre = async (evenement) => {
    evenement.preventDefault()
    const candidat = {}
    colonnes.forEach((col) => {
      if (col.type === 'booleen' || col.type === 'etat') {
        candidat[col.nom] = Boolean(valeurs[col.nom])
        return
      }
      // Un champ figé porte la valeur que l'application calcule, pas ce que
      // l'écran affichait.
      if (col.lectureSeule) {
        candidat[col.nom] = col.valeur ? col.valeur(valeurs) : valeurs[col.nom] || ''
        return
      }
      const valeur = String(valeurs[col.nom] ?? '').trim()
      // Un champ masqué ne doit rien laisser derrière lui : une direction qui
      // était un service ne garde pas son ancien rattachement.
      candidat[col.nom] = champVisible(col, valeurs) ? valeur : ''
    })

    const trouvees = valider(candidat)
    if (Object.keys(trouvees).length) {
      montrerErreurs(trouvees)
      return
    }

    try {
      setEnvoi(true)
      await onEnregistrer(candidat, entree)
    } catch (e) {
      // Le serveur a refusé la saisie : ses erreurs se posent sous les champs,
      // exactement comme celles du formulaire — jamais de message technique.
      const duServeur = erreursDeChamps(e)
      if (!duServeur) {
        toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
        return
      }
      montrerErreurs(duServeur)
      // Un champ que ce formulaire ne montre pas (rare) se dit dans le message.
      const horsEcran = Object.keys(duServeur).find(
        (nom) => !colonnes.some((col) => col.nom === nom),
      )
      toast.error(
        horsEcran
          ? `Enregistrement impossible : ${duServeur[horsEcran]}`
          : 'Enregistrement impossible : vérifiez les champs signalés en rouge.',
      )
    } finally {
      setEnvoi(false)
    }
  }

  /**
   * Pose les erreurs sous leurs champs et ouvre l'onglet du premier fautif :
   * sans ça, une erreur sur un onglet masqué bloquerait l'enregistrement sans
   * que rien ne s'affiche. Sert aux erreurs du formulaire comme à celles que
   * renvoie le serveur.
   */
  const montrerErreurs = (trouvees) => {
    setErreurs(trouvees)
    const fautif = onglets.findIndex((onglet) =>
      champsDeLOnglet(onglet).some((nom) => trouvees[nom]),
    )
    if (fautif >= 0) setOngletActif(fautif)
  }

  const onglet = onglets[ongletActif] || onglets[0]

  // Sections toujours visibles au-dessus des onglets (identité d'un
  // participant, par exemple), déclarées par `formulaireEnTete`.
  const sectionsEnTete = referentiel.formulaireEnTete || []
  const premierChamp = sectionsEnTete[0]?.lignes?.[0]?.[0] || onglet.sections[0]?.lignes[0]?.[0]

  const rendreSection = (section, cle) => (
    <section className="ddb-section" key={cle}>
      {section.titre && <h3 className="ddb-section-titre">{section.titre}</h3>}
      {section.lignes.map((ligne) => {
        // Un champ conditionnel masqué ne doit pas laisser de colonne vide dans
        // la grille : on recalcule la ligne avant de la poser.
        const affiches = ligne.filter((nom) => parNom[nom] && champVisible(parNom[nom], valeurs))
        if (affiches.length === 0) return null

        return (
          <div
            className="ddb-ligne-champs"
            key={ligne.join('-')}
            style={{
              // Colonnes égales par défaut ; un champ « etat » prend sa largeur
              // naturelle pour ne pas être tronqué, les autres se partageant le reste.
              gridTemplateColumns: affiches
                .map((nom) => (parNom[nom].type === 'etat' ? 'auto' : 'minmax(0, 1fr)'))
                .join(' '),
            }}
          >
            {affiches.map((nom) => (
              <Champ
                key={nom}
                col={parNom[nom]}
                valeur={valeurs[nom] || ''}
                valeurs={valeurs}
                entrees={entrees}
                erreur={erreurs[nom]}
                autoFocus={nom === premierChamp}
                onChanger={changer}
              />
            ))}
          </div>
        )
      })}
    </section>
  )

  return (
    <form className="ddb-formulaire" onSubmit={soumettre} noValidate>
      {verrouillable && (
        <div className={`ddb-verrou${verrouille ? '' : ' ddb-verrou-ouvert'}`}>
          <label className="ddb-verrou-bascule">
            <input
              type="checkbox"
              checked={verrouille}
              onChange={(e) => setVerrouille(e.target.checked)}
            />
            <CIcon
              icon={verrouille ? cilLockLocked : cilLockUnlocked}
              className="ddb-verrou-icone"
            />
            <span>
              {verrouille
                ? 'Fiche verrouillée, décocher le cadenas pour modifier'
                : 'Fiche déverrouillée, les champs sont modifiables'}
            </span>
          </label>
        </div>
      )}

      {sectionsEnTete.length > 0 && (
        // <fieldset> plutôt que <div> : l'attribut « disabled » y neutralise
        // d'un coup tous les champs qu'il contient — saisies, listes, cases,
        // boutons d'état — sans avoir à le répercuter sur chaque type de champ,
        // et donc sans risque d'en oublier un le jour où un type s'ajoute.
        <fieldset className="ddb-formulaire-entete-champs" disabled={verrouille}>
          {sectionsEnTete.map((section, i) =>
            rendreSection(section, section.titre || `entete-${i}`),
          )}
        </fieldset>
      )}

      {onglets.length > 1 && (
        <div className="ddb-onglets" role="tablist">
          {onglets.map((o, index) => {
            const enErreur = champsDeLOnglet(o).some((nom) => erreurs[nom])
            return (
              <button
                type="button"
                role="tab"
                key={o.libelle}
                aria-selected={index === ongletActif}
                className={`ddb-onglet${index === ongletActif ? ' ddb-onglet-actif' : ''}${
                  enErreur ? ' ddb-onglet-erreur' : ''
                }`}
                onClick={() => setOngletActif(index)}
              >
                {o.libelle}
              </button>
            )
          })}
        </div>
      )}

      {/* La barre d'onglets reste hors du fieldset : verrouillée, la fiche se
          consulte toujours, on veut donc pouvoir passer d'un onglet à l'autre. */}
      <fieldset className="ddb-formulaire-champs" disabled={verrouille}>
        {onglet.sections.map((section, indexSection) =>
          rendreSection(section, section.titre || `section-${indexSection}`),
        )}
      </fieldset>

      <div className="ddb-formulaire-pied">
        <button type="submit" className="ddb-bouton-enregistrer" disabled={envoi || verrouille}>
          {envoi && <CSpinner size="sm" className="me-2" />}
          Enregistrer
        </button>
      </div>
    </form>
  )
}

const FormulaireEntree = ({
  referentiel,
  entree,
  entrees,
  valeursDefaut,
  titreCreation,
  visible,
  onFermer,
  onEnregistrer,
}) => {
  const modification = Boolean(entree)

  return (
    <COffcanvas
      placement="end"
      visible={visible}
      onHide={onFermer}
      backdrop
      className={`ddb-panneau${referentiel.formulaire ? ' ddb-panneau-large' : ''}`}
    >
      <div className="ddb-panneau-entete">
        <span className="ddb-panneau-titre">
          {modification ? referentiel.modifier : titreCreation || referentiel.nouveau}
        </span>
        <button type="button" className="ddb-panneau-fermer" onClick={onFermer} aria-label="Fermer">
          <CIcon icon={cilX} size="sm" />
        </button>
      </div>

      <COffcanvasBody className="p-0">
        {visible && (
          <CorpsFormulaire
            key={entree?.id || `nouvelle-entree-${JSON.stringify(valeursDefaut || {})}`}
            referentiel={referentiel}
            entree={entree}
            entrees={entrees}
            valeursDefaut={valeursDefaut}
            onEnregistrer={onEnregistrer}
          />
        )}
      </COffcanvasBody>
    </COffcanvas>
  )
}

export default FormulaireEntree

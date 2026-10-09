/**
 * Onglet « Informations Générales IPM ».
 *
 * Repris tel quel de l'application d'origine : une carte « Informations
 * Générales » avec le logo à gauche, les informations à droite, puis le plan
 * en dessous. Le crayon du logo le remplace, celui des informations ouvre la
 * saisie - intitulé, adresse, téléphone fixe, fax, boîte postale, email d'un
 * côté ; contact et position géographique de l'autre.
 *
 * Servi par le backend (/api/informations-ipm/), fiche unique.
 */

import React, { useEffect, useRef, useState } from 'react'
import { CButton, COffcanvas, COffcanvasBody, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPencil, cilX } from '@coreui/icons'

import { request } from '../../services/api'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { useConfirmation } from '../donnees-de-base/Confirmation'

const CHEMIN = '/informations-ipm/'

/** Côté maximal du logo enregistré : il voyage dans chaque réponse de l'API. */
const COTE_LOGO = 400

/** Lit un fichier image, le réduit et le rend en URL de données. */
const reduireImage = (fichier) =>
  new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error('lecture impossible'))
    lecteur.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('image illisible'))
      image.onload = () => {
        const ratio = Math.min(1, COTE_LOGO / Math.max(image.width, image.height))
        const toile = document.createElement('canvas')
        toile.width = Math.round(image.width * ratio)
        toile.height = Math.round(image.height * ratio)
        toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height)
        resolve(toile.toDataURL('image/png'))
      }
      image.src = lecteur.result
    }
    lecteur.readAsDataURL(fichier)
  })

/** Une information : son libellé en petit, sa valeur dessous. */
const Donnee = ({ libelle, valeur }) => (
  <div className="prm-donnee">
    <span className="prm-donnee-libelle">{libelle}</span>
    <span className="prm-donnee-valeur">{valeur || <span className="prm-muet">-</span>}</span>
  </div>
)

/** Champ de saisie, comme sur les autres pages : libellé posé sur le cadre. */
const Champ = ({ libelle, valeur, erreur, onChanger, ...reste }) => (
  <div className={`ddb-groupe${erreur ? ' ddb-groupe-erreur' : ''}`}>
    <label>{libelle}</label>
    <input
      className="ddb-champ"
      value={valeur}
      onChange={(e) => onChanger(e.target.value)}
      autoComplete="off"
      {...reste}
    />
    {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
  </div>
)

const InformationsIpm = () => {
  const [infos, setInfos] = useState(null)
  const [saisie, setSaisie] = useState(null)
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const champFichier = useRef(null)
  const [demanderConfirmation, modaleConfirmation, confirmationOuverte] = useConfirmation()

  useEffect(() => {
    request(CHEMIN)
      .then(setInfos)
      .catch((e) => toast.error(`Chargement impossible : ${messageErreur(e)}`))
  }, [])

  const enregistrer = async (valeurs, message) => {
    const confirme = await demanderConfirmation({
      titre: 'Confirmer la modification',
      message,
      confirmer: 'Enregistrer',
    })
    if (!confirme) return false
    try {
      setEnvoi(true)
      const fiche = await request(CHEMIN, { method: 'PATCH', body: JSON.stringify(valeurs) })
      setInfos(fiche)
      toast.success('Informations mises à jour')
      return true
    } catch (e) {
      const duServeur = erreursDeChamps(e)
      if (duServeur) {
        setErreurs(duServeur)
        toast.error('Enregistrement impossible : vérifiez les champs signalés en rouge.')
      } else {
        toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
      }
      return false
    } finally {
      setEnvoi(false)
    }
  }

  const remplacerLogo = async (fichier) => {
    if (!fichier) return
    try {
      const logo = await reduireImage(fichier)
      await enregistrer({ logo }, 'Remplacer le logo de l’IPM ?')
    } catch {
      toast.error('Image illisible : choisissez un fichier PNG ou JPEG.')
    }
  }

  if (!infos) {
    return (
      <div className="prm-chargement">
        <CSpinner size="sm" />
        <span>Chargement des informations…</span>
      </div>
    )
  }

  const plan =
    infos.latitude && infos.longitude
      ? // `t=k` : vue satellite par défaut (plutôt que le plan de ville).
        `https://maps.google.com/maps?q=${infos.latitude},${infos.longitude}&z=16&t=k&output=embed`
      : null

  /**
   * Le cadre du logo. Le crayon pour le remplacer n'apparaît qu'en modification
   * (`avecCrayon`) : en consultation, le logo se montre sans bouton.
   */
  const cadreLogo = (avecCrayon = false) => (
    <div className="prm-logo-cadre">
      {infos.logo && <img src={infos.logo} alt={infos.intitule} />}
      {avecCrayon && (
        <>
          <CButton
            color="light"
            size="sm"
            className="ddb-action"
            onClick={() => champFichier.current?.click()}
            disabled={envoi}
            aria-label="Remplacer le logo"
          >
            <CIcon icon={cilPencil} />
          </CButton>
          <input
            ref={champFichier}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              const fichier = e.target.files?.[0]
              e.target.value = ''
              remplacerLogo(fichier)
            }}
          />
        </>
      )}
    </div>
  )

  // --- Modification (modal) -------------------------------------------------
  const changer = (champ) => (valeur) => {
    setSaisie((s) => ({ ...s, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: null }))
  }

  const soumettre = async (evenement) => {
    evenement.preventDefault()
    const [latitude = '', longitude = ''] = (saisie?.coordonnees || '')
      .split(',')
      .map((v) => v.trim())
    const { coordonnees, ...reste } = saisie || {}
    if (await enregistrer({ ...reste, latitude, longitude }, 'Enregistrer les informations ?')) {
      setSaisie(null)
    }
  }

  const panneauSaisie = (
    <COffcanvas
      placement="end"
      visible={Boolean(saisie)}
      onHide={() => setSaisie(null)}
      backdrop={!confirmationOuverte}
      keyboard={!confirmationOuverte}
      className="ddb-panneau ddb-panneau-large"
    >
      <div className="ddb-panneau-entete">
        <span className="ddb-panneau-titre">Informations Générales</span>
        <button
          type="button"
          className="ddb-panneau-fermer"
          onClick={() => setSaisie(null)}
          aria-label="Fermer"
        >
          <CIcon icon={cilX} size="sm" />
        </button>
      </div>
      <COffcanvasBody className="p-0">
        {saisie && (
          <form className="ddb-formulaire" onSubmit={soumettre} noValidate>
            <div className="ddb-formulaire-champs">
              <div className="prm-identite">
                {cadreLogo(true)}

                <div className="prm-colonnes">
                  <div className="prm-colonne">
                    <Champ
                      libelle="Intitulé"
                      valeur={saisie.intitule}
                      erreur={erreurs.intitule}
                      onChanger={changer('intitule')}
                      maxLength={150}
                    />
                    <Champ
                      libelle="Adresse"
                      valeur={saisie.adresse}
                      erreur={erreurs.adresse}
                      onChanger={changer('adresse')}
                      maxLength={255}
                    />
                    <Champ
                      libelle="Téléphone Fixe"
                      valeur={saisie.telephone}
                      erreur={erreurs.telephone}
                      onChanger={changer('telephone')}
                      maxLength={30}
                    />
                    <Champ
                      libelle="FAX"
                      valeur={saisie.fax}
                      erreur={erreurs.fax}
                      onChanger={changer('fax')}
                      maxLength={30}
                    />
                    <Champ
                      libelle="Boite Postale"
                      valeur={saisie.boitePostale}
                      erreur={erreurs.boitePostale}
                      onChanger={changer('boitePostale')}
                      maxLength={30}
                    />
                    <Champ
                      libelle="Email"
                      valeur={saisie.email}
                      erreur={erreurs.email}
                      onChanger={changer('email')}
                      type="email"
                    />
                  </div>

                  <div className="prm-colonne">
                    <p className="prm-sous-entete">Contact</p>
                    <Champ
                      libelle="Contact"
                      valeur={saisie.contactNom}
                      erreur={erreurs.contactNom}
                      onChanger={changer('contactNom')}
                      maxLength={120}
                    />
                    <Champ
                      libelle="Téléphone Contact"
                      valeur={saisie.contactTelephone}
                      erreur={erreurs.contactTelephone}
                      onChanger={changer('contactTelephone')}
                      maxLength={30}
                    />
                    <Champ
                      libelle="Email Contact"
                      valeur={saisie.contactEmail}
                      erreur={erreurs.contactEmail}
                      onChanger={changer('contactEmail')}
                      type="email"
                    />

                    <p className="prm-sous-entete">Position Géographique</p>
                    <Champ
                      libelle="Coordonnées"
                      valeur={saisie.coordonnees}
                      erreur={erreurs.latitude || erreurs.longitude}
                      onChanger={changer('coordonnees')}
                      maxLength={41}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="ddb-formulaire-pied">
              <button type="submit" className="ddb-bouton-enregistrer" disabled={envoi}>
                {envoi && <CSpinner size="sm" className="me-2" />}
                Enregistrer
              </button>
            </div>
          </form>
        )}
      </COffcanvasBody>
    </COffcanvas>
  )

  // --- Consultation ---------------------------------------------------------
  const ouvrirModification = () => {
    setErreurs({})
    setSaisie({
      intitule: infos.intitule || '',
      adresse: infos.adresse || '',
      telephone: infos.telephone || '',
      fax: infos.fax || '',
      boitePostale: infos.boitePostale || '',
      email: infos.email || '',
      contactNom: infos.contactNom || '',
      contactTelephone: infos.contactTelephone || '',
      contactEmail: infos.contactEmail || '',
      coordonnees: infos.latitude && infos.longitude ? `${infos.latitude}, ${infos.longitude}` : '',
    })
  }

  return (
    <>
      <div className="ddb-referentiel-entete">
        <h2 className="ddb-referentiel-titre">Informations Générales</h2>
        <CButton
          color="light"
          size="sm"
          className="ddb-action ms-auto"
          onClick={ouvrirModification}
          aria-label="Modifier les informations"
        >
          <CIcon icon={cilPencil} />
        </CButton>
      </div>

      <div className="prm-deux-colonnes">
        <div className="prm-identite">
          {cadreLogo(false)}

          <div className="prm-donnees">
            <Donnee libelle="Intitulé" valeur={infos.intitule} />
            <Donnee libelle="Adresse" valeur={infos.adresse} />
            <Donnee libelle="Téléphone" valeur={`Fixe: ${infos.telephone}`} />
            <Donnee libelle="Fax" valeur={infos.fax} />
            <Donnee libelle="Boite Postale" valeur={infos.boitePostale} />
            <Donnee libelle="Email" valeur={infos.email} />
            <Donnee libelle="Contact" valeur={infos.contactNom} />
            <Donnee libelle="Téléphone" valeur={infos.contactTelephone} />
            <Donnee libelle="Email" valeur={infos.contactEmail} />
          </div>
        </div>

        {plan && (
          <div className="prm-plan">
            <iframe
              title="Position géographique de l’IPM"
              src={plan}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
      </div>

      {panneauSaisie}
      {modaleConfirmation}
    </>
  )
}

export default InformationsIpm

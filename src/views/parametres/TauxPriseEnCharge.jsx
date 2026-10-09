/**
 * Onglet « Taux de Prise en Charge ».
 *
 * Repris de l'écran Paramètres de l'application d'origine : on choisit une
 * société et une nature de prestation ; la liste montre alors un taux par
 * qualité de bénéficiaire - code, intitulé, type de bénéficiaire, taux,
 * plafond, forfait et compte. Le compte comptable ne se saisit pas : c'est
 * celui de la prestation.
 *
 * Le barème est un produit complet : chaque société, chaque nature, chaque
 * qualité de bénéficiaire. La liste le montre comme tel - les combinaisons
 * sans taux y figurent, marquées « à définir », plutôt que d'être absentes.
 * Une combinaison absente n'est pas « zéro » : c'est un trou que personne ne
 * voit, et des soins qui ne seraient couverts par rien le jour où une facture
 * se présente.
 *
 * Le bouton « Taux Ex » ouvre les taux ciblés sur une personne : un participant
 * et une nature de prestation, avec leurs propres valeurs. La saisie et la
 * liste y cohabitent, comme à l'origine.
 *
 * Tout vient du backend (/api/taux-prise-en-charge/, /api/taux-exceptionnels/).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CButton,
  COffcanvas,
  COffcanvasBody,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilDescription, cilPlus, cilTrash, cilX } from '@coreui/icons'

import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import {
  creerEntree,
  listerEntrees,
  listerEntreesSync,
  modifierEntree,
  supprimerEntree,
} from '../../services/referentiels'

/** Valeur du filtre « toutes les natures » : aucune nature choisie. */
const TOUTES_LES_NATURES = ''

/**
 * Dossiers clos : la couverture a pris fin. Un taux exceptionnel qui les
 * viserait ne s'appliquerait jamais - le serveur le refuse, et la liste ne
 * les propose pas.
 */
const DOSSIERS_CLOS = ['Résilié', 'Radié']
import { toast } from '../../services/toast'
import { useConfirmation } from '../donnees-de-base/Confirmation'

const actifs = (cle) => listerEntreesSync(cle).filter((e) => e.actif !== false)

/** Montant en francs CFA : « 250 000 ». */
const montant = (valeur) => Number(valeur || 0).toLocaleString('fr-FR')

const entier = (texte) => String(texte ?? '').replace(/\D/g, '')

// Valeurs de départ d'une création, comme l'écran d'origine : un taux à 50,
// un plafond et un forfait à 0.
const SAISIE_VIDE = { prestation: '', typeBenef: '', taux: '50', plafond: '0', forfait: '0' }
const SAISIE_EXC_VIDE = {
  matriculePart: '',
  prestation: '',
  taux: '50',
  plafond: '0',
  forfait: '0',
}

/** Champ de saisie, comme sur les autres pages : libellé posé sur le cadre. */
const Champ = ({ libelle, erreur, fige = false, children }) => (
  <div
    className={`ddb-groupe${fige ? ' ddb-groupe-fige' : ''}${erreur ? ' ddb-groupe-erreur' : ''}`}
  >
    <label>{libelle}</label>
    {children}
    {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
  </div>
)

const TauxPriseEnCharge = () => {
  const societes = actifs('adherents')
  const prestations = actifs('types-prestations')
  const typesBenef = actifs('types-beneficiaires')

  const [societe, setSociete] = useState(() => societes[0]?.code || '')
  const [filtrePrestation, setFiltrePrestation] = useState(() => prestations[0]?.code || '')
  const [taux, setTaux] = useState([])
  const [exceptionnels, setExceptionnels] = useState([])
  const [chargement, setChargement] = useState(true)
  // « liste », « formulaire » (création ou modification), « exceptionnels ».
  const [vue, setVue] = useState('liste')
  const [edite, setEdite] = useState(null)
  // Clé (prestation-typeBenef) de la ligne en cours d'édition : sert à la
  // colorer en rouge, y compris les lignes « à définir » (sans identifiant).
  const [cleEditee, setCleEditee] = useState(null)
  const [saisie, setSaisie] = useState(SAISIE_VIDE)
  const [erreurs, setErreurs] = useState({})
  const [saisieExc, setSaisieExc] = useState(SAISIE_EXC_VIDE)
  const [erreursExc, setErreursExc] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [demanderConfirmation, modaleConfirmation, confirmationOuverte] = useConfirmation()

  // Rien n'est posé avant le premier `await` : l'effet ne déclenche pas de
  // rendu en cascade au montage.
  const charger = useCallback(async () => {
    try {
      const [listeTaux, listeExc] = await Promise.all([
        listerEntrees('taux-prise-en-charge'),
        listerEntrees('taux-exceptionnels'),
      ])
      setTaux(listeTaux)
      setExceptionnels(listeExc)
    } catch (e) {
      toast.error(`Chargement impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    // La règle signale tout appel menant à un setState ; ici les états ne sont
    // posés qu'après la réponse du serveur, jamais pendant le rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  const nomSociete = societes.find((s) => s.code === societe)?.libelle || ''

  /**
   * Le barème de la société, tel qu'il devrait être : une ligne par nature de
   * prestation et par qualité de bénéficiaire. Les combinaisons déjà réglées
   * portent leur taux ; les autres restent visibles, sans valeur, pour qu'on
   * les remarque - et se règlent d'un clic.
   */
  const lignes = useMemo(() => {
    const poses = new Map(
      taux.filter((t) => t.codeSoc === societe).map((t) => [`${t.prestation}|${t.typeBenef}`, t]),
    )
    const naturesVues = filtrePrestation
      ? prestations.filter((p) => p.code === filtrePrestation)
      : prestations
    return naturesVues.flatMap((p) =>
      typesBenef.map((b) => {
        const pose = poses.get(`${p.code}|${b.code}`)
        return (
          pose || {
            // Ligne à définir : aucun identifiant, donc aucune modification -
            // le crayon ouvre une création déjà remplie.
            id: null,
            codeSoc: societe,
            prestation: p.code,
            intitule: p.libelle,
            typeBenef: b.code,
            typeBenefLibelle: b.libelle,
            compte: p.compte || '',
          }
        )
      }),
    )
  }, [taux, societe, filtrePrestation, prestations, typesBenef])

  /** Combien de combinaisons attendent encore un taux, pour la vue affichée. */
  const aDefinir = useMemo(() => lignes.filter((l) => l.id === null).length, [lignes])

  const lignesExceptionnelles = useMemo(
    () => exceptionnels.filter((t) => t.codeSoc === societe),
    [exceptionnels, societe],
  )

  const participants = useMemo(
    () =>
      actifs('participants').filter(
        (p) => p.adherent === societe && !DOSSIERS_CLOS.includes(p.etat),
      ),
    [societe],
  )

  const compteDe = (code) => prestations.find((p) => p.code === code)?.compte || ''

  // --- Saisie ---------------------------------------------------------------
  const changer = (champ, valeur) => {
    setSaisie((s) => ({ ...s, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: null }))
  }

  const changerExc = (champ, valeur) => {
    setSaisieExc((s) => ({ ...s, [champ]: valeur }))
    setErreursExc((e) => ({ ...e, [champ]: null }))
  }

  const ouvrirCreation = () => {
    setEdite(null)
    setCleEditee(null)
    setSaisie(SAISIE_VIDE)
    setErreurs({})
    setVue('formulaire')
  }

  const ouvrirModification = (ligne) => {
    // Une ligne sans identifiant n'existe pas encore : le formulaire s'ouvre
    // en création, la nature et la qualité déjà choisies.
    setEdite(ligne.id === null ? null : ligne)
    setCleEditee(`${ligne.prestation}-${ligne.typeBenef}`)
    setSaisie({
      prestation: ligne.prestation,
      typeBenef: ligne.typeBenef,
      taux: ligne.id === null ? SAISIE_VIDE.taux : String(ligne.taux),
      plafond: ligne.id === null ? SAISIE_VIDE.plafond : String(ligne.plafond),
      forfait: ligne.id === null ? SAISIE_VIDE.forfait : String(ligne.forfait),
    })
    setErreurs({})
    setVue('formulaire')
  }

  /** Erreurs du serveur posées sous les champs ; le reste part en message. */
  const poserErreurs = (e, poser) => {
    const duServeur = erreursDeChamps(e)
    if (!duServeur) {
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
      return
    }
    poser(duServeur)
    const horsChamp = duServeur.non_field_errors
    toast.error(
      horsChamp
        ? `Enregistrement impossible : ${horsChamp}`
        : 'Enregistrement impossible : vérifiez les champs signalés en rouge.',
    )
  }

  const enregistrer = async (evenement) => {
    evenement.preventDefault()
    const trouvees = {}
    if (!saisie.prestation) trouvees.prestation = 'Champ obligatoire'
    if (!saisie.typeBenef) trouvees.typeBenef = 'Champ obligatoire'
    if (Object.keys(trouvees).length) {
      setErreurs(trouvees)
      return
    }

    const valeurs = {
      codeSoc: societe,
      prestation: saisie.prestation,
      typeBenef: saisie.typeBenef,
      taux: Number(entier(saisie.taux) || 0),
      plafond: Number(entier(saisie.plafond) || 0),
      forfait: Number(entier(saisie.forfait) || 0),
    }
    const confirme = await demanderConfirmation(
      edite
        ? {
            titre: 'Confirmer la modification',
            message: `Enregistrer les modifications de ce taux pour ${nomSociete} ?`,
            confirmer: 'Enregistrer',
          }
        : {
            titre: 'Confirmer l’ajout',
            message: `Ajouter ce taux pour ${nomSociete} ?`,
            confirmer: 'Ajouter',
          },
    )
    if (!confirme) return

    try {
      setEnvoi(true)
      if (edite) {
        await modifierEntree('taux-prise-en-charge', edite.id, valeurs)
        toast.success('Taux mis à jour')
      } else {
        await creerEntree('taux-prise-en-charge', valeurs)
        toast.success('Taux ajouté')
      }
      setVue('liste')
      await charger()
    } catch (e) {
      poserErreurs(e, setErreurs)
    } finally {
      setEnvoi(false)
    }
  }

  const enregistrerExceptionnel = async (evenement) => {
    evenement.preventDefault()
    const trouvees = {}
    if (!saisieExc.matriculePart) trouvees.matriculePart = 'Champ obligatoire'
    if (!saisieExc.prestation) trouvees.prestation = 'Champ obligatoire'
    if (Object.keys(trouvees).length) {
      setErreursExc(trouvees)
      return
    }
    const confirme = await demanderConfirmation({
      titre: 'Confirmer l’ajout',
      message: 'Ajouter ce taux exceptionnel ?',
      confirmer: 'Ajouter',
    })
    if (!confirme) return
    try {
      setEnvoi(true)
      await creerEntree('taux-exceptionnels', {
        matriculePart: saisieExc.matriculePart,
        prestation: saisieExc.prestation,
        taux: Number(entier(saisieExc.taux) || 0),
        plafond: Number(entier(saisieExc.plafond) || 0),
        forfait: Number(entier(saisieExc.forfait) || 0),
      })
      toast.success('Taux exceptionnel ajouté')
      setSaisieExc(SAISIE_EXC_VIDE)
      await charger()
    } catch (e) {
      poserErreurs(e, setErreursExc)
    } finally {
      setEnvoi(false)
    }
  }

  const supprimerExceptionnel = async (ligne) => {
    const confirme = await demanderConfirmation({
      titre: 'Confirmer la suppression',
      message: `Supprimer le taux exceptionnel de ${ligne.beneficiaire} pour « ${ligne.intitule} » ? Cette action est définitive.`,
      confirmer: 'Supprimer',
      danger: true,
    })
    if (!confirme) return
    try {
      await supprimerEntree('taux-exceptionnels', ligne.id)
      toast.info('Taux exceptionnel supprimé')
      await charger()
    } catch (e) {
      toast.error(`Suppression impossible : ${messageErreur(e)}`)
    }
  }

  // --- Création et modification (panneau glissant) --------------------------
  const panneauFormulaire = (
    <COffcanvas
      placement="end"
      visible={vue === 'formulaire'}
      onHide={() => setVue('liste')}
      backdrop={!confirmationOuverte}
      keyboard={!confirmationOuverte}
      className="ddb-panneau ddb-panneau-large"
    >
      <div className="ddb-panneau-entete">
        <span className="ddb-panneau-titre">
          {edite ? 'Modification' : 'Création'} de Taux de Prise en Charge ({nomSociete})
        </span>
        <button
          type="button"
          className="ddb-panneau-fermer"
          onClick={() => setVue('liste')}
          aria-label="Fermer"
        >
          <CIcon icon={cilX} size="sm" />
        </button>
      </div>
      <COffcanvasBody className="p-0">
        {vue === 'formulaire' && (
          <form className="ddb-formulaire" onSubmit={enregistrer} noValidate>
            <div className="ddb-formulaire-champs">
              <div className="prm-colonnes">
                <div className="prm-colonne">
                  <Champ libelle="Nature prestation" erreur={erreurs.prestation}>
                    <select
                      className="ddb-champ ddb-champ-liste"
                      value={saisie.prestation}
                      onChange={(e) => changer('prestation', e.target.value)}
                    >
                      <option value="">- - - selectionner - - -</option>
                      {prestations.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.code} - {p.libelle}
                        </option>
                      ))}
                    </select>
                  </Champ>

                  <Champ libelle="Type beneficiaire" erreur={erreurs.typeBenef}>
                    <select
                      className="ddb-champ ddb-champ-liste"
                      value={saisie.typeBenef}
                      onChange={(e) => changer('typeBenef', e.target.value)}
                    >
                      <option value="">- - - selectionner - - -</option>
                      {typesBenef.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.libelle}
                        </option>
                      ))}
                    </select>
                  </Champ>
                </div>

                <div className="prm-colonne">
                  <Champ libelle="Taux" erreur={erreurs.taux}>
                    <input
                      className="ddb-champ"
                      inputMode="numeric"
                      maxLength={3}
                      value={saisie.taux}
                      onChange={(e) => changer('taux', entier(e.target.value))}
                    />
                  </Champ>

                  <Champ libelle="Plafond" erreur={erreurs.plafond}>
                    <input
                      className="ddb-champ"
                      inputMode="numeric"
                      maxLength={11}
                      value={saisie.plafond}
                      onChange={(e) => changer('plafond', entier(e.target.value))}
                    />
                  </Champ>

                  <Champ libelle="Forfait" erreur={erreurs.forfait}>
                    <input
                      className="ddb-champ"
                      inputMode="numeric"
                      maxLength={11}
                      value={saisie.forfait}
                      onChange={(e) => changer('forfait', entier(e.target.value))}
                    />
                  </Champ>

                  {/* Le compte vient de la prestation : montré, jamais saisi. */}
                  <Champ libelle="Compte" fige>
                    <input
                      className="ddb-champ"
                      value={compteDe(saisie.prestation)}
                      disabled
                      readOnly
                    />
                  </Champ>
                </div>
              </div>
            </div>

            <div className="ddb-formulaire-pied">
              <button type="submit" className="ddb-bouton-enregistrer" disabled={envoi}>
                {envoi && <CSpinner size="sm" className="me-2" />}
                {edite ? 'Modifier' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </COffcanvasBody>
    </COffcanvas>
  )

  // --- Taux exceptionnels : affichés directement dans la même card que le
  // barème (pas de panneau). La bascule « Taux Ex » / « Retour au barème »
  // change le tableau montré.
  const contenuExceptionnels = (
    <>
      <h2 className="prm-section-titre">Taux de prise en charge exceptionnel - {nomSociete}</h2>
      <form onSubmit={enregistrerExceptionnel} noValidate>
        <div className="prm-trois-colonnes">
          <Champ libelle="Participant" erreur={erreursExc.matriculePart}>
            <select
              className="ddb-champ ddb-champ-liste"
              value={saisieExc.matriculePart}
              onChange={(e) => changerExc('matriculePart', e.target.value)}
            >
              <option value="">- - - selectionner - - -</option>
              {participants.map((p) => (
                <option key={p.matricule} value={p.matricule}>
                  {p.matricule} - {p.prenoms} {p.nom}
                </option>
              ))}
            </select>
          </Champ>

          <Champ libelle="Nature prestation" erreur={erreursExc.prestation}>
            <select
              className="ddb-champ ddb-champ-liste"
              value={saisieExc.prestation}
              onChange={(e) => changerExc('prestation', e.target.value)}
            >
              <option value="">- - - selectionner - - -</option>
              {prestations.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} - {p.libelle}
                </option>
              ))}
            </select>
          </Champ>

          <Champ libelle="Compte" fige>
            <input className="ddb-champ" value={compteDe(saisieExc.prestation)} disabled readOnly />
          </Champ>

          <Champ libelle="Taux" erreur={erreursExc.taux}>
            <input
              className="ddb-champ"
              inputMode="numeric"
              maxLength={3}
              value={saisieExc.taux}
              onChange={(e) => changerExc('taux', entier(e.target.value))}
            />
          </Champ>

          <Champ libelle="Plafond" erreur={erreursExc.plafond}>
            <input
              className="ddb-champ"
              inputMode="numeric"
              maxLength={11}
              value={saisieExc.plafond}
              onChange={(e) => changerExc('plafond', entier(e.target.value))}
            />
          </Champ>

          <Champ libelle="Forfait" erreur={erreursExc.forfait}>
            <input
              className="ddb-champ"
              inputMode="numeric"
              maxLength={11}
              value={saisieExc.forfait}
              onChange={(e) => changerExc('forfait', entier(e.target.value))}
            />
          </Champ>
        </div>

        <div className="prm-ligne-bouton">
          <button type="submit" className="ddb-bouton-enregistrer" disabled={envoi}>
            {envoi && <CSpinner size="sm" className="me-2" />}
            Enregistrer
          </button>
        </div>
      </form>

      <div className="ddb-tableau-conteneur mt-4">
        <CTable hover responsive className="ddb-tableau align-middle mb-0">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell style={{ width: '120px' }}>Matricule</CTableHeaderCell>
              <CTableHeaderCell>Bénéficiaire</CTableHeaderCell>
              <CTableHeaderCell style={{ width: '90px' }}>Code</CTableHeaderCell>
              <CTableHeaderCell>Intitulé</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Taux</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Plafond</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Forfait</CTableHeaderCell>
              <CTableHeaderCell style={{ width: '70px' }} aria-label="Actions" />
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {lignesExceptionnelles.map((l) => (
              <CTableRow key={l.id} className="ddb-ligne">
                <CTableDataCell>
                  <span className="ddb-mono">{l.matriculePart}</span>
                </CTableDataCell>
                <CTableDataCell>{l.beneficiaire}</CTableDataCell>
                <CTableDataCell>
                  <span className="ddb-mono">{l.prestation}</span>
                </CTableDataCell>
                <CTableDataCell>{l.intitule}</CTableDataCell>
                <CTableDataCell className="text-end">{l.taux} %</CTableDataCell>
                <CTableDataCell className="text-end">{montant(l.plafond)} CFA</CTableDataCell>
                <CTableDataCell className="text-end">{montant(l.forfait)} CFA</CTableDataCell>
                <CTableDataCell className="text-end">
                  <CButton
                    color="light"
                    size="sm"
                    className="ddb-action ddb-action-danger"
                    onClick={() => supprimerExceptionnel(l)}
                    aria-label={`Supprimer le taux exceptionnel de ${l.beneficiaire}`}
                  >
                    <CIcon icon={cilTrash} />
                  </CButton>
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      </div>
    </>
  )

  // --- Liste -----------------------------------------------------------------
  return (
    <>
      <div className="ddb-barre-outils ddb-barre-soulignee">
        <label className="ddb-filtre-groupe">
          <span className="ddb-filtre-etiquette">Société</span>
          <select
            className="ddb-filtre"
            value={societe}
            onChange={(e) => setSociete(e.target.value)}
          >
            {societes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} - {s.libelle}
              </option>
            ))}
          </select>
        </label>

        {vue !== 'exceptionnels' && (
          <label className="ddb-filtre-groupe">
            <span className="ddb-filtre-etiquette">Prestation</span>
            <select
              className="ddb-filtre"
              value={filtrePrestation}
              onChange={(e) => setFiltrePrestation(e.target.value)}
            >
              {/* Le barème entier d'un coup : c'est la seule façon de voir
                  d'un regard ce qui reste à définir pour la société. */}
              <option value={TOUTES_LES_NATURES}>Toutes les natures</option>
              {prestations.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} - {p.libelle}
                </option>
              ))}
            </select>
          </label>
        )}

        {vue !== 'exceptionnels' && aDefinir > 0 && (
          <span className="prm-alerte" role="status">
            {aDefinir} combinaison{aDefinir > 1 ? 's' : ''} sans taux
          </span>
        )}

        <div className="ddb-barre-actions ddb-barre-actions-droite">
          {vue === 'exceptionnels' ? (
            // Retour au barème : même card, on remet le tableau du barème.
            <button type="button" className="ddb-outil" onClick={() => setVue('liste')}>
              Retour au barème
            </button>
          ) : (
            <>
              <button type="button" className="ddb-outil" onClick={() => setVue('exceptionnels')}>
                Taux Ex
                <CIcon icon={cilDescription} className="ddb-outil-icone" />
              </button>
              <button type="button" className="ddb-bouton-nouveau" onClick={ouvrirCreation}>
                Créer
                <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
              </button>
            </>
          )}
        </div>
      </div>

      {vue === 'exceptionnels' && contenuExceptionnels}

      {vue !== 'exceptionnels' && (
        <div className="ddb-tableau-conteneur">
          <CTable hover responsive className="ddb-tableau align-middle mb-0">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell style={{ width: '90px' }}>Code</CTableHeaderCell>
                <CTableHeaderCell>Intitulé</CTableHeaderCell>
                <CTableHeaderCell>Type benef.</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Taux</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Plafond</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Forfait</CTableHeaderCell>
                {/* Le compte que la charge ira débiter à la comptabilisation :
                  celui de la nature de prestation, jamais saisi ici. */}
                <CTableHeaderCell style={{ width: '110px' }}>Compte</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {chargement ? (
                <CTableRow>
                  <CTableDataCell colSpan={7} className="ddb-etat-vide">
                    <CSpinner size="sm" className="me-2" />
                    Chargement…
                  </CTableDataCell>
                </CTableRow>
              ) : (
                lignes.map((l) => (
                  <CTableRow
                    key={`${l.prestation}-${l.typeBenef}`}
                    className={`ddb-ligne${l.id === null ? ' prm-ligne-a-definir' : ''}${
                      vue === 'formulaire' && cleEditee === `${l.prestation}-${l.typeBenef}`
                        ? ' ddb-ligne-active'
                        : ''
                    }`}
                    onClick={() => ouvrirModification(l)}
                  >
                    <CTableDataCell>
                      <span className="ddb-mono">{l.prestation}</span>
                    </CTableDataCell>
                    <CTableDataCell>{l.intitule}</CTableDataCell>
                    <CTableDataCell>{l.typeBenefLibelle}</CTableDataCell>
                    {l.id === null ? (
                      <CTableDataCell colSpan={3} className="prm-a-definir">
                        à définir
                      </CTableDataCell>
                    ) : (
                      <>
                        <CTableDataCell className="text-end">{l.taux} %</CTableDataCell>
                        <CTableDataCell className="text-end">
                          {montant(l.plafond)} CFA
                        </CTableDataCell>
                        <CTableDataCell className="text-end">
                          {montant(l.forfait)} CFA
                        </CTableDataCell>
                      </>
                    )}
                    <CTableDataCell>
                      <span className="ddb-mono">{l.compte}</span>
                    </CTableDataCell>
                  </CTableRow>
                ))
              )}
            </CTableBody>
          </CTable>
        </div>
      )}

      {panneauFormulaire}
      {modaleConfirmation}
    </>
  )
}

export default TauxPriseEnCharge

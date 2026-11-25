/**
 * Ayants droit d'un participant, affichés sous sa ligne quand on la déplie
 * (cf. Referentiel `composantDeplie`). C'est la vision « un participant, sa
 * famille en place » : on cherche le participant, on déroule sa ligne, et ses
 * conjoints et enfants s'y lisent - au lieu d'ouvrir la fiche ou de parcourir
 * l'onglet « Familles ».
 *
 * Les bénéficiaires sont déjà en mémoire (préchargés comme les autres
 * référentiels) : on les lit par le matricule et la société du participant,
 * sans requête. « Ajouter membre » réutilise le formulaire des familles, le
 * matricule du participant posé d'avance ; le matricule du bénéficiaire, lui,
 * est composé par le serveur (« 01-1100-21 »).
 */

import React, { useMemo, useState } from 'react'
import { CBadge, CButton, CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPencil, cilPlus } from '@coreui/icons'

import { creerEntree, listerEntreesSync, modifierEntree } from '../../services/referentiels'
import { toast } from '../../services/toast'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import FormulaireEntree from '../donnees-de-base/FormulaireEntree'
import { FAMILLES } from './config'

/** Couleur de la pastille d'état, comme la colonne « Etat » des listes. */
const COULEUR_ETAT = {
  Actif: 'success',
  'En Attente': 'secondary',
  Suspendu: 'warning',
  Résilié: 'danger',
  Radié: 'dark',
}

/** « EPOUSE » → « Epouse ». */
const capitaliser = (mot) => (mot ? mot.charAt(0) + mot.slice(1).toLowerCase() : '')

/** AAAA-MM-JJ → JJ/MM/AAAA, pour l'affichage. */
const formaterDate = (iso) => {
  if (!iso) return ''
  const [a, m, j] = String(iso).split('-')
  return j && m && a ? `${j}/${m}/${a}` : iso
}

/** Âge en années révolues (compté de date à date, comme les listes). */
const calculerAge = (iso) => {
  if (!iso) return ''
  const naissance = new Date(iso)
  if (Number.isNaN(naissance.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - naissance.getFullYear()
  const avant =
    now.getMonth() < naissance.getMonth() ||
    (now.getMonth() === naissance.getMonth() && now.getDate() < naissance.getDate())
  return avant ? age - 1 : age
}

export default function AyantsDroitParticipant({ entree: participant }) {
  // Rafraîchit la liste après un ajout/une modif : le store mémoire est à jour,
  // on le relit en changeant ce compteur.
  const [tick, setTick] = useState(0)
  const [panneauOuvert, setPanneauOuvert] = useState(false)
  // Bénéficiaire en cours d'édition (clic sur une ligne) ; null = ajout.
  const [entreeEditee, setEntreeEditee] = useState(null)

  const membres = useMemo(() => {
    const matricule = participant.matricule
    const societe = participant.adherent // code société (« 01 »)
    return listerEntreesSync('beneficiaires')
      .filter(
        (b) =>
          b.matriculePart === matricule &&
          // La société lève l'ambiguïté quand deux participants partagent un
          // matricule (un même salarié rattaché à l'IPM et à une mutuelle).
          (!b.codeSoc || !societe || b.codeSoc === societe),
      )
      .sort((a, b) => String(a.matriculeBenef || '').localeCompare(String(b.matriculeBenef || '')))
    // `tick` force la relecture après un ajout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant.matricule, participant.adherent, tick])

  const nomDe = (v) => `${v?.prenoms || ''} ${v?.nom || ''}`.trim()

  const ouvrirAjout = () => {
    setEntreeEditee(null)
    setPanneauOuvert(true)
  }
  // Clic sur un ayant droit : on ouvre sa fiche pour la modifier, comme dans
  // l'onglet Familles.
  const ouvrirEdition = (membre) => {
    setEntreeEditee(membre)
    setPanneauOuvert(true)
  }

  const enregistrer = async (valeurs, cible) => {
    try {
      if (cible) {
        await modifierEntree('beneficiaires', cible.id, valeurs)
        toast.success(`${nomDe({ ...cible, ...valeurs }) || 'Membre'} mis à jour`)
      } else {
        // Le matricule du participant est posé en dernier : il ne se saisit
        // pas, il désigne le porteur de la famille.
        await creerEntree('beneficiaires', { ...valeurs, matriculePart: participant.matricule })
        toast.success(`${nomDe(valeurs) || 'Membre'} ajouté`)
      }
      setPanneauOuvert(false)
      setTick((n) => n + 1)
    } catch (e) {
      if (erreursDeChamps(e)) throw e
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
    }
  }

  return (
    <div className="prt-famille">
      <div className="prt-famille-entete">
        <span className="prt-famille-titre">
          Ayants droit
          <span className="prt-famille-compte">{membres.length}</span>
        </span>
        <button type="button" className="prt-famille-ajouter" onClick={ouvrirAjout}>
          <CIcon icon={cilPlus} className="prt-famille-ajouter-icone" />
          Ajouter membre
        </button>
      </div>

      {membres.length > 0 && (
        <div className="prt-famille-table-conteneur">
          <table className="prt-famille-table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Type</th>
                <th>Prénom(s)</th>
                <th>Nom</th>
                <th>Date naiss.</th>
                <th className="prt-famille-num">Âge</th>
                <th>Sexe</th>
                <th>État</th>
                <th className="prt-famille-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {membres.map((m) => (
                <tr
                  key={m.id || m.matriculeBenef}
                  className="prt-famille-ligne"
                  onClick={() => ouvrirEdition(m)}
                  title={`Modifier ${nomDe(m)}`}
                >
                  <td className="ddb-mono">{m.matriculeBenef}</td>
                  <td>{capitaliser(m.typeBenef)}</td>
                  <td>{m.prenoms}</td>
                  <td>{m.nom}</td>
                  <td>{formaterDate(m.dateNaissance)}</td>
                  <td className="prt-famille-num">{calculerAge(m.dateNaissance)}</td>
                  <td>{m.sexe}</td>
                  <td>
                    <CBadge color={COULEUR_ETAT[m.etat] || 'secondary'} className="fw-normal">
                      {m.etat}
                    </CBadge>
                  </td>
                  <td className="prt-famille-actions text-end" onClick={(e) => e.stopPropagation()}>
                    <CTooltip content="Modifier">
                      <CButton
                        color="light"
                        size="sm"
                        className="ddb-action"
                        aria-label={`Modifier ${nomDe(m)}`}
                        onClick={() => ouvrirEdition(m)}
                      >
                        <CIcon icon={cilPencil} />
                      </CButton>
                    </CTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Le même panneau que l'onglet Familles : clic sur une ligne pour la
          modifier, « Ajouter membre » pour créer (matricule du participant
          posé d'avance). */}
      <FormulaireEntree
        referentiel={FAMILLES}
        entree={entreeEditee}
        entrees={listerEntreesSync('beneficiaires')}
        valeursDefaut={{ matriculePart: participant.matricule, etat: 'Actif' }}
        visible={panneauOuvert}
        onFermer={() => setPanneauOuvert(false)}
        onEnregistrer={enregistrer}
      />
    </div>
  )
}

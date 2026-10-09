/**
 * Onglet « Gestion des utilisateurs ».
 *
 * Les comptes qui accèdent à l'application : on les liste, on en crée, on les
 * modifie, on les active/désactive, on les supprime. L'email sert d'identifiant
 * de connexion ; le rôle (Admin / Gestionnaire / Utilisateur) décide des
 * droits. Réservé aux administrateurs côté serveur - un compte ordinaire reçoit
 * un refus, affiché ici plutôt que laissé en erreur.
 *
 * Servi par /api/auth/utilisateurs/.
 */

import React, { useCallback, useEffect, useState } from 'react'
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
  CBadge,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBan, cilCheckAlt, cilPlus, cilTrash, cilX } from '@coreui/icons'

import { request } from '../../services/api'
import { erreursDeChamps, messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { useConfirmation } from '../donnees-de-base/Confirmation'

const CHEMIN = '/auth/utilisateurs/'
const ROLES = ['Admin', 'Gestionnaire', 'Utilisateur']
const SAISIE_VIDE = {
  email: '',
  prenom: '',
  nom: '',
  role: 'Utilisateur',
  actif: true,
  motDePasse: '',
}

/** Champ de saisie, comme sur les autres pages : libellé posé sur le cadre. */
const Champ = ({ libelle, erreur, children }) => (
  <div className={`ddb-groupe${erreur ? ' ddb-groupe-erreur' : ''}`}>
    <label>{libelle}</label>
    {children}
    {erreur && <span className="ddb-champ-erreur">{erreur}</span>}
  </div>
)

const nomComplet = (u) => `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email

const Utilisateurs = () => {
  const [liste, setListe] = useState([])
  const [chargement, setChargement] = useState(true)
  const [refuse, setRefuse] = useState(false)
  const [vue, setVue] = useState('liste')
  const [edite, setEdite] = useState(null)
  const [saisie, setSaisie] = useState(SAISIE_VIDE)
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [demanderConfirmation, modaleConfirmation, confirmationOuverte] = useConfirmation()

  const charger = useCallback(async () => {
    try {
      const donnees = await request(CHEMIN)
      setListe(Array.isArray(donnees) ? donnees : donnees.results || [])
      setRefuse(false)
    } catch (e) {
      if (e.statut === 403) setRefuse(true)
      else toast.error(`Chargement impossible : ${messageErreur(e)}`)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    // Les états ne sont posés qu'après la réponse du serveur, jamais au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger()
  }, [charger])

  const changer = (champ, valeur) => {
    setSaisie((s) => ({ ...s, [champ]: valeur }))
    setErreurs((er) => ({ ...er, [champ]: null }))
  }

  const ouvrirCreation = () => {
    setEdite(null)
    setSaisie(SAISIE_VIDE)
    setErreurs({})
    setVue('formulaire')
  }

  const ouvrirModification = (u) => {
    setEdite(u)
    setSaisie({
      email: u.email,
      prenom: u.prenom,
      nom: u.nom,
      role: u.role,
      actif: u.actif,
      motDePasse: '',
    })
    setErreurs({})
    setVue('formulaire')
  }

  const poserErreurs = (e) => {
    const duServeur = erreursDeChamps(e)
    if (!duServeur) {
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
      return
    }
    setErreurs(duServeur)
    toast.error('Enregistrement impossible : vérifiez les champs signalés en rouge.')
  }

  const enregistrer = async (evenement) => {
    evenement.preventDefault()
    if (!saisie.email.trim()) {
      setErreurs({ email: 'Champ obligatoire' })
      return
    }
    // À la création, un mot de passe est nécessaire pour pouvoir se connecter.
    if (!edite && !saisie.motDePasse) {
      setErreurs({ motDePasse: 'Un mot de passe est nécessaire pour la connexion.' })
      return
    }
    const corps = {
      email: saisie.email.trim(),
      prenom: saisie.prenom,
      nom: saisie.nom,
      role: saisie.role,
      actif: saisie.actif,
    }
    // Vide en modification : le mot de passe reste inchangé.
    if (saisie.motDePasse) corps.motDePasse = saisie.motDePasse

    const confirme = await demanderConfirmation(
      edite
        ? {
            titre: 'Confirmer la modification',
            message: `Enregistrer les modifications de « ${nomComplet(saisie)} » ?`,
            confirmer: 'Enregistrer',
          }
        : {
            titre: 'Confirmer l’ajout',
            message: `Créer le compte de « ${nomComplet(saisie)} » ?`,
            confirmer: 'Créer',
          },
    )
    if (!confirme) return

    try {
      setEnvoi(true)
      await request(edite ? `${CHEMIN}${edite.id}/` : CHEMIN, {
        method: edite ? 'PATCH' : 'POST',
        body: JSON.stringify(corps),
      })
      toast.success(edite ? 'Compte mis à jour' : 'Compte créé')
      setVue('liste')
      await charger()
    } catch (e) {
      poserErreurs(e)
    } finally {
      setEnvoi(false)
    }
  }

  const supprimer = async (u) => {
    const confirme = await demanderConfirmation({
      titre: 'Confirmer la suppression',
      message: `Supprimer le compte de « ${nomComplet(u)} » (${u.email}) ? Cette action est définitive.`,
      confirmer: 'Supprimer',
      danger: true,
    })
    if (!confirme) return
    try {
      await request(`${CHEMIN}${u.id}/`, { method: 'DELETE' })
      toast.info('Compte supprimé')
      await charger()
    } catch (e) {
      toast.error(`Suppression impossible : ${messageErreur(e)}`)
    }
  }

  const basculerActif = async (u) => {
    try {
      await request(`${CHEMIN}${u.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ actif: !u.actif }),
      })
      toast.success(u.actif ? 'Compte désactivé' : 'Compte réactivé')
      await charger()
    } catch (e) {
      toast.error(`Changement impossible : ${messageErreur(e)}`)
    }
  }

  if (refuse) {
    return (
      <div className="prm-vide">
        <span className="prm-vide-titre">Accès réservé</span>
        <span className="prm-vide-texte">
          La gestion des utilisateurs est réservée aux administrateurs.
        </span>
      </div>
    )
  }

  // --- Liste -----------------------------------------------------------------
  return (
    <>
      <div className="ddb-barre-outils ddb-barre-soulignee">
        <span className="prm-total">
          {liste.length} utilisateur{liste.length > 1 ? 's' : ''}
        </span>
        <div className="ddb-barre-actions ddb-barre-actions-droite">
          <button type="button" className="ddb-bouton-nouveau" onClick={ouvrirCreation}>
            Créer
            <CIcon icon={cilPlus} className="ddb-bouton-nouveau-icone" />
          </button>
        </div>
      </div>

      <div className="ddb-tableau-conteneur">
        <CTable hover responsive className="ddb-tableau align-middle mb-0">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Prénom</CTableHeaderCell>
              <CTableHeaderCell>Nom</CTableHeaderCell>
              <CTableHeaderCell>Email</CTableHeaderCell>
              <CTableHeaderCell style={{ width: '140px' }}>Rôle</CTableHeaderCell>
              <CTableHeaderCell style={{ width: '100px' }}>État</CTableHeaderCell>
              <CTableHeaderCell style={{ width: '120px' }} aria-label="Actions" />
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {chargement ? (
              <CTableRow>
                <CTableDataCell colSpan={6} className="ddb-etat-vide">
                  <CSpinner size="sm" className="me-2" />
                  Chargement…
                </CTableDataCell>
              </CTableRow>
            ) : liste.length === 0 ? (
              <CTableRow>
                <CTableDataCell colSpan={6} className="ddb-etat-vide">
                  Aucun utilisateur. Créez le premier compte.
                </CTableDataCell>
              </CTableRow>
            ) : (
              liste.map((u) => (
                <CTableRow
                  key={u.id}
                  className={`ddb-ligne${u.actif ? '' : ' ddb-ligne-inactive'}${
                    vue === 'formulaire' && edite?.id === u.id ? ' ddb-ligne-active' : ''
                  }`}
                  onClick={() => ouvrirModification(u)}
                >
                  <CTableDataCell>{u.prenom}</CTableDataCell>
                  <CTableDataCell>{u.nom}</CTableDataCell>
                  <CTableDataCell>{u.email}</CTableDataCell>
                  <CTableDataCell>{u.role}</CTableDataCell>
                  <CTableDataCell>
                    <CBadge color={u.actif ? 'success' : 'secondary'} className="fw-normal">
                      {u.actif ? 'Actif' : 'Inactif'}
                    </CBadge>
                  </CTableDataCell>
                  {/* On modifie en cliquant la ligne : pas de crayon. Restent
                      l'activation et la suppression ; le clic de ces boutons ne
                      doit pas aussi ouvrir le panneau (stopPropagation). */}
                  <CTableDataCell className="text-end" onClick={(e) => e.stopPropagation()}>
                    <CButton
                      color="light"
                      size="sm"
                      className={`ddb-action ${u.actif ? 'ddb-action-danger' : ''}`}
                      onClick={() => basculerActif(u)}
                      aria-label={`${u.actif ? 'Désactiver' : 'Réactiver'} ${nomComplet(u)}`}
                    >
                      <CIcon icon={u.actif ? cilBan : cilCheckAlt} />
                    </CButton>
                    <CButton
                      color="light"
                      size="sm"
                      className="ddb-action ddb-action-danger"
                      onClick={() => supprimer(u)}
                      aria-label={`Supprimer ${nomComplet(u)}`}
                    >
                      <CIcon icon={cilTrash} />
                    </CButton>
                  </CTableDataCell>
                </CTableRow>
              ))
            )}
          </CTableBody>
        </CTable>
      </div>

      {/* Création / modification dans le panneau glissant, comme les autres
          pages (fournisseurs de soins, participants…). */}
      <COffcanvas
        placement="end"
        visible={vue === 'formulaire'}
        onHide={() => setVue('liste')}
        // En pause le temps d'une confirmation : le panneau lâche son piège à
        // focus et la touche Échap, que la fenêtre de confirmation prend alors.
        backdrop={!confirmationOuverte}
        keyboard={!confirmationOuverte}
        className="ddb-panneau"
      >
        <div className="ddb-panneau-entete">
          <span className="ddb-panneau-titre">
            {edite ? 'Modifier un utilisateur' : 'Nouvel utilisateur'}
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
                    <Champ libelle="Prénom" erreur={erreurs.prenom}>
                      <input
                        className="ddb-champ"
                        value={saisie.prenom}
                        onChange={(e) => changer('prenom', e.target.value)}
                        autoComplete="off"
                      />
                    </Champ>
                    <Champ libelle="Nom" erreur={erreurs.nom}>
                      <input
                        className="ddb-champ"
                        value={saisie.nom}
                        onChange={(e) => changer('nom', e.target.value)}
                        autoComplete="off"
                      />
                    </Champ>
                    <Champ libelle="Email (identifiant de connexion)" erreur={erreurs.email}>
                      <input
                        className="ddb-champ"
                        type="email"
                        value={saisie.email}
                        onChange={(e) => changer('email', e.target.value)}
                        autoComplete="off"
                      />
                    </Champ>
                  </div>

                  <div className="prm-colonne">
                    <Champ libelle="Rôle" erreur={erreurs.role}>
                      <select
                        className="ddb-champ ddb-champ-liste"
                        value={saisie.role}
                        onChange={(e) => changer('role', e.target.value)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </Champ>
                    <Champ
                      libelle={
                        edite ? 'Mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'
                      }
                      erreur={erreurs.motDePasse}
                    >
                      <input
                        className="ddb-champ"
                        type="password"
                        value={saisie.motDePasse}
                        onChange={(e) => changer('motDePasse', e.target.value)}
                        autoComplete="new-password"
                      />
                    </Champ>
                    <label className="prm-case">
                      <input
                        type="checkbox"
                        checked={saisie.actif}
                        onChange={(e) => changer('actif', e.target.checked)}
                      />
                      <span>Compte actif</span>
                    </label>
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

      {modaleConfirmation}
    </>
  )
}

export default Utilisateurs

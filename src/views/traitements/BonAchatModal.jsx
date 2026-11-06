/**
 * Saisie d'un bon d'achat (capture 80 : modal « Création Bon d'Achat »).
 *
 * Un bon porte des lignes : le formulaire générique des référentiels ne sait
 * pas faire, d'où cet écran à lui. Il se monte comme `editeur` du descripteur
 * (cf. Referentiel.jsx) et en respecte le contrat : `onEnregistrer(valeurs,
 * entree)` crée ou met à jour, la liste se recharge toute seule derrière.
 *
 * Trois points où l'on s'écarte de l'origine, et pourquoi :
 *
 *   - **Le Contact est saisissable et conservé.** L'origine l'exigeait
 *     (astérisque rouge), l'affichait grisé et ne le stockait nulle part :
 *     son bon imprimé sortait donc toujours avec un « Contact : » vide, même
 *     pour un fournisseur qui en a un. Ici il est prérempli de la fiche du
 *     fournisseur et reste modifiable - une commande passe par une personne.
 *   - **Le prix du catalogue reste affiché à côté du prix saisi**
 *     (« P. Unitaire (3 000) »). C'est l'idée la plus juste de cet écran, et
 *     la seule réponse élégante au travers répandu dans l'application
 *     d'origine : un paramètre saisi, affiché, puis ignoré. Ni imposer, ni
 *     cacher - montrer, pour que l'écart se remarque.
 *   - **Une référence de facture** relie le bon à la dépense qu'il a engagée.
 *     Sans elle, « Traité » reste une affirmation que rien ne vérifie.
 */

import React, { useEffect, useState } from 'react'
import { CModal, CModalBody, CModalHeader, CModalTitle, CSpinner, CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilTrash } from '@coreui/icons'

import { request } from '../../services/api'
import { messageErreur } from '../../services/erreurs'
import { toast } from '../../services/toast'
import { actifs } from '../documents/commun'
import {
  STATUTS_BON_ACHAT,
  TAUX_TVA_DEFAUT,
  articleDuCatalogue,
  fournisseurDivers,
  optionsArticles,
} from './config'

const entier = (valeur) => {
  const n = Number.parseInt(String(valeur ?? '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const montantFr = (n) => Number(n || 0).toLocaleString('fr-FR')

/** La date du jour (AAAA-MM-JJ), en heure locale et non en UTC. */
const aujourdhui = () => {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Taux de TVA proposés (18 % sur la totalité des lignes de l'origine). */
const TAUX_TVA = [0, 10, 18]

/**
 * Les montants d'une ligne. Mêmes règles qu'au serveur, au franc près
 * (arrondi au plus proche) : l'écran annonce exactement ce qui sera
 * enregistré, et le total imprimé est celui qu'on a vu en saisissant.
 */
const montantsDe = (ligne) => {
  const ht = entier(ligne.quantite) * entier(ligne.prixUnitaire)
  const remise = Math.floor((ht * entier(ligne.tauxRemise) + 50) / 100)
  const base = ht - remise
  const tva = Math.floor((base * entier(ligne.tauxTva) + 50) / 100)
  return { ht, remise, base, tva, ttc: base + tva }
}

/** Condition de paiement annoncée au fournisseur, lue sur sa fiche. */
const conditionDe = (fiche) => {
  const delai = String(fiche?.delaiReglement || '').trim()
  return delai ? `${delai} jours date facture` : ''
}

const LIGNE_VIDE = {
  article: '',
  quantite: '',
  prixUnitaire: '',
  tauxTva: String(TAUX_TVA_DEFAUT),
  tauxRemise: '0',
}

const BonAchatModal = ({ entree, visible, onFermer, onEnregistrer, enPause = false }) => {
  const modification = Boolean(entree)

  // --- En-tête du bon -------------------------------------------------------
  const [valeurs, setValeurs] = useState(() => ({
    fournisseur: entree?.fournisseur || '',
    dateLivraison: entree?.dateLivraison || aujourdhui(),
    dateBon: entree?.dateBon || aujourdhui(),
    contact: entree?.contact || '',
    contactEmail: entree?.contactEmail || '',
    conditionPaiement: entree?.conditionPaiement || '',
    numOffre: entree?.numOffre || '',
    statut: entree?.statut || STATUTS_BON_ACHAT[0],
    referenceFacture: entree?.referenceFacture || '',
    adresseLivraison: entree?.adresseLivraison || '',
    remarque: entree?.remarque || '',
  }))

  // --- Lignes commandées ----------------------------------------------------
  const [lignes, setLignes] = useState(() =>
    (entree?.lignes || []).map((l) => ({
      article: l.article,
      designation: l.designation,
      quantite: String(l.quantite),
      prixUnitaire: String(l.prixUnitaire),
      tauxTva: String(l.tauxTva),
      tauxRemise: String(l.tauxRemise),
    })),
  )
  const [saisie, setSaisie] = useState(LIGNE_VIDE)
  const [envoi, setEnvoi] = useState(false)
  // Contact de l'IPM offert au fournisseur, lu sur la fiche Paramètres →
  // Informations Générales. L'origine l'affichait déjà ici, en rouge.
  const [infosIpm, setInfosIpm] = useState(null)

  useEffect(() => {
    if (!visible) return
    let vivant = true
    request('/informations-ipm/')
      .then((fiche) => vivant && setInfosIpm(fiche))
      // Le contact de l'IPM est un agrément : son absence n'empêche rien.
      .catch(() => {})
    return () => {
      vivant = false
    }
  }, [visible])

  // Catalogue et fournisseurs lus à chaque rendu, et non figés à l'ouverture :
  // un article créé depuis la barre (« Ajout Article ») doit être proposé tout
  // de suite, sans refermer le bon en cours de saisie.
  const articles = optionsArticles()
  // Le fournisseur se choisit par son compte (« 401019 - SIPREX SARL »), comme
  // à l'origine : le sous-compte 401 du plan comptable tient lieu de
  // référentiel.
  const fournisseurs = actifs('fournisseurs-divers')

  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))

  /**
   * Choisir un fournisseur reprend ce que sa fiche sait de lui : son
   * interlocuteur, son courriel, sa condition de paiement. Tout reste
   * modifiable - c'est une proposition, pas une contrainte - et seul le champ
   * encore vide est rempli, pour ne pas écraser une saisie en cours.
   */
  const choisirFournisseur = (code) => {
    const fiche = fournisseurDivers(code)
    setValeurs((v) => ({
      ...v,
      fournisseur: code,
      contact: v.contact || fiche?.contactNom || '',
      contactEmail: v.contactEmail || fiche?.email || '',
      conditionPaiement: v.conditionPaiement || conditionDe(fiche),
    }))
  }

  /** Choisir un article propose son prix de catalogue, modifiable ensuite. */
  const choisirArticle = (code) => {
    const article = articleDuCatalogue(code)
    setSaisie((l) => ({
      ...l,
      article: code,
      prixUnitaire: article ? String(article.prixUnitaire ?? '') : '',
    }))
  }

  const prixCatalogue = articleDuCatalogue(saisie.article)?.prixUnitaire

  const validerLigne = () => {
    if (!saisie.article) {
      toast.info('Choisissez un article.')
      return
    }
    if (!entier(saisie.quantite)) {
      toast.info('Saisissez une quantité.')
      return
    }
    const article = articleDuCatalogue(saisie.article)
    setLignes((liste) => [
      ...liste,
      {
        ...saisie,
        designation: article?.libelle || '',
        tauxTva: saisie.tauxTva || '0',
        tauxRemise: saisie.tauxRemise || '0',
      },
    ])
    setSaisie(LIGNE_VIDE)
  }

  const retirerLigne = (index) => setLignes((liste) => liste.filter((_, i) => i !== index))

  // Les quatre totaux du pied, et ceux du bon imprimé.
  const totaux = lignes.reduce(
    (cumul, ligne) => {
      const m = montantsDe(ligne)
      return {
        ht: cumul.ht + m.ht,
        remise: cumul.remise + m.remise,
        tva: cumul.tva + m.tva,
        ttc: cumul.ttc + m.ttc,
      }
    },
    { ht: 0, remise: 0, tva: 0, ttc: 0 },
  )

  const enregistrer = async () => {
    if (!valeurs.fournisseur) {
      toast.info('Choisissez un fournisseur.')
      return
    }
    if (!lignes.length) {
      toast.info('Saisissez au moins une ligne : un bon sans ligne ne commande rien.')
      return
    }
    try {
      setEnvoi(true)
      await onEnregistrer(
        {
          ...valeurs,
          lignes: lignes.map((l) => ({
            article: l.article,
            quantite: entier(l.quantite),
            prixUnitaire: entier(l.prixUnitaire),
            tauxTva: entier(l.tauxTva),
            tauxRemise: entier(l.tauxRemise),
          })),
        },
        entree,
      )
    } catch (e) {
      toast.error(`Enregistrement impossible : ${messageErreur(e)}`)
    } finally {
      setEnvoi(false)
    }
  }

  const contactIpm = [infosIpm?.contactNom, infosIpm?.contactEmail].filter(Boolean).join(' - ')

  return (
    <CModal
      visible={visible}
      onClose={onFermer}
      size="xl"
      alignment="center"
      scrollable
      backdrop={!enPause}
      keyboard={!enPause}
      className="ba-modal"
    >
      <CModalHeader>
        <CModalTitle>
          {modification ? `Bon d'Achat ${entree.code}` : "Création Bon d'Achat"}
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        {/* --- En-tête du bon ------------------------------------------- */}
        <div className="ba-entete">
          <Champ libelle="Fournisseur" requis>
            <select
              className="ddb-champ ddb-champ-liste"
              value={valeurs.fournisseur}
              onChange={(e) => choisirFournisseur(e.target.value)}
            >
              <option value="">- Sélectionner -</option>
              {fournisseurs.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} - {f.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Date Livraison Souhaitée" requis>
            <input
              type="date"
              className="ddb-champ"
              value={valeurs.dateLivraison}
              onChange={changer('dateLivraison')}
            />
          </Champ>
          <Champ libelle="Date Enregistrement" requis>
            <input
              type="date"
              className="ddb-champ"
              value={valeurs.dateBon}
              onChange={changer('dateBon')}
            />
          </Champ>
          <Champ libelle="Contact">
            <input
              className="ddb-champ"
              value={valeurs.contact}
              onChange={changer('contact')}
              placeholder="Interlocuteur chez le fournisseur"
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="Email">
            <input
              className="ddb-champ"
              value={valeurs.contactEmail}
              onChange={changer('contactEmail')}
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="Condition de Paiement">
            <input
              className="ddb-champ"
              value={valeurs.conditionPaiement}
              onChange={changer('conditionPaiement')}
              placeholder="15 jours date facture"
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="N° Offre">
            <input
              className="ddb-champ"
              value={valeurs.numOffre}
              onChange={changer('numOffre')}
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="Statut" requis>
            <select
              className="ddb-champ ddb-champ-liste"
              value={valeurs.statut}
              onChange={changer('statut')}
            >
              {STATUTS_BON_ACHAT.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Facture">
            <input
              className="ddb-champ"
              value={valeurs.referenceFacture}
              onChange={changer('referenceFacture')}
              placeholder="N° de la facture reçue"
              autoComplete="off"
            />
          </Champ>
        </div>

        {/* --- Saisie d'une ligne ---------------------------------------- */}
        <div className="ba-saisie">
          <Champ libelle="Article" requis>
            <select
              className="ddb-champ ddb-champ-liste"
              value={saisie.article}
              onChange={(e) => choisirArticle(e.target.value)}
            >
              <option value="">- Sélectionner -</option>
              {articles.map((a) => (
                <option key={a.valeur} value={a.valeur}>
                  {a.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Quantité" requis>
            <input
              className="ddb-champ text-end"
              value={saisie.quantite}
              onChange={(e) => setSaisie((l) => ({ ...l, quantite: e.target.value }))}
              inputMode="numeric"
              autoComplete="off"
            />
          </Champ>
          <Champ
            libelle="P. Unitaire"
            requis
            // Le prix du catalogue, à côté du prix saisi : ni imposé, ni caché.
            repere={prixCatalogue !== undefined ? `(${montantFr(prixCatalogue)})` : null}
          >
            <input
              className="ddb-champ text-end"
              value={saisie.prixUnitaire}
              onChange={(e) => setSaisie((l) => ({ ...l, prixUnitaire: e.target.value }))}
              inputMode="numeric"
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="TVA">
            <select
              className="ddb-champ ddb-champ-liste"
              value={saisie.tauxTva}
              onChange={(e) => setSaisie((l) => ({ ...l, tauxTva: e.target.value }))}
            >
              {TAUX_TVA.map((t) => (
                <option key={t} value={String(t)}>
                  {t} %
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Remise (%)">
            <input
              className="ddb-champ text-end"
              value={saisie.tauxRemise}
              onChange={(e) => setSaisie((l) => ({ ...l, tauxRemise: e.target.value }))}
              inputMode="numeric"
              autoComplete="off"
            />
          </Champ>
          <button
            type="button"
            className="ddb-bouton-enregistrer ba-valider"
            onClick={validerLigne}
          >
            <CIcon icon={cilPlus} className="me-1" />
            Valider
          </button>
        </div>

        {/* --- Lignes commandées ----------------------------------------- */}
        <div className="tableau-conteneur ba-tableau-cadre">
          <table className="tableau ba-tableau">
            <thead>
              <tr>
                <th>Code Art.</th>
                <th>Description</th>
                <th className="text-end">Qte</th>
                <th className="text-end">P. unitaire</th>
                <th className="text-end">Remise</th>
                <th className="text-end">Montant HT</th>
                <th className="text-end">TVA</th>
                <th className="text-end">Montant TTC</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={9} className="ba-vide">
                    Aucune ligne : choisissez un article, puis « Valider ».
                  </td>
                </tr>
              )}
              {lignes.map((ligne, index) => {
                const m = montantsDe(ligne)
                return (
                  <tr key={`${ligne.article}-${index}`}>
                    <td className="ba-mono">{ligne.article}</td>
                    <td>{ligne.designation}</td>
                    <td className="text-end">{montantFr(entier(ligne.quantite))}</td>
                    <td className="text-end">{montantFr(entier(ligne.prixUnitaire))}</td>
                    <td className="text-end">{montantFr(m.remise)}</td>
                    <td className="text-end">{montantFr(m.ht)}</td>
                    <td className="text-end">{montantFr(m.tva)}</td>
                    <td className="text-end">{montantFr(m.ttc)}</td>
                    <td className="text-end">
                      <CTooltip content="Retirer la ligne">
                        <button
                          type="button"
                          className="ba-retirer"
                          onClick={() => retirerLigne(index)}
                          aria-label={`Retirer ${ligne.designation || ligne.article}`}
                        >
                          <CIcon icon={cilTrash} />
                        </button>
                      </CTooltip>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* --- Pied : remarque, adresse, totaux --------------------------- */}
        <div className="ba-pied">
          <div className="ba-pied-gauche">
            <Champ libelle="Remarque">
              <textarea
                className="ddb-champ"
                rows={3}
                value={valeurs.remarque}
                onChange={changer('remarque')}
              />
            </Champ>
            <Champ libelle="Adresse de Livraison">
              <input
                className="ddb-champ"
                value={valeurs.adresseLivraison}
                onChange={changer('adresseLivraison')}
                autoComplete="off"
              />
            </Champ>
            {contactIpm && <p className="ba-contact-ipm">Contact : {contactIpm}</p>}
          </div>
          <div className="ba-totaux">
            <Total libelle="Total HT" valeur={totaux.ht} />
            <Total libelle="Total Remise" valeur={totaux.remise} />
            <Total libelle="Total TVA" valeur={totaux.tva} />
            <Total libelle="Total TTC" valeur={totaux.ttc} fort />
          </div>
        </div>

        <div className="ba-actions">
          <button type="button" className="ddb-outil" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="ddb-bouton-enregistrer ms-2"
            onClick={enregistrer}
            disabled={envoi || !lignes.length}
          >
            {envoi && <CSpinner size="sm" className="me-2" />}
            Enregistrer
          </button>
        </div>
      </CModalBody>
    </CModal>
  )
}

const Champ = ({ libelle, requis, repere, children }) => (
  <div className="ddb-groupe">
    <label>
      {libelle}
      {requis && <span className="ba-requis"> *</span>}
      {repere && <span className="ba-repere"> {repere}</span>}
    </label>
    {children}
  </div>
)

const Total = ({ libelle, valeur, fort }) => (
  <div className={`ba-total${fort ? ' ba-total-fort' : ''}`}>
    <span>{libelle}</span>
    <strong>{montantFr(valeur)}</strong>
  </div>
)

export default BonAchatModal

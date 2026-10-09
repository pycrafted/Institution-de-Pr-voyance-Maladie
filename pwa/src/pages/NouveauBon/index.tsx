/**
 * Assistant « Nouveau bon de pharmacie » (SPEC_DESIGN §5, SPEC §3 écran 4).
 *
 * Refonte visuelle : l'assistant commence par un BANDEAU DE MARQUE compact
 * et sombre (§3.2) portant le titre, l'étape en cours et une barre de
 * progression rouge de 4 px en pilule. La grande toolbar Ionic au titre noir
 * sur fond gris, la barre de progression d'Ionic et le pied `IonFooter` ont
 * disparu : §1 les interdit tous les trois.
 *
 * Chaque étape est ensuite une suite de CARTES autonomes (§3.5) — jamais une
 * liste à filets — et l'action principale est posée en bas sur le voile
 * dégradé de `PiedBoutons` (§3.7).
 *
 * Modal plein écran en cinq étapes : bénéficiaire → prescripteur (spécialité
 * puis prescripteur) → pharmacie → ordonnance (date + articles) →
 * récapitulatif. Toucher un choix passe à la suite, comme dans une
 * application native ; « Générer le bon » envoie la saisie, joue l'animation
 * de succès, puis l'hôte (NouveauBonModal) ferme le modal et ouvre le détail.
 *
 * Les listes de référence sont chargées dès l'ouverture (spécialités,
 * pharmacies) ou dès le choix de la spécialité (prescripteurs), pour que
 * chaque étape s'affiche sans attente. Un refus du serveur (400) ramène à
 * l'étape du champ concerné, avec son message. Hors ligne, la saisie reste
 * possible mais la génération est désactivée, avec l'explication.
 *
 * Contrat (ne pas changer, NouveauBonModal.tsx en dépend) :
 *  - rendu DANS un IonModal plein écran déjà ouvert ;
 *  - `onFermer()` : l'employé abandonne (bouton « Annuler ») ;
 *  - `onCree(bon)` : bon créé par creerBon() ; l'hôte l'ajoute à la liste,
 *    ferme le modal et ouvre /bons/:id. L'animation de succès et
 *    haptique.succes() sont joués AVANT l'appel à onCree.
 */

import { IonContent, IonIcon, useIonToast } from '@ionic/react'
import { alertCircleOutline, cloudOfflineOutline, trashOutline } from 'ionicons/icons'
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import {
  creerBon,
  estErreurApi,
  listerPharmacies,
  listerPrescripteurs,
  listerSpecialites,
  messageErreur,
} from '../../api'
import BandeauMarque from '../../components/BandeauMarque'
import { BoutonPrincipal, PiedBoutons } from '../../components/Boutons'
import FeuilleChoix from '../../components/FeuilleChoix'
import OfflineBanner from '../../components/OfflineBanner'
import { chargerBons, memoriserBon } from '../../data/bons'
import { haptique } from '../../hooks/haptique'
import { useOnline } from '../../hooks/useOnline'
import { useSession } from '../../session'
import type { Bon } from '../../types/api'
import { aujourdhuiISO, capitaliser } from '../../utils/format'
import Alerte from './Alerte'
import {
  corpsDepuisSaisie,
  erreurDate,
  etatInitial,
  lireErreursServeur,
  NB_ETAPES,
  NOMS_ETAPES,
  premiereEtapeEnErreur,
  reducteur,
  saisieComplete,
  type EtatAssistant,
} from './assistant'
import { useChargement } from './chargement'
import EtapeBeneficiaire from './EtapeBeneficiaire'
import EtapeOrdonnance from './EtapeOrdonnance'
import EtapePharmacie from './EtapePharmacie'
import EtapePrescripteur from './EtapePrescripteur'
import EtapeRecapitulatif from './EtapeRecapitulatif'
import Succes from './Succes'
import './NouveauBon.css'

export interface NouveauBonProps {
  onFermer: () => void
  onCree: (bon: Bon) => void
}

/** Temps laissé à l'animation de succès avant d'ouvrir le détail du bon. */
export const DUREE_SUCCES_MS = 1600
/** Mouvements réduits (réglage d'accessibilité du téléphone) : on n'attend presque pas. */
const DUREE_SUCCES_REDUITE_MS = 700

function dureeSucces(): number {
  const reduit =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduit ? DUREE_SUCCES_REDUITE_MS : DUREE_SUCCES_MS
}

/** Titre et consigne de l'étape affichée. */
function entete(etat: EtatAssistant): { titre: string; consigne: string } {
  switch (etat.etape) {
    case 1:
      return {
        titre: 'Pour qui est l’ordonnance ?',
        consigne: 'Choisissez la personne qui a consulté.',
      }
    case 2: {
      const specialite = etat.saisie.specialite
      if (etat.sousEtape === 'prescripteur' && specialite) {
        return {
          titre: 'Qui a prescrit ?',
          consigne: `Médecins et structures en ${capitaliser(specialite.libelle)}.`,
        }
      }
      return { titre: 'Qui a prescrit ?', consigne: 'Commencez par la spécialité du prescripteur.' }
    }
    case 3:
      return {
        titre: 'Dans quelle pharmacie ?',
        consigne: 'La pharmacie conventionnée où vous retirerez vos médicaments.',
      }
    case 4:
      return { titre: 'L’ordonnance', consigne: 'Sa date et le nombre de médicaments prescrits.' }
    case 5:
      return { titre: 'Vérifiez avant de générer', consigne: 'Touchez une carte pour la corriger.' }
  }
}

export default function NouveauBon({ onFermer, onCree }: NouveauBonProps) {
  const { beneficiaires, rafraichir } = useSession()
  const enLigne = useOnline()
  // Figée à l'ouverture : les bornes de la date ne bougent pas pendant la saisie.
  const [aujourdhui] = useState(() => aujourdhuiISO())
  const [etat, envoyer] = useReducer(reducteur, aujourdhui, etatInitial)
  const [envoi, setEnvoi] = useState(false)
  const [bonCree, setBonCree] = useState<Bon | null>(null)
  const [familleEnCours, setFamilleEnCours] = useState(beneficiaires.length === 0)
  const [presenterToast] = useIonToast()
  // « Abandonner ce bon ? », posé dans une feuille de choix.
  const [abandonDemande, setAbandonDemande] = useState(false)
  const contenuRef = useRef<HTMLIonContentElement>(null)
  const titreRef = useRef<HTMLHeadingElement>(null)

  const { etape, sousEtape, saisie, erreurs } = etat
  const codeSpecialite = saisie.specialite?.code ?? null

  const specialites = useChargement('specialites', (signal) => listerSpecialites({ signal }))
  const pharmacies = useChargement('pharmacies', (signal) => listerPharmacies({ signal }))
  const prescripteurs = useChargement(codeSpecialite, (signal) =>
    listerPrescripteurs(codeSpecialite ?? '', { signal }),
  )

  // Famille pas encore connue (identification faite sans réseau) : on la redemande.
  const chargerFamille = useCallback(() => {
    setFamilleEnCours(true)
    void rafraichir().finally(() => setFamilleEnCours(false))
  }, [rafraichir])
  useEffect(() => {
    if (beneficiaires.length === 0) chargerFamille()
    // Une seule fois, à l'ouverture : ensuite, c'est « Réessayer ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nouvelle étape : en haut de page, et le titre reçoit le focus pour que
  // les lecteurs d'écran annoncent où l'on est.
  const premierAffichage = useRef(true)
  useEffect(() => {
    if (premierAffichage.current) {
      premierAffichage.current = false
      return
    }
    const contenu = contenuRef.current
    if (contenu && typeof contenu.scrollToTop === 'function') {
      void contenu.scrollToTop(0).catch(() => undefined)
    }
    titreRef.current?.focus({ preventScroll: true })
  }, [etape, sousEtape])

  // Succès : l'animation se joue, puis l'hôte ouvre le détail.
  const onCreeRef = useRef(onCree)
  onCreeRef.current = onCree
  useEffect(() => {
    if (!bonCree) return
    const minuteur = window.setTimeout(() => onCreeRef.current(bonCree), dureeSucces())
    return () => window.clearTimeout(minuteur)
  }, [bonCree])

  /** Le bandeau reste en place pendant l'envoi : ses boutons, eux, se taisent. */
  const fige = envoi || bonCree !== null

  const precedent = () => {
    if (fige) return
    envoyer({ type: 'precedent' })
  }

  const annuler = () => {
    if (fige) return
    // Rien de saisi : on ferme sans question.
    if (!saisie.beneficiaire) {
      onFermer()
      return
    }
    haptique.avertissement()
    setAbandonDemande(true)
  }

  const continuer = () => {
    const maintenant = aujourdhuiISO()
    if (erreurDate(saisie.dateOrdonnance, maintenant)) haptique.erreur()
    else haptique.selection()
    envoyer({ type: 'continuer', aujourdhui: maintenant })
  }

  const generer = async () => {
    const corps = corpsDepuisSaisie(saisie)
    if (!corps || envoi || !enLigne || bonCree) return
    // L'assistant a pu rester ouvert depuis la veille : la date se revérifie.
    const dateRefusee = erreurDate(corps.dateOrdonnance, aujourdhuiISO())
    if (dateRefusee) {
      haptique.erreur()
      envoyer({ type: 'erreurs-serveur', champs: { dateOrdonnance: [dateRefusee] } })
      return
    }
    setEnvoi(true)
    try {
      // Pas d'annulation à la fermeture : un bon demandé doit aboutir ou
      // échouer franchement, jamais rester dans l'incertitude.
      const bon = await creerBon(corps)
      // Le bon apparaît tout de suite dans Accueil et Mes bons, puis la liste
      // est resynchronisée avec le serveur en arrière-plan.
      memoriserBon(bon)
      void chargerBons()
      haptique.succes()
      setBonCree(bon)
    } catch (e) {
      if (estErreurApi(e) && e.genre === 'annulee') return
      if (estErreurApi(e) && e.genre === 'non-autorise') {
        // Le client a déjà fermé la session : l'identification va s'afficher.
        onFermer()
        return
      }
      haptique.erreur()
      if (estErreurApi(e) && e.genre === 'validation' && Object.keys(e.champs).length > 0) {
        envoyer({ type: 'erreurs-serveur', champs: e.champs })
        const aCorriger = premiereEtapeEnErreur(lireErreursServeur(e.champs))
        void presenterToast({
          message: aCorriger
            ? `Une information est à corriger : ${NOMS_ETAPES[aCorriger].toLowerCase()}.`
            : 'Le bon n’a pas pu être généré.',
          duration: 3000,
          position: 'top',
          icon: alertCircleOutline,
        })
        return
      }
      void presenterToast({
        message: messageErreur(e),
        duration: 4000,
        position: 'top',
        icon: estErreurApi(e) && e.genre === 'reseau' ? cloudOfflineOutline : alertCircleOutline,
        color: 'danger',
      })
    } finally {
      setEnvoi(false)
    }
  }

  const peutReculer = etape > 1 || sousEtape === 'prescripteur'
  const { titre, consigne } = entete(etat)
  // Pas d'animation à l'ouverture : le modal glisse déjà.
  const anime = etape !== 1 || etat.sens === 'arriere'
  // Part de chemin parcouru, posée en variable : le CSS en fait la largeur de
  // la jauge, qui glisse d'une étape à l'autre.
  const progression = { '--avancement': etape / NB_ETAPES } as CSSProperties

  let contenuEtape: ReactNode = null
  switch (etape) {
    case 1:
      contenuEtape = (
        <EtapeBeneficiaire
          beneficiaires={beneficiaires}
          chargement={familleEnCours}
          onReessayer={chargerFamille}
          selection={saisie.beneficiaire?.matricule ?? null}
          onChoisir={(beneficiaire) => envoyer({ type: 'beneficiaire', beneficiaire })}
        />
      )
      break
    case 2:
      contenuEtape = (
        <EtapePrescripteur
          sousEtape={sousEtape}
          specialites={specialites}
          prescripteurs={prescripteurs}
          specialite={saisie.specialite}
          prescripteur={saisie.prescripteur}
          onSpecialite={(specialite) => envoyer({ type: 'specialite', specialite })}
          onPrescripteur={(prescripteur) => envoyer({ type: 'prescripteur', prescripteur })}
        />
      )
      break
    case 3:
      contenuEtape = (
        <EtapePharmacie
          pharmacies={pharmacies}
          selection={saisie.pharmacie}
          onChoisir={(pharmacie) => envoyer({ type: 'pharmacie', pharmacie })}
        />
      )
      break
    case 4:
      contenuEtape = (
        <EtapeOrdonnance
          aujourdhui={aujourdhui}
          date={saisie.dateOrdonnance}
          nbArticles={saisie.nbArticles}
          erreurDate={erreurs.dateOrdonnance}
          erreurArticles={erreurs.nbArticles}
          onDate={(date) => envoyer({ type: 'date', date })}
          onArticles={(nombre) => envoyer({ type: 'articles', nombre })}
        />
      )
      break
    case 5:
      contenuEtape = (
        <EtapeRecapitulatif
          saisie={saisie}
          aujourdhui={aujourdhui}
          erreur={erreurs.non_field_errors}
          onModifier={(cible) => {
            haptique.leger()
            envoyer({ type: 'modifier', etape: cible })
          }}
        />
      )
      break
  }

  // Refus du serveur sur un choix de liste : rappelé en tête de l'étape.
  const erreurChoix =
    etape === 1
      ? erreurs.beneficiaire
      : etape === 2
        ? (erreurs.specialite ?? erreurs.prescripteur)
        : etape === 3
          ? erreurs.pharmacie
          : undefined

  return (
    <>
      <IonContent ref={contenuRef} className="nouveau-bon">
        {/* Une colonne haute d'au moins un écran : le pied collant se pose
            alors en bas même quand l'étape tient en quelques lignes. */}
        <div className="nouveau-bon__page">
          <BandeauMarque
            titre="Nouveau bon"
            sousTitre={`Étape ${etape} sur ${NB_ETAPES} · ${NOMS_ETAPES[etape]}`}
            onRetour={peutReculer ? precedent : undefined}
            fin={
              // Même pastille de verre que le bouton retour du bandeau (§3.2),
              // en pilule : le composant partagé n'est pas dupliqué, sa classe
              // est réemployée.
              <button
                type="button"
                className="ipm-bandeau__retour nouveau-bon__annuler"
                onClick={annuler}
                disabled={fige}
              >
                Annuler
              </button>
            }
          >
            {/* §5 : barre de progression rouge, hauteur 4, en pilule. */}
            <div
              className="nouveau-bon__progression"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={NB_ETAPES}
              aria-valuenow={etape}
              aria-label={`Étape ${etape} sur ${NB_ETAPES}`}
            >
              <span className="nouveau-bon__progression-jauge" style={progression} />
            </div>
          </BandeauMarque>

          <OfflineBanner />

          <div
            key={`${etape}-${sousEtape}`}
            className={`nouveau-bon__etape${anime ? ` nouveau-bon__etape--${etat.sens}` : ''}`}
          >
            {/* Le <h1> de l'écran est celui du bandeau (« Nouveau bon ») :
                la question de l'étape vient donc au niveau en dessous. */}
            <div className="nouveau-bon__intro ipm-gouttiere">
              <h2 ref={titreRef} tabIndex={-1} className="nouveau-bon__titre">
                {titre}
              </h2>
              <p className="nouveau-bon__consigne">{consigne}</p>
            </div>
            {erreurChoix && (
              <div className="ipm-gouttiere">
                <Alerte message={erreurChoix} />
              </div>
            )}
            {contenuEtape}
          </div>

          {/* Action principale posée sur le voile dégradé de la charte (§3.7). */}
          {(etape === 4 || etape === 5) && (
            <PiedBoutons>
              {etape === 5 && !enLigne && (
                <p className="nouveau-bon__hors-ligne" role="status">
                  <IonIcon icon={cloudOfflineOutline} aria-hidden="true" />
                  Vous êtes hors ligne. Reconnectez-vous pour générer le bon : votre saisie est
                  conservée.
                </p>
              )}
              {etape === 4 ? (
                <BoutonPrincipal onClick={continuer}>Continuer</BoutonPrincipal>
              ) : (
                <BoutonPrincipal
                  occupe={envoi}
                  disabled={!enLigne || Boolean(bonCree) || !saisieComplete(saisie)}
                  onClick={() => void generer()}
                >
                  {envoi ? 'Génération du bon…' : 'Générer le bon'}
                </BoutonPrincipal>
              )}
            </PiedBoutons>
          )}
        </div>
      </IonContent>

      {bonCree && <Succes bon={bonCree} />}

      <FeuilleChoix
        ouverte={abandonDemande}
        onFermer={() => setAbandonDemande(false)}
        titre="Abandonner ce bon ?"
        message="Les informations saisies seront perdues."
        icone={trashOutline}
        choix={[
          { libelle: 'Continuer la saisie', genre: 'principal' },
          { libelle: 'Abandonner', genre: 'danger', onClick: onFermer },
        ]}
      />
    </>
  )
}

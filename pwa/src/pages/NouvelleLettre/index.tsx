/**
 * Assistant « Nouvelle lettre de garantie ».
 *
 * Même écran que l'assistant du bon de pharmacie (pages/NouveauBon) : bandeau
 * de marque compact avec l'étape et la jauge rouge, étapes en cartes, action
 * principale sur le voile dégradé du bas, glissement d'une étape à l'autre.
 * Mêmes classes CSS (NouveauBon.css) : les deux assistants ne font qu'un aux
 * yeux de l'employé.
 *
 * Six étapes : bénéficiaire → prestataire (spécialité puis structure) →
 * nature de la prestation → prescripteur (spécialité puis prescripteur) →
 * date de la prescription → récapitulatif. « Générer la lettre » l'envoie ;
 * elle est créée par le serializer de l'écran IPM et paraît aussitôt dans le
 * tableau des lettres de garantie d'IPM.
 *
 * Contrat (NouveauBonModal.tsx en dépend) : rendu dans un IonModal plein
 * écran déjà ouvert ; `onFermer()` à l'abandon ; `onCree(lettre)` après
 * l'animation de succès.
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
  creerLettre,
  estErreurApi,
  listerNaturesPrestation,
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
import Alerte from '../NouveauBon/Alerte'
import { useChargement } from '../NouveauBon/chargement'
import EtapeBeneficiaire from '../NouveauBon/EtapeBeneficiaire'
import EtapeOrdonnance from '../NouveauBon/EtapeOrdonnance'
import Succes from '../NouveauBon/Succes'
import { DUREE_SUCCES_MS } from '../NouveauBon'
import '../NouveauBon/NouveauBon.css'
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
import EtapeNature from './EtapeNature'
import EtapeRecapitulatif from './EtapeRecapitulatif'
import EtapeStructure from './EtapeStructure'

export interface NouvelleLettreProps {
  onFermer: () => void
  onCree: (lettre: Bon) => void
}

const DUREE_SUCCES_REDUITE_MS = 700

function dureeSucces(): number {
  const reduit =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduit ? DUREE_SUCCES_REDUITE_MS : DUREE_SUCCES_MS
}

const LIBELLES_DATE = {
  titre: 'Date de la prescription',
  roues: 'Date de la prescription',
  aide: 'Une prescription est acceptée pendant 30 jours.',
}

/** Titre et consigne de l'étape affichée. */
function entete(etat: EtatAssistant): { titre: string; consigne: string } {
  const { saisie, sousEtape } = etat
  switch (etat.etape) {
    case 1:
      return {
        titre: 'Pour qui est la prise en charge ?',
        consigne: 'Choisissez la personne qui sera soignée.',
      }
    case 2:
      if (sousEtape === 'fournisseur' && saisie.specialitePrestataire) {
        return {
          titre: 'Où aura lieu la prestation ?',
          consigne: `Structures conventionnées en ${capitaliser(saisie.specialitePrestataire.libelle)}.`,
        }
      }
      return {
        titre: 'Où aura lieu la prestation ?',
        consigne: 'Commencez par la spécialité de la structure qui vous recevra.',
      }
    case 3:
      return {
        titre: 'Pour quelle prestation ?',
        consigne: 'La nature des soins couverts par la lettre.',
      }
    case 4:
      if (sousEtape === 'fournisseur' && saisie.specialite) {
        return {
          titre: 'Qui a prescrit ?',
          consigne: `Médecins et structures en ${capitaliser(saisie.specialite.libelle)}.`,
        }
      }
      return { titre: 'Qui a prescrit ?', consigne: 'Commencez par la spécialité du prescripteur.' }
    case 5:
      return {
        titre: 'La prescription',
        consigne: 'Sa date, telle qu’elle figure sur le document du médecin.',
      }
    case 6:
      return { titre: 'Vérifiez avant de générer', consigne: 'Touchez une carte pour la corriger.' }
  }
}

export default function NouvelleLettre({ onFermer, onCree }: NouvelleLettreProps) {
  const { beneficiaires, rafraichir } = useSession()
  const enLigne = useOnline()
  const [aujourdhui] = useState(() => aujourdhuiISO())
  const [etat, envoyer] = useReducer(reducteur, aujourdhui, etatInitial)
  const [envoi, setEnvoi] = useState(false)
  const [lettreCreee, setLettreCreee] = useState<Bon | null>(null)
  const [familleEnCours, setFamilleEnCours] = useState(beneficiaires.length === 0)
  const [presenterToast] = useIonToast()
  const [abandonDemande, setAbandonDemande] = useState(false)
  const contenuRef = useRef<HTMLIonContentElement>(null)
  const titreRef = useRef<HTMLHeadingElement>(null)

  const { etape, sousEtape, saisie, erreurs } = etat
  const codePrestataire = saisie.specialitePrestataire?.code ?? null
  const codePrescripteur = saisie.specialite?.code ?? null

  // Une seule liste de spécialités pour les deux étapes : ce sont les mêmes.
  const specialites = useChargement('specialites', (signal) => listerSpecialites({ signal }))
  const natures = useChargement('natures', (signal) => listerNaturesPrestation({ signal }))
  const prestataires = useChargement(codePrestataire, (signal) =>
    listerPrescripteurs(codePrestataire ?? '', { signal }),
  )
  const prescripteurs = useChargement(codePrescripteur, (signal) =>
    listerPrescripteurs(codePrescripteur ?? '', { signal }),
  )

  const chargerFamille = useCallback(() => {
    setFamilleEnCours(true)
    void rafraichir().finally(() => setFamilleEnCours(false))
  }, [rafraichir])
  useEffect(() => {
    if (beneficiaires.length === 0) chargerFamille()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nouvelle étape : en haut de page, et le titre reçoit le focus.
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

  const onCreeRef = useRef(onCree)
  onCreeRef.current = onCree
  useEffect(() => {
    if (!lettreCreee) return
    const minuteur = window.setTimeout(() => onCreeRef.current(lettreCreee), dureeSucces())
    return () => window.clearTimeout(minuteur)
  }, [lettreCreee])

  const fige = envoi || lettreCreee !== null

  const precedent = () => {
    if (fige) return
    envoyer({ type: 'precedent' })
  }

  const annuler = () => {
    if (fige) return
    if (!saisie.beneficiaire) {
      onFermer()
      return
    }
    haptique.avertissement()
    setAbandonDemande(true)
  }

  const continuer = () => {
    const maintenant = aujourdhuiISO()
    if (erreurDate(saisie.datePrescription, maintenant)) haptique.erreur()
    else haptique.selection()
    envoyer({ type: 'continuer', aujourdhui: maintenant })
  }

  const generer = async () => {
    const corps = corpsDepuisSaisie(saisie)
    if (!corps || envoi || !enLigne || lettreCreee) return
    const dateRefusee = erreurDate(corps.datePrescription, aujourdhuiISO())
    if (dateRefusee) {
      haptique.erreur()
      envoyer({ type: 'erreurs-serveur', champs: { datePrescription: [dateRefusee] } })
      return
    }
    setEnvoi(true)
    try {
      const lettre = await creerLettre(corps)
      memoriserBon(lettre)
      void chargerBons()
      haptique.succes()
      setLettreCreee(lettre)
    } catch (e) {
      if (estErreurApi(e) && e.genre === 'annulee') return
      if (estErreurApi(e) && e.genre === 'non-autorise') {
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
            : 'La lettre n’a pas pu être générée.',
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

  const peutReculer = etape > 1 || sousEtape === 'fournisseur'
  const { titre, consigne } = entete(etat)
  const anime = etape !== 1 || etat.sens === 'arriere'
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
        <EtapeStructure
          role="prestataire"
          sousEtape={sousEtape}
          specialites={specialites}
          structures={prestataires}
          specialite={saisie.specialitePrestataire}
          structure={saisie.prestataire}
          onSpecialite={(specialite) => envoyer({ type: 'specialitePrestataire', specialite })}
          onStructure={(prestataire) => envoyer({ type: 'prestataire', prestataire })}
        />
      )
      break
    case 3:
      contenuEtape = (
        <EtapeNature
          natures={natures}
          selection={saisie.nature}
          onChoisir={(nature) => envoyer({ type: 'nature', nature })}
        />
      )
      break
    case 4:
      contenuEtape = (
        <EtapeStructure
          role="prescripteur"
          sousEtape={sousEtape}
          specialites={specialites}
          structures={prescripteurs}
          specialite={saisie.specialite}
          structure={saisie.prescripteur}
          onSpecialite={(specialite) => envoyer({ type: 'specialite', specialite })}
          onStructure={(prescripteur) => envoyer({ type: 'prescripteur', prescripteur })}
        />
      )
      break
    case 5:
      contenuEtape = (
        <EtapeOrdonnance
          aujourdhui={aujourdhui}
          date={saisie.datePrescription}
          erreurDate={erreurs.datePrescription}
          onDate={(date) => envoyer({ type: 'date', date })}
          libelles={LIBELLES_DATE}
        />
      )
      break
    case 6:
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

  const erreurChoix =
    etape === 1
      ? erreurs.beneficiaire
      : etape === 2
        ? (erreurs.specialitePrestataire ?? erreurs.prestataire)
        : etape === 3
          ? erreurs.naturePrestation
          : etape === 4
            ? (erreurs.specialite ?? erreurs.prescripteur)
            : undefined

  return (
    <>
      <IonContent ref={contenuRef} className="nouveau-bon">
        <div className="nouveau-bon__page">
          <BandeauMarque
            titre="Nouvelle lettre"
            sousTitre={`Étape ${etape} sur ${NB_ETAPES} · ${NOMS_ETAPES[etape]}`}
            onRetour={peutReculer ? precedent : undefined}
            fin={
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

          {(etape === 5 || etape === 6) && (
            <PiedBoutons>
              {etape === 6 && !enLigne && (
                <p className="nouveau-bon__hors-ligne" role="status">
                  <IonIcon icon={cloudOfflineOutline} aria-hidden="true" />
                  Vous êtes hors ligne. Reconnectez-vous pour générer la lettre : votre saisie est
                  conservée.
                </p>
              )}
              {etape === 5 ? (
                <BoutonPrincipal onClick={continuer}>Continuer</BoutonPrincipal>
              ) : (
                <BoutonPrincipal
                  occupe={envoi}
                  disabled={!enLigne || Boolean(lettreCreee) || !saisieComplete(saisie)}
                  onClick={() => void generer()}
                >
                  {envoi ? 'Génération de la lettre…' : 'Générer la lettre'}
                </BoutonPrincipal>
              )}
            </PiedBoutons>
          )}
        </div>
      </IonContent>

      {lettreCreee && <Succes bon={lettreCreee} titre="Lettre générée" />}

      <FeuilleChoix
        ouverte={abandonDemande}
        onFermer={() => setAbandonDemande(false)}
        titre="Abandonner cette lettre ?"
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

/**
 * Écran « Nouveau bon de pharmacie » (modal plein écran).
 *
 * C'est un FORMULAIRE, le même que celui de l'application web (Documents →
 * Bons de Pharmacie → Nouveau) : Bénéficiaire, Pharmacie, Prescripteur,
 * Ordonnance, puis « Enregistrer ». Il a remplacé l'assistant en cinq
 * étapes, à la demande du métier : le même document ne se demande pas de
 * deux façons selon qu'on part du guichet ou du téléphone.
 *
 * Ni titre ni section « Participant » : l'employé vient de toucher « Bon de
 * pharmacie », et la société comme le matricule sont les siens.
 *
 * Les champs obligatoires sont ceux de l'écran web, et eux seuls : le
 * bénéficiaire et son type. La pharmacie, le prescripteur et l'ordonnance
 * peuvent rester vides et seront complétés au traitement.
 *
 * Les listes de référence sont chargées dès l'ouverture (spécialités,
 * pharmacies) ou au choix de la spécialité (prescripteurs). Un refus du
 * serveur (400) s'affiche sous le champ concerné. Hors ligne, la saisie
 * reste possible mais l'enregistrement est désactivé, avec l'explication.
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
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  creerBon,
  estErreurApi,
  listerPharmacies,
  listerPrescripteurs,
  listerSpecialites,
  messageErreur,
} from '../../api'
import { BoutonPrincipal, PiedBoutons } from '../../components/Boutons'
import FeuilleChoix from '../../components/FeuilleChoix'
import OfflineBanner from '../../components/OfflineBanner'
import { chargerBons, memoriserBon } from '../../data/bons'
import { haptique } from '../../hooks/haptique'
import { useOnline } from '../../hooks/useOnline'
import { useSession } from '../../session'
import type { Beneficiaire, Bon, DateISO, Fournisseur, Specialite } from '../../types/api'
import { aujourdhuiISO } from '../../utils/format'
import {
  borneArticles,
  corpsDepuisSaisie,
  erreurDate,
  etatInitial,
  lireErreursServeur,
  saisieComplete,
  type ErreursSaisie,
  type Saisie,
} from './assistant'
import { useChargement } from './chargement'
import FormulaireBon from './FormulaireBon'
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

export default function NouveauBon({ onFermer, onCree }: NouveauBonProps) {
  const { beneficiaires, rafraichir } = useSession()
  const enLigne = useOnline()
  // Figée à l'ouverture : les bornes de la date ne bougent pas pendant la saisie.
  const [aujourdhui] = useState(() => aujourdhuiISO())
  const [saisie, setSaisie] = useState<Saisie>(() => etatInitial(aujourdhui).saisie)
  const [erreurs, setErreurs] = useState<ErreursSaisie>({})
  const [envoi, setEnvoi] = useState(false)
  const [bonCree, setBonCree] = useState<Bon | null>(null)
  const [familleEnCours, setFamilleEnCours] = useState(beneficiaires.length === 0)
  const [presenterToast] = useIonToast()
  // « Abandonner ce bon ? », posé dans une feuille de choix.
  const [abandonDemande, setAbandonDemande] = useState(false)

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

  // Succès : l'animation se joue, puis l'hôte ouvre le détail.
  const onCreeRef = useRef(onCree)
  onCreeRef.current = onCree
  useEffect(() => {
    if (!bonCree) return
    const minuteur = window.setTimeout(() => onCreeRef.current(bonCree), dureeSucces())
    return () => window.clearTimeout(minuteur)
  }, [bonCree])

  /** L'en-tête reste en place pendant l'envoi : ses boutons, eux, se taisent. */
  const fige = envoi || bonCree !== null

  /** Modifier un champ efface son erreur : elle ne vaut plus. */
  function changer(partie: Partial<Saisie>, ...champs: (keyof ErreursSaisie)[]) {
    setSaisie((avant) => ({ ...avant, ...partie }))
    setErreurs((avant) => {
      const suivantes = { ...avant }
      for (const champ of champs) delete suivantes[champ]
      delete suivantes.non_field_errors
      return suivantes
    })
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

  const enregistrer = async () => {
    const corps = corpsDepuisSaisie(saisie)
    if (!corps || envoi || !enLigne || bonCree) return
    // Le formulaire a pu rester ouvert depuis la veille : la date se revérifie.
    const dateRefusee = corps.dateOrdonnance
      ? erreurDate(corps.dateOrdonnance, aujourdhuiISO())
      : undefined
    if (dateRefusee) {
      haptique.erreur()
      setErreurs((avant) => ({ ...avant, dateOrdonnance: dateRefusee }))
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
        setErreurs(lireErreursServeur(e.champs))
        void presenterToast({
          message: 'Une information est à corriger.',
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

  return (
    <>
      <IonContent className="nouveau-bon">
        <div className="nouveau-bon__page">
          {/* Ni titre ni sous-titre (demande de l'utilisateur) : l'employé
              vient de toucher « Bon de pharmacie », il sait où il est. Reste
              la sortie, qui ne peut pas disparaître - c'est le seul moyen de
              refermer le formulaire. */}
          <div className="nouveau-bon__barre">
            <button
              type="button"
              className="nouveau-bon__annuler ipm-appui"
              onClick={annuler}
              disabled={fige}
            >
              Annuler
            </button>
          </div>

          <OfflineBanner />

          <FormulaireBon
            beneficiaires={beneficiaires}
            familleEnCours={familleEnCours}
            specialites={specialites}
            prescripteurs={prescripteurs}
            pharmacies={pharmacies}
            saisie={saisie}
            erreurs={erreurs}
            aujourdhui={aujourdhui}
            fige={fige}
            onBeneficiaire={(beneficiaire: Beneficiaire | null) =>
              changer({ beneficiaire }, 'beneficiaire')
            }
            onSpecialite={(specialite: Specialite | null) =>
              // Autre spécialité : le prescripteur choisi n'en fait plus partie.
              changer({ specialite, prescripteur: null }, 'specialite', 'prescripteur')
            }
            onPrescripteur={(prescripteur: Fournisseur | null) =>
              changer({ prescripteur }, 'prescripteur')
            }
            onPharmacie={(pharmacie: Fournisseur | null) => changer({ pharmacie }, 'pharmacie')}
            onDate={(dateOrdonnance: DateISO) => changer({ dateOrdonnance }, 'dateOrdonnance')}
            onArticles={(nombre: number) =>
              changer({ nbArticles: nombre ? borneArticles(nombre) : 0 }, 'nbArticles')
            }
          />

          <PiedBoutons>
            {!enLigne && (
              <p className="nouveau-bon__hors-ligne" role="status">
                <IonIcon icon={cloudOfflineOutline} aria-hidden="true" />
                Vous êtes hors ligne. Reconnectez-vous pour générer le bon : votre saisie est
                conservée.
              </p>
            )}
            <BoutonPrincipal
              occupe={envoi}
              disabled={!enLigne || Boolean(bonCree) || !saisieComplete(saisie)}
              onClick={() => void enregistrer()}
            >
              {envoi ? 'Génération du bon…' : 'Enregistrer'}
            </BoutonPrincipal>
          </PiedBoutons>
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

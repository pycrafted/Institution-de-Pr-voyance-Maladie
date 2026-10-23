/**
 * Écran « Nouvelle lettre de garantie » (modal plein écran).
 *
 * C'est un FORMULAIRE, le même que celui de l'application web (Documents →
 * Lettres de Garantie → Nouveau) : Bénéficiaire, Prestataire, Prescripteur,
 * Actes, puis « Enregistrer ». Il a remplacé l'assistant en six étapes,
 * comme le bon de pharmacie avant lui : le même document ne se demande pas
 * de deux façons selon qu'on part du guichet ou du téléphone.
 *
 * Ni titre ni section « Participant » : l'employé vient de toucher « Lettre
 * de garantie », et la société comme le matricule sont les siens.
 *
 * Les champs obligatoires sont ceux de l'écran web, et eux seuls : le
 * bénéficiaire et son type. Le prestataire, la nature, le prescripteur et la
 * prescription peuvent rester vides et seront complétés au traitement.
 *
 * Contrat (NouveauBonModal.tsx en dépend) : rendu dans un IonModal plein
 * écran déjà ouvert ; `onFermer()` à l'abandon ; `onCree(lettre)` après
 * l'animation de succès.
 */

import { IonContent, IonIcon, useIonToast } from '@ionic/react'
import { alertCircleOutline, cloudOfflineOutline, trashOutline } from 'ionicons/icons'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  creerLettre,
  estErreurApi,
  listerNaturesPrestation,
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
import type {
  Beneficiaire,
  Bon,
  CodeLibelle,
  DateISO,
  Fournisseur,
  Specialite,
} from '../../types/api'
import { aujourdhuiISO } from '../../utils/format'
import { borneArticles } from '../NouveauBon/assistant'
import { useChargement } from '../NouveauBon/chargement'
import Succes from '../NouveauBon/Succes'
import {
  corpsDepuisSaisie,
  erreurDate,
  etatInitial,
  lireErreursServeur,
  saisieComplete,
  type ErreursSaisie,
  type Saisie,
} from './assistant'
import FormulaireLettre from './FormulaireLettre'
import '../NouveauBon/NouveauBon.css'

export interface NouvelleLettreProps {
  onFermer: () => void
  onCree: (lettre: Bon) => void
}

/** Temps laissé à l'animation de succès avant d'ouvrir le détail. */
export const DUREE_SUCCES_MS = 1600
const DUREE_SUCCES_REDUITE_MS = 700

function dureeSucces(): number {
  const reduit =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduit ? DUREE_SUCCES_REDUITE_MS : DUREE_SUCCES_MS
}

export default function NouvelleLettre({ onFermer, onCree }: NouvelleLettreProps) {
  const { beneficiaires, rafraichir } = useSession()
  const enLigne = useOnline()
  const [aujourdhui] = useState(() => aujourdhuiISO())
  const [saisie, setSaisie] = useState<Saisie>(() => etatInitial(aujourdhui).saisie)
  const [erreurs, setErreurs] = useState<ErreursSaisie>({})
  const [envoi, setEnvoi] = useState(false)
  const [lettreCreee, setLettreCreee] = useState<Bon | null>(null)
  const [familleEnCours, setFamilleEnCours] = useState(beneficiaires.length === 0)
  const [presenterToast] = useIonToast()
  const [abandonDemande, setAbandonDemande] = useState(false)

  const codePrestataire = saisie.specialitePrestataire?.code ?? null
  const codePrescripteur = saisie.specialite?.code ?? null

  // Une seule liste de spécialités pour les deux sections : ce sont les mêmes.
  const specialites = useChargement('specialites', (signal) => listerSpecialites({ signal }))
  // Les natures sont rangées d'après la spécialité du PRESTATAIRE : le serveur
  // sait, des lettres réelles de LAMPS, lesquelles cette spécialité donne.
  const natures = useChargement(`natures:${codePrestataire ?? ''}`, (signal) =>
    listerNaturesPrestation(codePrestataire, { signal }),
  )
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

  // Succès : l'animation se joue, puis l'hôte ouvre le détail.
  const onCreeRef = useRef(onCree)
  onCreeRef.current = onCree
  useEffect(() => {
    if (!lettreCreee) return
    const minuteur = window.setTimeout(() => onCreeRef.current(lettreCreee), dureeSucces())
    return () => window.clearTimeout(minuteur)
  }, [lettreCreee])

  const fige = envoi || lettreCreee !== null

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
    if (!saisie.beneficiaire) {
      onFermer()
      return
    }
    haptique.avertissement()
    setAbandonDemande(true)
  }

  const enregistrer = async () => {
    const corps = corpsDepuisSaisie(saisie)
    if (!corps || envoi || !enLigne || lettreCreee) return
    // Le formulaire a pu rester ouvert depuis la veille : la date se revérifie.
    const dateRefusee = corps.datePrescription
      ? erreurDate(corps.datePrescription, aujourdhuiISO())
      : undefined
    if (dateRefusee) {
      haptique.erreur()
      setErreurs((avant) => ({ ...avant, datePrescription: dateRefusee }))
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
          {/* Ni titre ni sous-titre : l'employé vient de toucher « Lettre de
              garantie ». Reste la sortie, seul moyen de refermer. */}
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

          <FormulaireLettre
            beneficiaires={beneficiaires}
            familleEnCours={familleEnCours}
            specialites={specialites}
            prestataires={prestataires}
            natures={natures}
            prescripteurs={prescripteurs}
            saisie={saisie}
            erreurs={erreurs}
            aujourdhui={aujourdhui}
            fige={fige}
            onBeneficiaire={(beneficiaire: Beneficiaire | null) =>
              changer({ beneficiaire }, 'beneficiaire')
            }
            onSpecialitePrestataire={(specialitePrestataire: Specialite | null) =>
              // Autre spécialité : le prestataire choisi n'en fait plus partie.
              // La nature, elle, reste : aucune ne devient interdite, la liste
              // est seulement rangée autrement.
              changer(
                { specialitePrestataire, prestataire: null },
                'specialitePrestataire',
                'prestataire',
              )
            }
            onPrestataire={(prestataire: Fournisseur | null) =>
              changer({ prestataire }, 'prestataire')
            }
            onNature={(nature: CodeLibelle | null) => changer({ nature }, 'naturePrestation')}
            onSpecialite={(specialite: Specialite | null) =>
              changer({ specialite, prescripteur: null }, 'specialite', 'prescripteur')
            }
            onPrescripteur={(prescripteur: Fournisseur | null) =>
              changer({ prescripteur }, 'prescripteur')
            }
            onDate={(datePrescription: DateISO) =>
              changer({ datePrescription }, 'datePrescription')
            }
            onArticles={(nombre: number) =>
              changer({ nbArticles: nombre ? borneArticles(nombre) : 0 })
            }
          />

          <PiedBoutons>
            {!enLigne && (
              <p className="nouveau-bon__hors-ligne" role="status">
                <IonIcon icon={cloudOfflineOutline} aria-hidden="true" />
                Vous êtes hors ligne. Reconnectez-vous pour générer la lettre : votre saisie est
                conservée.
              </p>
            )}
            <BoutonPrincipal
              occupe={envoi}
              disabled={!enLigne || Boolean(lettreCreee) || !saisieComplete(saisie)}
              onClick={() => void enregistrer()}
            >
              {envoi ? 'Génération de la lettre…' : 'Enregistrer'}
            </BoutonPrincipal>
          </PiedBoutons>
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

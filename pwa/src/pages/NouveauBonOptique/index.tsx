/**
 * Écran « Nouveau bon d'optique » (modal plein écran).
 *
 * C'est un FORMULAIRE, le même que celui de l'application web (Documents →
 * Bons Optique → Nouveau) : Bénéficiaire, Prescripteur, Fournisseur,
 * Articles, puis « Enregistrer » — comme le bon de pharmacie et la lettre de
 * garantie avant lui : le même document ne se demande pas de deux façons
 * selon qu'on part du guichet ou du téléphone.
 *
 * Ni titre ni section « Participant » : l'employé vient de toucher « Bon
 * d'optique », et la société comme le matricule sont les siens.
 *
 * Contrat (NouveauBonModal.tsx en dépend) : rendu dans un IonModal plein
 * écran déjà ouvert ; `onFermer()` à l'abandon ; `onCree(bon)` après
 * l'animation de succès.
 */

import { IonContent, IonIcon, useIonToast } from '@ionic/react'
import { alertCircleOutline, cloudOfflineOutline, trashOutline } from 'ionicons/icons'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  creerBonOptique,
  estErreurApi,
  listerArticlesOptique,
  listerOpticiens,
  listerPrescripteurs,
  listerSpecialites,
  messageErreur,
} from '../../api'
import { BoutonPrincipal, PiedBoutons } from '../../components/Boutons'
import FeuilleChoix from '../../components/FeuilleChoix'
import OfflineBanner from '../../components/OfflineBanner'
import { chargerBons, memoriserBon, useBons } from '../../data/bons'
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
import { useChargement } from '../NouveauBon/chargement'
import Succes from '../NouveauBon/Succes'
import { DUREE_SUCCES_MS } from '../NouvelleLettre'
import {
  avertissementRenouvellement,
  basculerArticle,
  corpsDepuisSaisie,
  erreurDate,
  etatInitial,
  lireErreursServeur,
  saisieComplete,
  type ErreursSaisie,
  type Saisie,
} from './assistant'
import FormulaireBonOptique from './FormulaireBonOptique'
import '../NouveauBon/NouveauBon.css'

export interface NouveauBonOptiqueProps {
  onFermer: () => void
  onCree: (bon: Bon) => void
}

const DUREE_SUCCES_REDUITE_MS = 700

function dureeSucces(): number {
  const reduit =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduit ? DUREE_SUCCES_REDUITE_MS : DUREE_SUCCES_MS
}

export default function NouveauBonOptique({ onFermer, onCree }: NouveauBonOptiqueProps) {
  const { beneficiaires, rafraichir } = useSession()
  const enLigne = useOnline()
  const { bons } = useBons()
  const [aujourdhui] = useState(() => aujourdhuiISO())
  const [saisie, setSaisie] = useState<Saisie>(() => etatInitial(aujourdhui))
  const [erreurs, setErreurs] = useState<ErreursSaisie>({})
  const [envoi, setEnvoi] = useState(false)
  const [bonCree, setBonCree] = useState<Bon | null>(null)
  const [familleEnCours, setFamilleEnCours] = useState(beneficiaires.length === 0)
  const [presenterToast] = useIonToast()
  const [abandonDemande, setAbandonDemande] = useState(false)

  const codePrescripteur = saisie.specialite?.code ?? null

  const specialites = useChargement('specialites', (signal) => listerSpecialites({ signal }))
  const prescripteurs = useChargement(codePrescripteur, (signal) =>
    listerPrescripteurs(codePrescripteur ?? '', { signal }),
  )
  const opticiens = useChargement('opticiens', (signal) => listerOpticiens({ signal }))
  const articles = useChargement('articles-optique', (signal) => listerArticlesOptique({ signal }))

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
    if (!bonCree) return
    const minuteur = window.setTimeout(() => onCreeRef.current(bonCree), dureeSucces())
    return () => window.clearTimeout(minuteur)
  }, [bonCree])

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
      const bon = await creerBonOptique(corps)
      memoriserBon(bon)
      void chargerBons()
      haptique.succes()
      setBonCree(bon)
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
          {/* Ni titre ni sous-titre : l'employé vient de toucher « Bon
              d'optique ». Reste la sortie, seul moyen de refermer. */}
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

          <FormulaireBonOptique
            avertissement={avertissementRenouvellement(bons ?? [], saisie, aujourdhui)}
            beneficiaires={beneficiaires}
            familleEnCours={familleEnCours}
            specialites={specialites}
            prescripteurs={prescripteurs}
            opticiens={opticiens}
            articles={articles}
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
            onOpticien={(opticien: Fournisseur | null) => changer({ opticien }, 'opticien')}
            onArticle={(article: CodeLibelle) =>
              changer({ articles: basculerArticle(saisie.articles, article) }, 'articles')
            }
            onDate={(datePrescription: DateISO) =>
              changer({ datePrescription }, 'datePrescription')
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

      {bonCree && <Succes bon={bonCree} titre="Bon généré" />}

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

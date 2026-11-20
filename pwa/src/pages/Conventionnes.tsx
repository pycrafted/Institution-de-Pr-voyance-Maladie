/**
 * Écran « Conventionnés » (/conventionnes) : l'annuaire de TOUTES les
 * structures conventionnées par l'IPM — pharmacies, cliniques, hôpitaux,
 * laboratoires, cabinets… — et non plus des seules pharmacies.
 *
 * De haut en bas :
 *   1. la barre du haut (nom, solde, actions) ;
 *   2. les filtres : « Toutes », puis une puce par spécialité présente, les
 *      plus fournies d'abord, avec leur compte ;
 *   3. la CARTE Google des structures de la catégorie choisie, un point par
 *      structure localisée (conventionnes/CarteStructures.tsx) ;
 *   (plus de liste dessous : les structures sont les points de la carte,
 *   une vignette par point touché) ; l'ancienne carte autonome (§3.5) donnait
 *   nom, spécialité, adresse,
 *      téléphone, et deux boutons ronds — « Appeler » (`tel:`) et « S'y
 *      rendre », qui ouvre la carte de l'itinéraire DANS l'application
 *      (pages/Itineraire.tsx).
 *
 * La carte occupe toute la page (pas de « tirer pour rafraîchir »). Squelettes tant que rien n'est connu, état vide
 * illustré (§3.10) quand l'annuaire est vide, introuvable ou hors de portée.
 */

import { IonContent, IonPage } from '@ionic/react'
import { cloudOfflineOutline, medicalOutline, warningOutline } from 'ionicons/icons'
import { useMemo, useState, type ReactNode } from 'react'

import EtatVide from '../components/EtatVide'
import OfflineBanner from '../components/OfflineBanner'
import PucesFiltre from '../components/PucesFiltre'
import Chargeur from '../components/Chargeur'
import BarreActions from '../components/BarreActions'
import { useOnline } from '../hooks/useOnline'
import { filtrerConventionnes, filtresSpecialites, TOUS } from './conventionnes/recherche'
import CarteStructures from './conventionnes/CarteStructures'
import HorsCarte from './conventionnes/HorsCarte'
import { useConventionnes } from './conventionnes/useConventionnes'
import './conventionnes/conventionnes.css'

export default function Conventionnes() {
  const { structures, chargement, erreur, synchroniseLe, rafraichir } = useConventionnes()
  const enLigne = useOnline()
  const [specialite, setSpecialite] = useState(TOUS)

  /** « Toutes », puis une puce par spécialité, avec son compte. */
  const categories = useMemo(() => {
    if (!structures) return []
    return [
      { cle: TOUS, libelle: 'Toutes', nombre: structures.length },
      ...filtresSpecialites(structures).map((f) => ({
        cle: f.code,
        libelle: f.libelle,
        nombre: f.nombre,
      })),
    ]
  }, [structures])

  const trouvees = useMemo(
    () => (structures ? filtrerConventionnes(structures, '', specialite) : []),
    [structures, specialite],
  )

  const avecAnnuaire = structures !== null && structures.length > 0
  // Liste déjà affichée mais dernière synchronisation en échec : on le dit,
  // au lieu de laisser croire que l'annuaire est à jour.
  const serveurInjoignable = structures !== null && erreur !== null && !chargement

  function toutAfficher() {
    setSpecialite(TOUS)
  }

  let contenu: ReactNode = null
  if (structures === null) {
    contenu =
      erreur && !chargement ? (
        <EtatVide
          icone={enLigne ? warningOutline : cloudOfflineOutline}
          teinte={enLigne ? 'annule' : 'neutre'}
          titre={enLigne ? 'Annuaire indisponible' : 'Annuaire indisponible hors ligne'}
          message={
            enLigne
              ? erreur.message
              : 'La liste des structures conventionnées se charge depuis le serveur de l’IPM. Reconnectez-vous pour la consulter.'
          }
          action={{ libelle: 'Réessayer', onClick: () => void rafraichir() }}
        />
      ) : (
        // L'annuaire se charge : le chargeur de l'application, au centre.
        <div className="conventionnes__chargement" aria-busy="true">
          <Chargeur aria-label="Chargement des structures" />
        </div>
      )
  } else if (structures.length === 0) {
    contenu = (
      <EtatVide
        icone={medicalOutline}
        titre="Aucune structure conventionnée"
        message="L’annuaire de votre IPM n’en comporte aucune pour l’instant. Rapprochez-vous de l’IPM."
      />
    )
  } else if (trouvees.length === 0) {
    contenu = (
      <EtatVide
        icone={medicalOutline}
        teinte="neutre"
        titre="Aucune structure trouvée"
        message="Aucune structure dans cette catégorie."
        action={{ libelle: 'Toutes les structures', onClick: toutAfficher, secondaire: true }}
      />
    )
  }
  // Sinon, rien sous la carte : les structures sont les points de la carte
  // (un point touché ouvre sa vignette, avec « Appeler » et « S'y rendre »).

  return (
    <IonPage className="conventionnes">
      {/* Pas de défilement ni de « tirer pour rafraîchir » : le geste sur la
          page appartient à la carte, qui en occupe tout le fond. */}
      <IonContent fullscreen scrollY={false}>
        <div className="conventionnes__ecran">
          {/* La carte en fond, sur toute la page : un point par structure de
              la catégorie choisie. */}
          {avecAnnuaire && <CarteStructures structures={trouvees} />}
          {/* Les structures sans position, de la catégorie choisie : un bouton
              sur la carte, qui les liste. */}
          {avecAnnuaire && <HorsCarte structures={trouvees.filter((s) => !s.position)} />}

          {/* Par-dessus, en haut : la barre de l'application et les filtres. */}
          <div className="conventionnes__dessus">
            <BarreActions />
            <OfflineBanner synchroniseLe={synchroniseLe} forcer={serveurInjoignable} />
            {avecAnnuaire && (
              <PucesFiltre
                className="conventionnes__filtres"
                puces={categories}
                active={specialite}
                etiquette="Catégories de structures"
                onChanger={setSpecialite}
              />
            )}
          </div>

          {/* Chargement, annuaire vide ou injoignable, catégorie vide : posé
              au-dessus de la carte, au milieu. */}
          {contenu && <div className="conventionnes__etat">{contenu}</div>}
        </div>
      </IonContent>
    </IonPage>
  )
}

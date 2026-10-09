/**
 * Étape 2 : qui a prescrit ? D'abord la spécialité (médecine générale,
 * pédiatrie…), puis le médecin ou la structure dans cette spécialité : deux
 * listes courtes valent mieux qu'une liste de tous les prescripteurs.
 */

import { medkitOutline, personOutline } from 'ionicons/icons'

import type { Fournisseur, Specialite } from '../../types/api'
import { capitaliser, pluriel } from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import type { SousEtapePrescripteur } from './assistant'
import type { Chargement } from './chargement'
import ListeRecherchable from './ListeRecherchable'

interface Props {
  sousEtape: SousEtapePrescripteur
  specialites: Chargement<Specialite[]>
  prescripteurs: Chargement<Fournisseur[]>
  specialite: Specialite | null
  prescripteur: Fournisseur | null
  onSpecialite: (specialite: Specialite) => void
  onPrescripteur: (prescripteur: Fournisseur) => void
}

export default function EtapePrescripteur(props: Props) {
  const { sousEtape, specialites, prescripteurs, specialite, prescripteur } = props

  if (sousEtape === 'specialite') {
    return (
      <ListeRecherchable<Specialite>
        elements={specialites.donnees}
        chargement={specialites.chargement}
        erreur={specialites.erreur}
        onReessayer={specialites.recharger}
        cle={(s) => s.code}
        titre={(s) => capitaliser(s.libelle)}
        note={(s) => pluriel(s.nombre, 'prescripteur')}
        textesRecherche={(s) => [s.libelle]}
        selection={specialite?.code ?? null}
        onChoisir={props.onSpecialite}
        libelleRecherche="Spécialité"
        placeholder="Rechercher une spécialité"
        nomListe="Spécialités"
        cleListe="specialites"
        mot={['spécialité', 'spécialités']}
        icone={medkitOutline}
        vide={{
          titre: 'Aucune spécialité',
          message:
            'Aucun prescripteur conventionné n’est disponible pour le moment. Rapprochez-vous de l’IPM.',
        }}
      />
    )
  }

  return (
    <ListeRecherchable<Fournisseur>
      // La clé force une liste neuve (recherche vidée) à chaque spécialité.
      key={specialite?.code ?? ''}
      elements={prescripteurs.donnees}
      chargement={prescripteurs.chargement}
      erreur={prescripteurs.erreur}
      onReessayer={prescripteurs.recharger}
      cle={(f) => f.code}
      titre={(f) => nomPropre(f.libelle)}
      sousTitre={(f) => (f.adresse ? nomPropre(f.adresse) : null)}
      textesRecherche={(f) => [f.libelle, f.adresse]}
      selection={prescripteur?.code ?? null}
      onChoisir={props.onPrescripteur}
      libelleRecherche="Médecin ou structure"
      placeholder="Rechercher un médecin, une clinique"
      nomListe={
        specialite ? `Prescripteurs en ${capitaliser(specialite.libelle)}` : 'Prescripteurs'
      }
      cleListe="prescripteurs"
      mot={['prescripteur', 'prescripteurs']}
      icone={personOutline}
      vide={{
        titre: 'Aucun prescripteur',
        message: 'Cette spécialité n’a plus de prescripteur conventionné. Choisissez-en une autre.',
      }}
    />
  )
}

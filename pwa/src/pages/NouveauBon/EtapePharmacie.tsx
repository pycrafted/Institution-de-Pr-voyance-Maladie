/**
 * Étape 3 : la pharmacie conventionnée où l'employé retirera ses
 * médicaments. Liste longue : recherche sur le nom et l'adresse (quartier).
 */

import { storefrontOutline } from 'ionicons/icons'

import type { Fournisseur } from '../../types/api'
import { nomPropre } from '../../utils/libelles'
import type { Chargement } from './chargement'
import ListeRecherchable from './ListeRecherchable'

interface Props {
  pharmacies: Chargement<Fournisseur[]>
  selection: Fournisseur | null
  onChoisir: (pharmacie: Fournisseur) => void
}

export default function EtapePharmacie({ pharmacies, selection, onChoisir }: Props) {
  return (
    <ListeRecherchable<Fournisseur>
      elements={pharmacies.donnees}
      chargement={pharmacies.chargement}
      erreur={pharmacies.erreur}
      onReessayer={pharmacies.recharger}
      cle={(f) => f.code}
      titre={(f) => nomPropre(f.libelle)}
      sousTitre={(f) => (f.adresse ? nomPropre(f.adresse) : null)}
      textesRecherche={(f) => [f.libelle, f.adresse]}
      selection={selection?.code ?? null}
      onChoisir={onChoisir}
      libelleRecherche="Pharmacie"
      placeholder="Nom ou quartier de la pharmacie"
      nomListe="Pharmacies conventionnées"
      cleListe="pharmacies"
      mot={['pharmacie', 'pharmacies']}
      icone={storefrontOutline}
      vide={{
        titre: 'Aucune pharmacie',
        message:
          'Aucune pharmacie conventionnée n’est disponible pour le moment. Rapprochez-vous de l’IPM.',
      }}
    />
  )
}

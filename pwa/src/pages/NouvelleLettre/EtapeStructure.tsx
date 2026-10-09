/**
 * Étapes 2 et 4 de la lettre : une structure choisie en deux temps, d'abord
 * sa spécialité, puis la structure dans cette spécialité — le prestataire qui
 * soignera, ou le prescripteur qui a prescrit. Mêmes listes que l'assistant
 * du bon (pages/NouveauBon/EtapePrescripteur), aux mots près.
 */

import { businessOutline, medkitOutline, personOutline } from 'ionicons/icons'

import type { Fournisseur, Specialite } from '../../types/api'
import { capitaliser, pluriel } from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import type { Chargement } from '../NouveauBon/chargement'
import ListeRecherchable from '../NouveauBon/ListeRecherchable'
import type { SousEtape } from './assistant'

export type RoleStructure = 'prestataire' | 'prescripteur'

interface Props {
  role: RoleStructure
  sousEtape: SousEtape
  specialites: Chargement<Specialite[]>
  structures: Chargement<Fournisseur[]>
  specialite: Specialite | null
  structure: Fournisseur | null
  onSpecialite: (specialite: Specialite) => void
  onStructure: (structure: Fournisseur) => void
}

const MOTS: Record<
  RoleStructure,
  { cle: string; mot: [string, string]; recherche: string; placeholder: string; icone: string }
> = {
  prestataire: {
    cle: 'prestataires',
    mot: ['structure', 'structures'],
    recherche: 'Structure',
    placeholder: 'Rechercher une clinique, un laboratoire',
    icone: businessOutline,
  },
  prescripteur: {
    cle: 'prescripteurs',
    mot: ['prescripteur', 'prescripteurs'],
    recherche: 'Médecin ou structure',
    placeholder: 'Rechercher un médecin, une clinique',
    icone: personOutline,
  },
}

export default function EtapeStructure(props: Props) {
  const { role, sousEtape, specialites, structures, specialite, structure } = props
  const mots = MOTS[role]

  if (sousEtape === 'specialite') {
    return (
      <ListeRecherchable<Specialite>
        elements={specialites.donnees}
        chargement={specialites.chargement}
        erreur={specialites.erreur}
        onReessayer={specialites.recharger}
        cle={(s) => s.code}
        titre={(s) => capitaliser(s.libelle)}
        note={(s) => pluriel(s.nombre, mots.mot[0], mots.mot[1])}
        textesRecherche={(s) => [s.libelle]}
        selection={specialite?.code ?? null}
        onChoisir={props.onSpecialite}
        libelleRecherche="Spécialité"
        placeholder="Rechercher une spécialité"
        nomListe="Spécialités"
        cleListe={`specialites-${mots.cle}`}
        mot={['spécialité', 'spécialités']}
        icone={medkitOutline}
        vide={{
          titre: 'Aucune spécialité',
          message:
            'Aucune structure conventionnée n’est disponible pour le moment. Rapprochez-vous de l’IPM.',
        }}
      />
    )
  }

  const enSpecialite = specialite ? ` en ${capitaliser(specialite.libelle)}` : ''
  return (
    <ListeRecherchable<Fournisseur>
      // La clé force une liste neuve (recherche vidée) à chaque spécialité.
      key={specialite?.code ?? ''}
      elements={structures.donnees}
      chargement={structures.chargement}
      erreur={structures.erreur}
      onReessayer={structures.recharger}
      cle={(f) => f.code}
      titre={(f) => nomPropre(f.libelle)}
      sousTitre={(f) => (f.adresse ? nomPropre(f.adresse) : null)}
      textesRecherche={(f) => [f.libelle, f.adresse]}
      selection={structure?.code ?? null}
      onChoisir={props.onStructure}
      libelleRecherche={mots.recherche}
      placeholder={mots.placeholder}
      nomListe={`${capitaliser(mots.mot[1])}${enSpecialite}`}
      cleListe={mots.cle}
      mot={mots.mot}
      icone={mots.icone}
      vide={{
        titre: `Aucun${role === 'prestataire' ? 'e' : ''} ${mots.mot[0]}`,
        message: 'Cette spécialité n’a plus de structure conventionnée. Choisissez-en une autre.',
      }}
    />
  )
}

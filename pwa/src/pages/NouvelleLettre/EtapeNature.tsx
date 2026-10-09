/**
 * Étape 3 : pour quelle prestation ? Visite, analyses, radiologie,
 * hospitalisation… : les natures du référentiel IPM qu'une lettre de
 * garantie peut couvrir (la pharmacie et l'optique ont leur propre bon).
 */

import { clipboardOutline } from 'ionicons/icons'

import type { CodeLibelle } from '../../types/api'
import { capitaliser } from '../../utils/format'
import type { Chargement } from '../NouveauBon/chargement'
import ListeRecherchable from '../NouveauBon/ListeRecherchable'

interface Props {
  natures: Chargement<CodeLibelle[]>
  selection: CodeLibelle | null
  onChoisir: (nature: CodeLibelle) => void
}

export default function EtapeNature({ natures, selection, onChoisir }: Props) {
  return (
    <ListeRecherchable<CodeLibelle>
      elements={natures.donnees}
      chargement={natures.chargement}
      erreur={natures.erreur}
      onReessayer={natures.recharger}
      cle={(n) => n.code}
      titre={(n) => capitaliser(n.libelle)}
      textesRecherche={(n) => [n.libelle]}
      selection={selection?.code ?? null}
      onChoisir={onChoisir}
      libelleRecherche="Prestation"
      placeholder="Rechercher une prestation"
      nomListe="Natures de prestation"
      cleListe="natures"
      mot={['prestation', 'prestations']}
      icone={clipboardOutline}
      vide={{
        titre: 'Aucune prestation',
        message: 'Aucune prestation n’est disponible pour le moment. Rapprochez-vous de l’IPM.',
      }}
    />
  )
}

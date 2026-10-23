/**
 * Libellés de la famille (bénéficiaires), partagés par le profil et
 * l'accueil. Le référentiel IPM écrit les liens en majuscules et au
 * masculin (« CONJOINT ») : on les rend lisibles et accordés.
 */

import type { Beneficiaire } from '../../types/api'
import { age, matriculeSansSociete } from '../../utils/format'
import { libelleLien } from '../../utils/libelles'

// Le lien de parenté se nomme pareil sur tous les écrans : la table des liens
// vit dans utils/libelles.ts.
export { libelleLien }

/** « Homme », « Femme », ou '' si le référentiel ne dit rien. */
export function libelleSexe(sexe: string | null | undefined): string {
  if (sexe === 'M') return 'Homme'
  if (sexe === 'F') return 'Femme'
  return ''
}

/** Ligne de détail sous le nom : « Conjointe · 58 ans · 1204 ». */
export function detailBeneficiaire(beneficiaire: Beneficiaire): string {
  return [libelleLien(beneficiaire), age(beneficiaire.age), matriculeSansSociete(beneficiaire.matricule)]
    .filter(Boolean)
    .join(' · ')
}

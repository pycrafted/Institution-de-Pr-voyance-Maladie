/**
 * Les informations de l'employé, telles que le profil les détaille au-dessus
 * de sa famille, dans l'ordre d'une fiche administrative. Les rubriques
 * courtes (matricule, sexe, téléphone…) se rangent deux par ligne ; celles
 * qui portent un texte long (nom, société, adresse, courriel) prennent la
 * largeur entière. Ce que l'IPM ne renseigne pas n'apparaît pas — une ligne
 * « Non renseigné » n'apprend rien et allonge l'écran.
 *
 * Aucune n'est modifiable ici : ces informations se corrigent à l'IPM. Seule
 * la photo se change, et c'est sur la carte de l'accueil.
 */

import type { Participant } from '../../types/api'
import { age, dateMoyenne, telephone } from '../../utils/format'
import { nomPropre } from '../../utils/libelles'
import { libelleLisible } from '../accueil/accueil-utils'

export interface Information {
  /** Clé stable (rendu React, tests). */
  cle: string
  libelle: string
  valeur: string
  /** Chiffres alignés (matricule, téléphone, dates). */
  chiffres?: boolean
  /** Toute la largeur : un texte long ne se coupe pas en deux colonnes. */
  large?: boolean
  /** Lien à ouvrir : appel téléphonique, courriel. */
  lien?: string
}

const SEXES: Record<string, string> = { M: 'Homme', F: 'Femme' }

export function informationsDuParticipant(participant: Participant): Information[] {
  const lignes: (Information | null)[] = [
    {
      cle: 'nom',
      libelle: 'Nom et prénom(s)',
      valeur: nomPropre(participant.nomComplet),
      large: true,
    },
    { cle: 'matricule', libelle: 'Matricule', valeur: participant.matricule, chiffres: true },
    participant.dateNaissance
      ? {
          cle: 'naissance',
          libelle: 'Date de naissance',
          valeur: [dateMoyenne(participant.dateNaissance), age(participant.age)]
            .filter(Boolean)
            .join(' · '),
          chiffres: true,
        }
      : null,
    participant.lieuNaissance
      ? { cle: 'lieu', libelle: 'Lieu de naissance', valeur: nomPropre(participant.lieuNaissance) }
      : null,
    participant.sexe && SEXES[participant.sexe]
      ? { cle: 'sexe', libelle: 'Sexe', valeur: SEXES[participant.sexe] as string }
      : null,
    participant.situationFamiliale
      ? {
          cle: 'famille',
          libelle: 'Situation familiale',
          valeur: nomPropre(participant.situationFamiliale),
        }
      : null,
    participant.societe
      ? {
          cle: 'societe',
          libelle: 'Société',
          valeur: libelleLisible(participant.societe.libelle),
          large: true,
        }
      : null,
    participant.etat ? { cle: 'etat', libelle: 'Dossier IPM', valeur: participant.etat } : null,
    participant.telephone
      ? {
          cle: 'telephone',
          libelle: 'Téléphone',
          valeur: telephone(participant.telephone),
          chiffres: true,
          lien: `tel:${participant.telephone.replace(/[^\d+]/g, '')}`,
        }
      : null,
    participant.email
      ? {
          cle: 'email',
          libelle: 'Adresse e-mail',
          valeur: participant.email,
          lien: `mailto:${participant.email}`,
          large: true,
        }
      : null,
    participant.adresse
      ? { cle: 'adresse', libelle: 'Adresse', valeur: nomPropre(participant.adresse), large: true }
      : null,
  ]
  return lignes.filter((ligne): ligne is Information => ligne !== null && Boolean(ligne.valeur))
}

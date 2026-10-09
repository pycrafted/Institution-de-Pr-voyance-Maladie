/**
 * Données d'exemple conformes aux représentations de l'API (types/api.ts),
 * pour les tests des écrans. `surcharge` remplace les champs voulus.
 */

import type {
  Beneficiaire,
  Bon,
  Fournisseur,
  MoiReponse,
  Participant,
  Specialite,
} from '../types/api'

export function unParticipant(surcharge: Partial<Participant> = {}): Participant {
  return {
    matricule: '1204',
    matriculeAffiche: '01-1204',
    prenoms: 'Moustapha',
    nom: 'DIOP',
    nomComplet: 'Moustapha DIOP',
    sexe: 'M',
    dateNaissance: '1962-01-01',
    age: 64,
    lieuNaissance: 'DAKAR',
    situationFamiliale: 'MARIE',
    societe: { code: '01', libelle: 'SAR' },
    telephone: '77 123 45 67',
    email: 'moustapha.diop@example.sn',
    adresse: 'POINT E, DAKAR',
    etat: 'Actif',
    photo: null,
    ...surcharge,
  }
}

export function unBeneficiaire(surcharge: Partial<Beneficiaire> = {}): Beneficiaire {
  return {
    matricule: '1204',
    nomComplet: 'Moustapha DIOP',
    prenoms: 'Moustapha',
    nom: 'DIOP',
    sexe: 'M',
    age: 64,
    type: { code: '1', libelle: 'PARTICIPANT' },
    estParticipant: true,
    ...surcharge,
  }
}

export function unFournisseur(surcharge: Partial<Fournisseur> = {}): Fournisseur {
  return {
    code: 'PH001',
    libelle: 'PHARMACIE DU PLATEAU',
    adresse: 'Avenue Lamine Guèye, Dakar',
    telephone: '338210000',
    ...surcharge,
  }
}

export function uneSpecialite(surcharge: Partial<Specialite> = {}): Specialite {
  return { code: '01', libelle: 'MEDECINE GENERALE', nombre: 12, ...surcharge }
}

export function unBon(surcharge: Partial<Bon> = {}): Bon {
  return {
    id: 1,
    code: 'BPI000001',
    date: '2026-09-18',
    valableJusquAu: '2026-10-18',
    statut: 'valide',
    beneficiaire: {
      matricule: '1204',
      nomComplet: 'Moustapha DIOP',
      type: { code: '1', libelle: 'PARTICIPANT' },
    },
    pharmacie: unFournisseur(),
    specialite: { code: '01', libelle: 'MEDECINE GENERALE' },
    prescripteur: unFournisseur({ code: 'MG001', libelle: 'CABINET MEDICAL FANN' }),
    nbArticles: 3,
    dateOrdonnance: '2026-09-17',
    creeLe: '2026-09-18T11:21:04.000000Z',
    ...surcharge,
  }
}

export function unMoi(): MoiReponse {
  return {
    participant: unParticipant(),
    beneficiaires: [
      unBeneficiaire(),
      unBeneficiaire({
        matricule: '1204-01',
        nomComplet: 'Awa DIOP',
        prenoms: 'Awa',
        sexe: 'F',
        age: 58,
        type: { code: '2', libelle: 'CONJOINT' },
        estParticipant: false,
      }),
    ],
  }
}

/** Réponse fetch JSON pour les tests du client. */
export function reponseJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  })
}

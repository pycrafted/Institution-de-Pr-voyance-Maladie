/**
 * Formulaire « Nouvelle lettre de garantie » — le MÊME que celui de
 * l'application web (Documents → Lettres de Garantie → Nouveau), section par
 * section : Bénéficiaire, Prestataire, Prescripteur, Actes.
 *
 * Il a remplacé l'assistant en six étapes, comme le bon de pharmacie l'a été
 * avant lui : le même document ne se demande pas de deux façons selon qu'on
 * part du guichet ou du téléphone.
 *
 * Mêmes écarts assumés que le bon, et pour les mêmes raisons :
 *   - pas de section « Participant » : la société et le matricule sont ceux
 *     de l'employé identifié, les montrer n'apprend rien ;
 *   - pas de « Remboursement intégral » : c'est une décision de l'IPM ;
 *   - pas de catalogue d'actes : le mobile ne demande que leur nombre.
 *
 * Les champs obligatoires sont ceux de l'écran web, et eux seuls : le
 * bénéficiaire et son type.
 */

import { Choix, Section, type Option } from '../../components/ChampsFormulaire'
import type {
  Beneficiaire,
  CodeLibelle,
  DateISO,
  Fournisseur,
  NaturePrestation,
  Specialite,
} from '../../types/api'
import { nomPropre } from '../../utils/libelles'
import Alerte from '../NouveauBon/Alerte'
import type { Chargement } from '../NouveauBon/chargement'
import { ARTICLES_MAX, ARTICLES_MIN } from '../NouveauBon/assistant'
import { bornesDate, type ErreursSaisie, type Saisie } from './assistant'

export interface Props {
  beneficiaires: Beneficiaire[]
  familleEnCours: boolean
  specialites: Chargement<Specialite[]>
  prestataires: Chargement<Fournisseur[]>
  natures: Chargement<NaturePrestation[]>
  prescripteurs: Chargement<Fournisseur[]>
  saisie: Saisie
  erreurs: ErreursSaisie
  aujourdhui: DateISO
  fige: boolean
  onBeneficiaire: (beneficiaire: Beneficiaire | null) => void
  onSpecialitePrestataire: (specialite: Specialite | null) => void
  onPrestataire: (prestataire: Fournisseur | null) => void
  onNature: (nature: CodeLibelle | null) => void
  onSpecialite: (specialite: Specialite | null) => void
  onPrescripteur: (prescripteur: Fournisseur | null) => void
  onDate: (date: DateISO) => void
  onArticles: (nombre: number) => void
}

/**
 * Les natures telles que le serveur les a rangées pour la spécialité choisie :
 * celles que cette spécialité donne vraiment d'abord, les autres ensuite, sous
 * un titre qui dit pourquoi elles sont là. Sans spécialité, pas de groupes :
 * rien ne permet de mettre quoi que ce soit en avant.
 */
function naturesRangees(
  natures: NaturePrestation[] | null,
  specialite: Specialite | null,
): Option[] {
  const liste = natures ?? []
  const groupes = Boolean(specialite) && liste.some((n) => n.courante === false)
  return liste.map((nature) => ({
    valeur: nature.code,
    libelle: nomPropre(nature.libelle),
    groupe: groupes
      ? nature.courante
        ? nomPropre(specialite?.libelle ?? '')
        : 'Autres natures'
      : undefined,
  }))
}

/** Le lien de parenté, tel que l'écran web l'appelle : « Type ». */
function typeDe(beneficiaire: Beneficiaire): string {
  if (beneficiaire.estParticipant) return 'PARTICIPANT'
  return beneficiaire.type?.libelle ?? 'AUTRE'
}

export default function FormulaireLettre({
  beneficiaires,
  familleEnCours,
  specialites,
  prestataires,
  natures,
  prescripteurs,
  saisie,
  erreurs,
  aujourdhui,
  fige,
  onBeneficiaire,
  onSpecialitePrestataire,
  onPrestataire,
  onNature,
  onSpecialite,
  onPrescripteur,
  onDate,
  onArticles,
}: Props) {
  const { min, max } = bornesDate(aujourdhui)
  // Les types présents dans SA famille : en proposer d'autres n'aurait aucun
  // bénéficiaire derrière.
  const types = [...new Set(beneficiaires.map(typeDe))]
  const typeChoisi = saisie.beneficiaire ? typeDe(saisie.beneficiaire) : ''
  const duType = beneficiaires.filter((b) => typeDe(b) === typeChoisi)
  const options = (liste: { code: string; libelle: string }[] | null) =>
    (liste ?? []).map((e) => ({ valeur: e.code, libelle: nomPropre(e.libelle) }))

  return (
    <form className="ipm-formulaire" onSubmit={(e) => e.preventDefault()}>
      <Section titre="Bénéficiaire">
        {familleEnCours ? (
          <p className="ipm-formulaire__attente">Chargement de votre famille…</p>
        ) : (
          <>
            <Choix
              libelle="Type"
              requis
              valeur={typeChoisi}
              desactive={fige}
              onChanger={(valeur) => {
                // Changer de type vide le bénéficiaire : celui qui était
                // choisi n'est plus du type demandé.
                onBeneficiaire(beneficiaires.find((b) => typeDe(b) === valeur) ?? null)
              }}
              options={types.map((t) => ({ valeur: t, libelle: nomPropre(t) }))}
            />
            <Choix
              libelle="Bénéficiaire"
              requis
              valeur={saisie.beneficiaire?.matricule ?? ''}
              desactive={fige || !typeChoisi}
              onChanger={(matricule) =>
                onBeneficiaire(beneficiaires.find((b) => b.matricule === matricule) ?? null)
              }
              options={duType.map((b) => ({
                valeur: b.matricule,
                libelle: nomPropre(b.nomComplet),
              }))}
            />
          </>
        )}
        {erreurs.beneficiaire && <Alerte message={erreurs.beneficiaire} />}
      </Section>

      <Section titre="Prestataire">
        <Choix
          libelle="Spécialité"
          valeur={saisie.specialitePrestataire?.code ?? ''}
          desactive={fige}
          chargement={specialites.chargement}
          erreur={specialites.erreur}
          onReessayer={specialites.recharger}
          onChanger={(code) =>
            onSpecialitePrestataire(
              (specialites.donnees ?? []).find((s) => s.code === code) ?? null,
            )
          }
          options={options(specialites.donnees)}
        />
        <Choix
          libelle="Prestataire"
          valeur={saisie.prestataire?.code ?? ''}
          // Sans spécialité, il n'y a personne à proposer : c'est elle qui dit
          // parmi qui chercher, comme à l'écran web.
          desactive={fige || !saisie.specialitePrestataire}
          chargement={prestataires.chargement}
          erreur={prestataires.erreur}
          onReessayer={prestataires.recharger}
          onChanger={(code) =>
            onPrestataire((prestataires.donnees ?? []).find((p) => p.code === code) ?? null)
          }
          options={options(prestataires.donnees)}
        />
        <Choix
          libelle="Nature prestation"
          valeur={saisie.nature?.code ?? ''}
          desactive={fige}
          chargement={natures.chargement}
          erreur={natures.erreur}
          onReessayer={natures.recharger}
          onChanger={(code) =>
            onNature((natures.donnees ?? []).find((n) => n.code === code) ?? null)
          }
          options={naturesRangees(natures.donnees, saisie.specialitePrestataire)}
        />
        {(erreurs.specialitePrestataire || erreurs.prestataire || erreurs.naturePrestation) && (
          <Alerte
            message={
              erreurs.specialitePrestataire ?? erreurs.prestataire ?? erreurs.naturePrestation ?? ''
            }
          />
        )}
      </Section>

      <Section titre="Prescripteur">
        <Choix
          libelle="Spécialité du prescripteur"
          valeur={saisie.specialite?.code ?? ''}
          desactive={fige}
          chargement={specialites.chargement}
          erreur={specialites.erreur}
          onReessayer={specialites.recharger}
          onChanger={(code) =>
            onSpecialite((specialites.donnees ?? []).find((s) => s.code === code) ?? null)
          }
          options={options(specialites.donnees)}
        />
        <Choix
          libelle="Prescripteur"
          valeur={saisie.prescripteur?.code ?? ''}
          desactive={fige || !saisie.specialite}
          chargement={prescripteurs.chargement}
          erreur={prescripteurs.erreur}
          onReessayer={prescripteurs.recharger}
          onChanger={(code) =>
            onPrescripteur((prescripteurs.donnees ?? []).find((p) => p.code === code) ?? null)
          }
          options={options(prescripteurs.donnees)}
        />
        {(erreurs.specialite || erreurs.prescripteur) && (
          <Alerte message={erreurs.specialite ?? erreurs.prescripteur ?? ''} />
        )}
      </Section>

      <Section titre="Actes">
        <div className="ipm-formulaire__ligne">
          <label className="ipm-formulaire__champ">
            <span className="ipm-formulaire__libelle">Nb. Articles</span>
            <input
              type="number"
              inputMode="numeric"
              className="ipm-formulaire__saisie"
              min={ARTICLES_MIN}
              max={ARTICLES_MAX}
              value={saisie.nbArticles || ''}
              disabled={fige}
              onChange={(e) => onArticles(Number(e.target.value))}
            />
          </label>
          <label className="ipm-formulaire__champ">
            <span className="ipm-formulaire__libelle">Date prescription</span>
            <input
              type="date"
              className="ipm-formulaire__saisie"
              min={min}
              max={max}
              value={saisie.datePrescription}
              disabled={fige}
              onChange={(e) => onDate(e.target.value as DateISO)}
            />
          </label>
        </div>
        {erreurs.datePrescription && <Alerte message={erreurs.datePrescription} />}
      </Section>

      {erreurs.non_field_errors && <Alerte message={erreurs.non_field_errors} />}
    </form>
  )
}

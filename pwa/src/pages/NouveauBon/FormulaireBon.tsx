/**
 * Formulaire « Nouveau bon de pharmacie » — le MÊME que celui de
 * l'application web (Documents → Bons de Pharmacie → Nouveau), section par
 * section : Bénéficiaire, Pharmacie, Prescripteur, Ordonnance.
 *
 * Il a remplacé l'assistant en cinq étapes : un gestionnaire et un employé
 * remplissent désormais la même chose, dans le même ordre, avec les mêmes
 * champs obligatoires. Le même document ne se demande pas de deux façons
 * selon l'écran d'où on part.
 *
 * Deux écarts assumés avec l'écran web, et leur raison :
 *   - pas de section « Participant » : sur un téléphone, la société et le
 *     matricule sont ceux de l'employé identifié. Les montrer n'apprenait
 *     rien et repoussait la saisie d'un écran (demande de l'utilisateur).
 *   - pas de « Remboursement intégral » : c'est une décision de l'IPM, pas de
 *     l'employé, et le serveur mobile ne l'accepte pas.
 *
 * Les champs obligatoires sont ceux de l'écran web, et eux seuls (cf.
 * documents/serializers/commun.py, CHAMPS_REQUIS) : le bénéficiaire et son
 * type. La pharmacie, le prescripteur et l'ordonnance se renseignent plus
 * tard, quand l'employé revient avec.
 */

import { Choix, Section } from '../../components/ChampsFormulaire'
import type { Beneficiaire, DateISO, Fournisseur, Specialite } from '../../types/api'
import { nomPropre } from '../../utils/libelles'
import Alerte from './Alerte'
import {
  ARTICLES_MAX,
  ARTICLES_MIN,
  bornesDate,
  type ErreursSaisie,
  type Saisie,
} from './assistant'
import type { Chargement } from './chargement'

export interface Props {
  beneficiaires: Beneficiaire[]
  familleEnCours: boolean
  specialites: Chargement<Specialite[]>
  prescripteurs: Chargement<Fournisseur[]>
  pharmacies: Chargement<Fournisseur[]>
  saisie: Saisie
  erreurs: ErreursSaisie
  aujourdhui: DateISO
  fige: boolean
  onBeneficiaire: (beneficiaire: Beneficiaire | null) => void
  onSpecialite: (specialite: Specialite | null) => void
  onPrescripteur: (prescripteur: Fournisseur | null) => void
  onPharmacie: (pharmacie: Fournisseur | null) => void
  onDate: (date: DateISO) => void
  onArticles: (nombre: number) => void
}

/** Le lien de parenté, tel que l'écran web l'appelle : « Type ». */
function typeDe(beneficiaire: Beneficiaire): string {
  if (beneficiaire.estParticipant) return 'PARTICIPANT'
  return beneficiaire.type?.libelle ?? 'AUTRE'
}

export default function FormulaireBon({
  beneficiaires,
  familleEnCours,
  specialites,
  prescripteurs,
  pharmacies,
  saisie,
  erreurs,
  aujourdhui,
  fige,
  onBeneficiaire,
  onSpecialite,
  onPrescripteur,
  onPharmacie,
  onDate,
  onArticles,
}: Props) {
  const { min, max } = bornesDate(aujourdhui)
  // Les types présents dans SA famille, dans l'ordre où ils arrivent : en
  // proposer d'autres n'aurait aucun bénéficiaire derrière.
  const types = [...new Set(beneficiaires.map(typeDe))]
  const typeChoisi = saisie.beneficiaire ? typeDe(saisie.beneficiaire) : ''
  const duType = beneficiaires.filter((b) => typeDe(b) === typeChoisi)

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
                const premier = beneficiaires.find((b) => typeDe(b) === valeur)
                onBeneficiaire(premier ?? null)
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

      <Section titre="Pharmacie">
        <Choix
          libelle="Pharmacie"
          valeur={saisie.pharmacie?.code ?? ''}
          desactive={fige}
          chargement={pharmacies.chargement}
          erreur={pharmacies.erreur}
          onReessayer={pharmacies.recharger}
          onChanger={(code) =>
            onPharmacie((pharmacies.donnees ?? []).find((p) => p.code === code) ?? null)
          }
          options={(pharmacies.donnees ?? []).map((p) => ({
            valeur: p.code,
            libelle: nomPropre(p.libelle),
          }))}
        />
        {erreurs.pharmacie && <Alerte message={erreurs.pharmacie} />}
      </Section>

      <Section titre="Prescripteur">
        <Choix
          libelle="Spécialité"
          valeur={saisie.specialite?.code ?? ''}
          desactive={fige}
          chargement={specialites.chargement}
          erreur={specialites.erreur}
          onReessayer={specialites.recharger}
          onChanger={(code) =>
            onSpecialite((specialites.donnees ?? []).find((s) => s.code === code) ?? null)
          }
          options={(specialites.donnees ?? []).map((s) => ({
            valeur: s.code,
            libelle: nomPropre(s.libelle),
          }))}
        />
        <Choix
          libelle="Prescripteur"
          valeur={saisie.prescripteur?.code ?? ''}
          // Sans spécialité, il n'y a personne à proposer : c'est elle qui dit
          // parmi qui chercher, comme à l'écran web.
          desactive={fige || !saisie.specialite}
          chargement={prescripteurs.chargement}
          erreur={prescripteurs.erreur}
          onReessayer={prescripteurs.recharger}
          onChanger={(code) =>
            onPrescripteur((prescripteurs.donnees ?? []).find((p) => p.code === code) ?? null)
          }
          options={(prescripteurs.donnees ?? []).map((p) => ({
            valeur: p.code,
            libelle: nomPropre(p.libelle),
          }))}
        />
        {(erreurs.specialite || erreurs.prescripteur) && (
          <Alerte message={erreurs.specialite ?? erreurs.prescripteur ?? ''} />
        )}
      </Section>

      <Section titre="Ordonnance">
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
            <span className="ipm-formulaire__libelle">Date Ordonnance</span>
            <input
              type="date"
              className="ipm-formulaire__saisie"
              min={min}
              max={max}
              value={saisie.dateOrdonnance}
              disabled={fige}
              onChange={(e) => onDate(e.target.value as DateISO)}
            />
          </label>
        </div>
        {(erreurs.dateOrdonnance || erreurs.nbArticles) && (
          <Alerte message={erreurs.dateOrdonnance ?? erreurs.nbArticles ?? ''} />
        )}
      </Section>

      {erreurs.non_field_errors && <Alerte message={erreurs.non_field_errors} />}
    </form>
  )
}

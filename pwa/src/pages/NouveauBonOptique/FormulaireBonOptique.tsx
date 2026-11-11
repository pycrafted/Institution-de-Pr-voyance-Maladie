/**
 * Formulaire « Nouveau bon d'optique » — le MÊME que celui de l'application
 * web (Documents → Bons Optique → Nouveau), section par section :
 * Bénéficiaire, Prescripteur, Fournisseur (l'opticien et la date de la
 * prescription), Articles.
 *
 * Mêmes écarts assumés que le bon de pharmacie et la lettre, et pour les
 * mêmes raisons :
 *   - pas de section « Participant » : la société et le matricule sont ceux
 *     de l'employé identifié, les montrer n'apprend rien ;
 *   - pas de « Remboursement intégral » ni de tarif : ce sont des décisions
 *     de l'IPM, posées au traitement ;
 *   - les articles se COCHENT dans la nomenclature (montures, verres…), sans
 *     quantité ni prix : l'opticien et l'IPM les complètent.
 *
 * Les champs obligatoires sont ceux de l'écran web, et eux seuls : le
 * bénéficiaire et son type.
 */

import { Choix, Section } from '../../components/ChampsFormulaire'
import type { Beneficiaire, CodeLibelle, DateISO, Fournisseur, Specialite } from '../../types/api'
import { nomPropre } from '../../utils/libelles'
import Alerte from '../NouveauBon/Alerte'
import type { Chargement } from '../NouveauBon/chargement'
import { bornesDate, type ErreursSaisie, type Saisie } from './assistant'

export interface Props {
  beneficiaires: Beneficiaire[]
  familleEnCours: boolean
  specialites: Chargement<Specialite[]>
  prescripteurs: Chargement<Fournisseur[]>
  opticiens: Chargement<Fournisseur[]>
  articles: Chargement<CodeLibelle[]>
  saisie: Saisie
  erreurs: ErreursSaisie
  aujourdhui: DateISO
  fige: boolean
  onBeneficiaire: (beneficiaire: Beneficiaire | null) => void
  onSpecialite: (specialite: Specialite | null) => void
  onPrescripteur: (prescripteur: Fournisseur | null) => void
  onOpticien: (opticien: Fournisseur | null) => void
  onArticle: (article: CodeLibelle) => void
  onDate: (date: DateISO) => void
  /** Le bénéficiaire a déjà eu un bon d'optique il y a moins de deux ans. */
  avertissement?: string | null
}

/** Le lien de parenté, tel que l'écran web l'appelle : « Type ». */
function typeDe(beneficiaire: Beneficiaire): string {
  if (beneficiaire.estParticipant) return 'PARTICIPANT'
  return beneficiaire.type?.libelle ?? 'AUTRE'
}

export default function FormulaireBonOptique({
  beneficiaires,
  familleEnCours,
  specialites,
  prescripteurs,
  opticiens,
  articles,
  saisie,
  erreurs,
  aujourdhui,
  fige,
  onBeneficiaire,
  onSpecialite,
  onPrescripteur,
  onOpticien,
  onArticle,
  onDate,
  avertissement,
}: Props) {
  const { min, max } = bornesDate(aujourdhui)
  // Les types présents dans SA famille : en proposer d'autres n'aurait aucun
  // bénéficiaire derrière.
  const types = [...new Set(beneficiaires.map(typeDe))]
  const typeChoisi = saisie.beneficiaire ? typeDe(saisie.beneficiaire) : ''
  const duType = beneficiaires.filter((b) => typeDe(b) === typeChoisi)
  const options = (liste: { code: string; libelle: string }[] | null) =>
    (liste ?? []).map((e) => ({ valeur: e.code, libelle: nomPropre(e.libelle) }))
  const coche = (article: CodeLibelle) => saisie.articles.some((a) => a.code === article.code)

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
        {avertissement && (
          <p className="nouveau-bon__info ipm-carte" role="note">
            {avertissement}
          </p>
        )}
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
          options={options(specialites.donnees)}
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
          options={options(prescripteurs.donnees)}
        />
        {(erreurs.specialite || erreurs.prescripteur) && (
          <Alerte message={erreurs.specialite ?? erreurs.prescripteur ?? ''} />
        )}
      </Section>

      <Section titre="Fournisseur">
        {/* L'opticien : la spécialité est entendue (optique), pas de menu pour elle. */}
        <Choix
          libelle="Prestataire"
          valeur={saisie.opticien?.code ?? ''}
          desactive={fige}
          chargement={opticiens.chargement}
          erreur={opticiens.erreur}
          onReessayer={opticiens.recharger}
          onChanger={(code) =>
            onOpticien((opticiens.donnees ?? []).find((o) => o.code === code) ?? null)
          }
          options={options(opticiens.donnees)}
        />
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
        {(erreurs.opticien || erreurs.datePrescription) && (
          <Alerte message={erreurs.opticien ?? erreurs.datePrescription ?? ''} />
        )}
      </Section>

      <Section titre="Articles">
        {/* « Saisir les actes » de l'écran web : ici, les articles de la
            nomenclature optique se cochent. */}
        {articles.chargement ? (
          <p className="ipm-formulaire__attente">Chargement des articles…</p>
        ) : articles.erreur ? (
          <p className="ipm-formulaire__erreur">
            {articles.erreur}{' '}
            <button
              type="button"
              className="ipm-formulaire__reessayer"
              onClick={articles.recharger}
            >
              Réessayer
            </button>
          </p>
        ) : (
          <div className="ipm-formulaire__cases" role="group" aria-label="Articles">
            {(articles.donnees ?? []).map((article) => (
              <label key={article.code} className="ipm-formulaire__case ipm-appui">
                <input
                  type="checkbox"
                  className="ipm-formulaire__coche"
                  checked={coche(article)}
                  disabled={fige}
                  onChange={() => onArticle(article)}
                />
                <span>{nomPropre(article.libelle)}</span>
              </label>
            ))}
          </div>
        )}
        {erreurs.articles && <Alerte message={erreurs.articles} />}
      </Section>

      {erreurs.non_field_errors && <Alerte message={erreurs.non_field_errors} />}
    </form>
  )
}

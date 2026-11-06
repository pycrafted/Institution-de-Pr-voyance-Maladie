/**
 * Page « Traitements → Bons d'Achats » (captures 79-80).
 *
 * Les achats de l'IPM pour son propre fonctionnement : papier, cartouches,
 * imprimés. Attention au mot « bon », qui désigne deux choses sans rapport
 * dans cette application - un bon de pharmacie ou optique engage l'IPM envers
 * un prestataire de santé pour un bénéficiaire ; un **bon d'achat** est un bon
 * de commande ordinaire, l'IPM dans son rôle d'entreprise qui s'approvisionne.
 *
 * Le même objet porte trois noms selon l'endroit où on le regarde, et on les
 * reprend tels quels : « Bon de Commande Achats » au fil d'Ariane, « Bons
 * d'Achats (Fournisseurs Divers) » en titre, « BON DE COMMANDE » à
 * l'impression.
 *
 * La liste est tenue par <Referentiel />, la saisie par <BonAchatModal /> (un
 * bon porte des lignes : le formulaire générique ne sait pas faire). Le bouton
 * « Ajout Article » reprend le raccourci de l'origine vers le catalogue.
 *
 * La feuille de styles de « Données de base » est importée ici parce que les
 * vues sont chargées à la demande.
 */

import React, { useMemo, useState } from 'react'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilActionUndo, cilBan, cilLibraryAdd, cilPrint } from '@coreui/icons'

import { basculerActivation } from '../../services/referentiels'
import { ouvrirPdf } from '../documents/commun'
import Referentiel, { PastillesStats } from '../donnees-de-base/Referentiel'
import '../donnees-de-base/donnees-de-base.scss'
import '../participants/participants.scss'
import './traitements.scss'
import ArticleAchatModal from './ArticleAchatModal'
import BonAchatModal from './BonAchatModal'
import { BONS_ACHATS } from './config'

const BonsAchats = () => {
  const [stats, setStats] = useState(null)
  const [articleOuvert, setArticleOuvert] = useState(false)

  const referentiel = useMemo(
    () => ({
      ...BONS_ACHATS,
      // Un bon porte des lignes : sa saisie a son propre écran.
      editeur: BonAchatModal,
      actionsLigne: [
        {
          cle: 'pdf',
          libelle: 'Imprimer le bon de commande',
          icone: cilPrint,
          executer: (bon) =>
            ouvrirPdf(`/bons-achats/${bon.id}/pdf/`, bon.code, `Bon de commande ${bon.code}`),
        },
        {
          // Le statut est en colonne, donc <Referentiel /> ne pose pas son
          // bouton « Désactiver » : l'annulation se dit ici. Un bon ne se
          // supprime pas - l'origine avait une corbeille, et six bons effacés
          // sur treize expliquent les trous de sa numérotation.
          cle: 'annuler',
          libelle: 'Annuler le bon',
          icone: cilBan,
          classe: 'ddb-action-danger',
          visible: (bon) => bon.actif,
          confirmer: (bon) =>
            `Annuler le bon ${bon.code} ? Il reste dans la liste, marqué « Annulé ».`,
          danger: true,
          executer: async (bon) => {
            await basculerActivation('bons-achats', bon.id)
            return `Bon ${bon.code} annulé`
          },
        },
        {
          cle: 'retablir',
          libelle: 'Rétablir le bon',
          icone: cilActionUndo,
          visible: (bon) => !bon.actif,
          executer: async (bon) => {
            await basculerActivation('bons-achats', bon.id)
            return `Bon ${bon.code} rétabli`
          },
        },
      ],
    }),
    [],
  )

  return (
    <CCard className="ddb-carte">
      <CCardBody className="p-0">
        <div className="prt-entete">
          <div className="prt-titre-ligne">
            <div className="prt-titre-groupe">
              <h1 className="prt-titre">
                Bons d&apos;Achats <span className="ba-sous-titre">(Fournisseurs Divers)</span>
              </h1>
              <PastillesStats segments={stats?.segments} />
            </div>
            {/* Raccourci de l'origine : créer l'article qui manque sans
                quitter la commande en cours. */}
            <button
              type="button"
              className="ddb-outil trt-bouton-edition"
              onClick={() => setArticleOuvert(true)}
            >
              <CIcon icon={cilLibraryAdd} className="ddb-outil-icone" />
              Ajout Article
            </button>
          </div>
        </div>

        <section className="ddb-contenu">
          <Referentiel referentiel={referentiel} onStats={setStats} />
        </section>
      </CCardBody>

      {/* L'article créé rejoint le catalogue en mémoire : le prochain bon le
          proposera sans qu'on recharge quoi que ce soit. */}
      <ArticleAchatModal visible={articleOuvert} onFermer={() => setArticleOuvert(false)} />
    </CCard>
  )
}

export default BonsAchats

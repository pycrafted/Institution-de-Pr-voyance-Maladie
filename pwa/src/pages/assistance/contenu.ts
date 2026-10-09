/**
 * Le texte de l'écran « Assistance » (SPEC_DESIGN §5), déclaré à part de sa
 * mise en page : les trois étapes du bon de pharmacie et les questions
 * fréquentes. Ajouter une question = ajouter une entrée ici.
 *
 * Règle absolue : aucune coordonnée inventée (ni numéro, ni adresse, ni
 * courriel). Quand une réponse dépasse ce que l'application sait faire, elle
 * renvoie à l'IPM, sans prétendre savoir comment la joindre.
 *
 * Les règles citées sont celles que le serveur applique réellement
 * (SPEC §2 : validité de 30 jours, 1 à 8 articles, ordonnance ni future ni
 * vieille de plus de 30 jours) : l'aide ne doit jamais promettre autre chose
 * que ce que l'assistant accepte.
 */

import { documentTextOutline, medkitOutline, peopleOutline } from 'ionicons/icons'

/** Validité d'un bon, en jours : la même valeur que le serveur (SPEC §2). */
export const VALIDITE_JOURS = 30

/** Nombre maximal d'articles sur un bon : le bon imprimé a huit lignes. */
export const ARTICLES_MAX = 8

/** Une étape du mode d'emploi, illustrée par son icône. */
export interface Etape {
  /** Clé stable : clé React et identifiant de test. */
  cle: string
  titre: string
  texte: string
  /** Icône ionicons (la chaîne importée, pas son nom). */
  icone: string
}

/** Comment on obtient un bon de pharmacie, en trois gestes et pas un de plus. */
export const ETAPES: readonly Etape[] = [
  {
    cle: 'beneficiaire',
    titre: 'Choisir le bénéficiaire',
    texte:
      'Vous-même ou l’un de vos ayants droit déclarés à l’IPM : l’assistant les propose tous, avec leur lien de parenté.',
    icone: peopleOutline,
  },
  {
    cle: 'generer',
    titre: 'Générer le bon',
    texte:
      'Indiquez le prescripteur, la pharmacie, la date de l’ordonnance et le nombre d’articles. Le bon officiel est créé et numéroté aussitôt.',
    icone: documentTextOutline,
  },
  {
    cle: 'presenter',
    titre: 'Présenter en pharmacie',
    texte:
      'Montrez le bon sur votre téléphone, avec votre ordonnance. La pharmacie conventionnée y lit le même document que celui imprimé par l’IPM.',
    icone: medkitOutline,
  },
]

/** Une question fréquente et sa réponse (accordéon, §5 : sans aucun filet). */
export interface Question {
  cle: string
  question: string
  reponse: string
}

export const QUESTIONS: readonly Question[] = [
  {
    cle: 'beneficiaires',
    question: 'Pour qui puis-je demander un bon ?',
    reponse:
      'Pour vous-même et pour vos ayants droit déclarés à l’IPM et encore actifs. S’il manque quelqu’un dans la liste, c’est à l’IPM de mettre votre dossier à jour.',
  },
  {
    cle: 'validite',
    question: 'Combien de temps un bon reste-t-il valable ?',
    reponse: `${VALIDITE_JOURS} jours à compter de sa date d’émission. Passé ce délai, il passe en « Expiré » et il suffit d’en demander un nouveau.`,
  },
  {
    cle: 'ordonnance',
    question: 'Puis-je demander un bon sans ordonnance ?',
    reponse: `Non. La date de l’ordonnance est demandée à la dernière étape : elle ne peut être ni dans le futur, ni vieille de plus de ${VALIDITE_JOURS} jours. La pharmacie réclame l’ordonnance en même temps que le bon.`,
  },
  {
    cle: 'articles',
    question: 'Combien d’articles un bon peut-il porter ?',
    reponse: `De 1 à ${ARTICLES_MAX} : le bon officiel comporte ${ARTICLES_MAX} lignes. Au-delà, demandez un second bon.`,
  },
  {
    cle: 'impression',
    question: 'Dois-je imprimer le bon ?',
    reponse:
      'Non, l’écran suffit. Depuis le détail du bon, vous pouvez tout de même le partager ou l’imprimer si la pharmacie le demande.',
  },
  {
    cle: 'hors-ligne',
    question: 'Et si je n’ai pas de réseau ?',
    reponse:
      'Les bons déjà consultés, et leur document, restent affichables hors ligne. Demander un NOUVEAU bon exige en revanche une connexion : c’est l’IPM qui le numérote.',
  },
  {
    cle: 'annulation',
    question: 'Puis-je annuler un bon ?',
    reponse:
      'Seule l’IPM peut annuler un bon. Un bon annulé reste visible dans « Mes bons », marqué « Annulé » ; un bon inutilisé expire de lui-même.',
  },
  {
    cle: 'pharmacie-absente',
    question: 'Ma pharmacie n’est pas dans la liste ?',
    reponse:
      'Alors elle n’est pas conventionnée avec votre IPM, et le bon n’y sera pas accepté. L’écran « Pharmacies » donne l’annuaire complet, tenu à jour par l’IPM.',
  },
]

/** Ce que l'écran renvoie à l'IPM, sans inventer la moindre coordonnée. */
export const RENVOI_IPM = {
  titre: 'Une autre question ?',
  texte:
    'Le bureau IPM de la SAR est seul à pouvoir agir sur votre dossier, vos ayants droit et vos bons. Cette application n’en est que le prolongement.',
}

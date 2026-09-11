/**
 * Plan comptable de l'institution.
 *
 * Sert de source aux champs « Compte » : l'utilisateur choisit dans la liste
 * plutôt que de saisir six chiffres de mémoire. La liste affiche
 * « 571000 - CAISSE LOCALE » mais c'est le numéro seul qui est enregistré,
 * conformément à ce qu'affichent les tableaux.
 *
 * Ce plan a vocation à devenir un référentiel à part entière, alimenté par la
 * comptabilité. En attendant, il est déclaré ici.
 */

export const PLAN_COMPTABLE = [
  // Classe 1 — Capitaux
  ['101000', 'CAPITAL SOCIAL'],
  ['120001', 'REPORT A NOUVEAU IPM'],
  ['120002', 'REPORT A NOUVEAU CMMC'],
  ['120003', 'REPORT A NOUVEAU CMMC R'],
  ['120004', 'REPORT A NOUVEAU MSRNC SAR'],
  ['121000', 'REPORT A NOUVEAU CREDITEUR'],
  ['129000', 'REPORT A NOUVEAU DEBITEUR'],

  // Classe 4 — Tiers
  ['401000', 'FOURNISSEURS'],
  ['422100', 'RETENUES SUR SALAIRES'],
  ['422200', 'RETENUES SUR PRESTATIONS'],
  ['431100', 'COTISATIONS IPM'],
  ['431200', 'COTISATIONS CMMC'],
  ['431300', 'COTISATIONS CSM'],
  ['471000', 'OPERATIONS DIVERSES'],
  ['471200', 'COMPTE D’ATTENTE DE CLOTURE'],

  // Classe 5 — Trésorerie
  ['521100', 'CREDIT DU SENEGAL IPM'],
  ['521200', 'CREDIT DU SENEGAL CMMC'],
  ['521300', 'CREDIT DU SENEGAL CSM'],
  ['521400', 'ECOBANK IPM'],
  ['521500', 'ECOBANK CMMC'],
  ['521600', 'CREDIT DU SENEGAL CMMCR-SAR'],
  ['521610', 'ECOBANK MSRNC'],
  ['521620', 'BICIS IPM'],
  ['521630', 'SGBS IPM'],
  ['521700', 'ECOBANK IPM FONCTIONNEMENT'],
  ['521800', 'ECOBANK CMMC FONCTIONNEMENT'],
  ['521900', 'ECOBANK CSM'],
  ['571000', 'CAISSE LOCALE'],
  ['571100', 'CAISSE SIEGE'],
  ['571200', 'CAISSE ANTENNE NORD'],
  ['585100', 'VIREMENTS INTERNES CAISSES'],
  ['585200', 'VIREMENTS INTERNES BANQUES'],

  // Classe 6 — Charges
  ['602000', 'PRESTATIONS'],
  ['602100', 'REMBOURSEMENTS'],
  ['602200', 'SINISTRES'],
].map(([valeur, libelle]) => ({ valeur, libelle }))

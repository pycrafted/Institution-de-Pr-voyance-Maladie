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
  // Comptes réels de l'application d'origine (table `plancompta` / journaux).
  // Classe 1 - Capitaux (reports à nouveau, un par régime)
  ['101000', 'CAPITAL SOCIAL'],
  ['120001', 'REPORT A NOUVEAU IPM'],
  ['120002', 'REPORT A NOUVEAU CMMC'],
  ['120003', 'REPORT A NOUVEAU CMMC R'],
  ['120004', 'REPORT A NOUVEAU MSRNC SAR'],
  ['121000', 'REPORT A NOUVEAU CREDITEUR'],
  ['129000', 'REPORT A NOUVEAU DEBITEUR'],

  // Classe 4 - Tiers
  ['401000', 'FOURNISSEURS'],

  // Classe 5 - Trésorerie (banques B1..B10, caisse, Orange Money)
  ['521100', 'CREDIT DU SENEGAL IPM'],
  ['521200', 'CREDIT DU SENEGAL CMMC'],
  ['521300', 'CREDIT DU SENEGAL CSM'],
  ['521400', 'ECOBANK IPM'],
  ['521500', 'ECOBANK CMMC'],
  ['521600', 'CREDIT DU SENEGAL CMMCR-SAR'],
  ['521610', 'ECOBANK MSRNC'],
  ['521700', 'ECOBANK IPM FONCTIONNEMENT'],
  ['521800', 'ECOBANK CMMC FONCTIONNEMENT'],
  ['521900', 'ECOBANK CSM'],
  ['571000', 'CAISSE LOCALE'],
  ['571200', 'ORANGE MONEY'],

  // Classe 7 - Produits (cotisations, salariales et patronales par régime)
  ['701500', 'COTISATION SALARIALE IPM'],
  ['701510', 'COTISATION SALARIALE CSM'],
  ['701530', 'COTISATION SALARIALE CMMC'],
  ['701651', 'COTISATION CMMCR'],
  ['701662', 'COTISATION MSRNC-SAR'],
  ['701900', 'COTISATION PATRONALE IPM'],
  ['701910', 'COTISATION PATRONALE CSM'],
  ['701920', 'COTISATION PATRONALE CSM'],
  ['701930', 'COTISATION PATRONALE CMMC'],
].map(([valeur, libelle]) => ({ valeur, libelle }))

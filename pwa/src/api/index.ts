// Point d'entrée du client API : les écrans importent depuis « ../api ».
export { apiBase, configurerClient, construireUrl, DELAI_MS, requete } from './client'
export type { OptionsRequete } from './client'
export { chargerConfig, CONFIG_PAR_DEFAUT, normaliserConfig } from './config'
export type { ConfigApp } from './config'
export { ErreurApi, estErreurApi, messageErreur, MESSAGES } from './erreurs'
export type { GenreErreur } from './erreurs'
export * from './mobile'

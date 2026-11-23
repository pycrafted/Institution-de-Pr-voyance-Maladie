/**
 * Empreinte digitale / Face ID : les clés d'accès (« passkeys », WebAuthn)
 * du navigateur, et ce que l'appareil en sait.
 *
 * Le serveur envoie ses options en JSON (binaires en base64url) ; le
 * navigateur attend des ArrayBuffer, et rend une réponse qu'il faut remettre
 * en JSON. Les fonctions natives (`parseCreationOptionsFromJSON`, `toJSON`)
 * sont utilisées quand le navigateur les a, sinon la conversion est faite ici.
 *
 * Sur cet appareil, on retient seulement QUELLE clé il porte (son numéro
 * côté serveur), pour savoir s'il faut proposer le bouton « Empreinte » à la
 * connexion et l'option dans le profil. La clé elle-même reste dans le
 * téléphone : ni l'application ni le serveur ne la voient jamais.
 */

const CLE_LOCALE = 'ipm.cle-acces.v1'
const CLE_PROPOSEE = 'ipm.cle-acces.proposee.v1'

export interface CleDeLAppareil {
  /** Numéro de la clé côté serveur (pour la retirer). */
  id: number
  /** Le matricule affiché du titulaire, pour le dire à l'écran. */
  matricule: string
}

/** Le téléphone sait-il signer avec l'empreinte ou le visage ? */
export async function empreinteDisponible(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext) return false
    if (!('PublicKeyCredential' in window)) return false
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function cleDeLAppareil(): CleDeLAppareil | null {
  try {
    const lu = JSON.parse(
      window.localStorage.getItem(CLE_LOCALE) ?? 'null',
    ) as CleDeLAppareil | null
    return lu && typeof lu.id === 'number' ? lu : null
  } catch {
    return null
  }
}

export function retenirCle(cle: CleDeLAppareil | null): void {
  try {
    if (cle) window.localStorage.setItem(CLE_LOCALE, JSON.stringify(cle))
    else window.localStorage.removeItem(CLE_LOCALE)
  } catch {
    // Stockage indisponible : le bouton ne sera simplement pas proposé.
  }
}

/** La proposition d'activer l'empreinte a-t-elle déjà été faite sur cet appareil ? */
export function propositionDejaFaite(): boolean {
  try {
    return window.localStorage.getItem(CLE_PROPOSEE) === '1'
  } catch {
    return true
  }
}

export function noterProposition(): void {
  try {
    window.localStorage.setItem(CLE_PROPOSEE, '1')
  } catch {
    // Rien : on reproposera, sans gravité.
  }
}

// --- Conversions base64url <-> ArrayBuffer -----------------------------------

function versOctets(texte: string): ArrayBuffer {
  const base64 = texte.replace(/-/g, '+').replace(/_/g, '/')
  const complet = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const brut = atob(complet)
  const octets = new Uint8Array(brut.length)
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i)
  return octets.buffer
}

function versTexte(tampon: ArrayBuffer | null | undefined): string | undefined {
  if (!tampon) return undefined
  const octets = new Uint8Array(tampon)
  let brut = ''
  for (const o of octets) brut += String.fromCharCode(o)
  return btoa(brut).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type Descripteur = { id: string; type: string; transports?: string[] }

function descripteurs(liste: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(liste)) return undefined
  return (liste as Descripteur[]).map((d) => ({
    type: 'public-key',
    id: versOctets(d.id),
    transports: d.transports as AuthenticatorTransport[] | undefined,
  }))
}

type AvecJSON = {
  parseCreationOptionsFromJSON?: (o: unknown) => PublicKeyCredentialCreationOptions
  parseRequestOptionsFromJSON?: (o: unknown) => PublicKeyCredentialRequestOptions
}

function optionsCreation(json: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const natif = (window.PublicKeyCredential as unknown as AvecJSON).parseCreationOptionsFromJSON
  if (natif) return natif(json)
  const user = json.user as { id: string; name: string; displayName: string }
  return {
    ...(json as unknown as PublicKeyCredentialCreationOptions),
    challenge: versOctets(json.challenge as string),
    user: { ...user, id: versOctets(user.id) },
    excludeCredentials: descripteurs(json.excludeCredentials),
  }
}

function optionsDemande(json: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const natif = (window.PublicKeyCredential as unknown as AvecJSON).parseRequestOptionsFromJSON
  if (natif) return natif(json)
  return {
    ...(json as unknown as PublicKeyCredentialRequestOptions),
    challenge: versOctets(json.challenge as string),
    allowCredentials: descripteurs(json.allowCredentials),
  }
}

/** La réponse de l'appareil, en JSON pour le serveur. */
function enJSON(cle: PublicKeyCredential): Record<string, unknown> {
  const avecToJSON = cle as PublicKeyCredential & { toJSON?: () => Record<string, unknown> }
  if (typeof avecToJSON.toJSON === 'function') return avecToJSON.toJSON()
  const r = cle.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse
  const reponse: Record<string, unknown> = { clientDataJSON: versTexte(r.clientDataJSON) }
  if ('attestationObject' in r && r.attestationObject) {
    reponse.attestationObject = versTexte(r.attestationObject)
    reponse.transports = typeof r.getTransports === 'function' ? r.getTransports() : []
  }
  if ('authenticatorData' in r && r.authenticatorData) {
    reponse.authenticatorData = versTexte(r.authenticatorData)
    reponse.signature = versTexte(r.signature)
    reponse.userHandle = versTexte(r.userHandle)
  }
  return {
    id: cle.id,
    rawId: versTexte(cle.rawId),
    type: cle.type,
    response: reponse,
    clientExtensionResults: cle.getClientExtensionResults(),
    authenticatorAttachment: cle.authenticatorAttachment ?? undefined,
  }
}

/** L'employé a refermé la fenêtre de l'empreinte : pas une erreur à afficher. */
export function estAbandon(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')
}

/** Crée la clé de cet appareil (poser le doigt / regarder l'écran). */
export async function creerCle(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cle = (await navigator.credentials.create({
    publicKey: optionsCreation(options),
  })) as PublicKeyCredential | null
  if (!cle) throw new DOMException('Aucune clé créée.', 'NotAllowedError')
  return enJSON(cle)
}

/** Signe le défi du serveur avec la clé de cet appareil. */
export async function utiliserCle(
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cle = (await navigator.credentials.get({
    publicKey: optionsDemande(options),
  })) as PublicKeyCredential | null
  if (!cle) throw new DOMException('Aucune clé choisie.', 'NotAllowedError')
  return enJSON(cle)
}

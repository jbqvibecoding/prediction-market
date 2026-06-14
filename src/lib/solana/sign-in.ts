import { buildSignInMessage } from './auth'

/**
 * Client-side Sign-In With Solana (SIWS) orchestration, written as a pure,
 * dependency-injected function so it can be unit tested end-to-end against a
 * real keypair and reused regardless of how the server exposes nonce/verify.
 *
 *   1. fetch a server nonce for the address
 *   2. build the canonical SIWS message
 *   3. sign the UTF-8 message bytes with the wallet
 *   4. submit { message, base64 signature, address } to the verifier
 */
export interface SiwsHandshakeDeps {
  /** base58 wallet public key */
  address: string
  /** site domain, e.g. window.location.host */
  domain: string
  uri?: string
  statement?: string
  /** fetches a single-use nonce bound to the address */
  getNonce: (address: string) => Promise<string>
  /** wallet adapter signMessage */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  /** submits the signed message; resolves true on a valid sign-in */
  verify: (args: {
    message: string
    signature: string
    address: string
  }) => Promise<boolean>
  /** injectable clock for deterministic tests */
  now?: () => Date
}

export async function runSiwsHandshake(deps: SiwsHandshakeDeps): Promise<boolean> {
  const nonce = await deps.getNonce(deps.address)

  const message = buildSignInMessage({
    domain: deps.domain,
    address: deps.address,
    statement: deps.statement,
    nonce,
    uri: deps.uri,
    issuedAt: (deps.now?.() ?? new Date()).toISOString(),
  })

  const signatureBytes = await deps.signMessage(
    Uint8Array.from(new TextEncoder().encode(message)),
  )
  const signature = Buffer.from(signatureBytes).toString('base64')

  return deps.verify({ message, signature, address: deps.address })
}

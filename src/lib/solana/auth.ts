import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'

/**
 * Sign-In With Solana (SIWS) — the replacement for Kuest's Sign-In With
 * Ethereum (SIWE / @reown/appkit-siwe) auth.
 *
 * A wallet proves ownership of a base58 ed25519 public key by signing a
 * human-readable message. The server verifies the detached ed25519 signature
 * against the public key. Signatures are base64 (the same convention as
 * `signOrder`), so no base58 codec is needed for the signature itself.
 */
export interface SignInMessageParams {
  /** site domain requesting sign-in, e.g. "kuest.com" */
  domain: string
  /** base58 wallet public key */
  address: string
  statement?: string
  nonce: string
  /** ISO-8601; defaults to now */
  issuedAt?: string
  uri?: string
  version?: string
}

/** Build the canonical SIWS message a wallet signs (EIP-4361-flavoured). */
export function buildSignInMessage(params: SignInMessageParams): string {
  const issuedAt = params.issuedAt ?? new Date().toISOString()
  const lines = [
    `${params.domain} wants you to sign in with your Solana account:`,
    params.address,
    '',
  ]
  if (params.statement) lines.push(params.statement, '')
  if (params.uri) lines.push(`URI: ${params.uri}`)
  lines.push(`Version: ${params.version ?? '1'}`)
  lines.push(`Nonce: ${params.nonce}`)
  lines.push(`Issued At: ${issuedAt}`)
  return lines.join('\n')
}

export interface VerifySignInParams {
  /** the exact message string that was signed */
  message: string
  /** base64-encoded ed25519 signature */
  signature: string
  /** base58 wallet public key the signature must match */
  address: string
}

/** Verify a SIWS signature. Returns false on any malformed input. */
export function verifySignInSignature({
  message,
  signature,
  address,
}: VerifySignInParams): boolean {
  // Uint8Array.from copies into the current realm's Uint8Array so tweetnacl's
  // `instanceof` checks hold even when inputs originate as Node Buffers.
  let publicKey: Uint8Array
  try {
    publicKey = Uint8Array.from(new PublicKey(address).toBytes())
  } catch {
    return false
  }

  let sig: Uint8Array
  try {
    sig = Uint8Array.from(Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
  if (sig.length !== nacl.sign.signatureLength) return false

  const messageBytes = Uint8Array.from(new TextEncoder().encode(message))
  try {
    return nacl.sign.detached.verify(messageBytes, sig, publicKey)
  } catch {
    return false
  }
}

/** True if a string looks like a Solana base58 address rather than 0x EVM. */
export function isSolanaAddress(address: string): boolean {
  if (address.startsWith('0x')) return false
  try {
    // eslint-disable-next-line no-new
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

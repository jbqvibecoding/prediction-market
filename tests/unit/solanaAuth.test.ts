import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'
import {
  buildSignInMessage,
  isSolanaAddress,
  verifySignInSignature,
} from '@/lib/solana/auth'

function sign(message: string, kp: Keypair): string {
  // Wrap with Uint8Array.from so tweetnacl's instanceof check passes even when
  // the test environment (jsdom) and web3.js Buffers come from different realms.
  const sig = nacl.sign.detached(
    Uint8Array.from(new TextEncoder().encode(message)),
    Uint8Array.from(kp.secretKey),
  )
  return Buffer.from(sig).toString('base64')
}

describe('solana auth (SIWS)', () => {
  const kp = Keypair.generate()
  const address = kp.publicKey.toBase58()
  const message = buildSignInMessage({
    domain: 'kuest.com',
    address,
    statement: 'Sign in to Kuest',
    nonce: 'abc123',
    issuedAt: '2026-06-14T00:00:00.000Z',
  })

  it('builds a deterministic SIWS message containing the address and nonce', () => {
    expect(message).toContain('kuest.com wants you to sign in with your Solana account:')
    expect(message).toContain(address)
    expect(message).toContain('Nonce: abc123')
    expect(message).toContain('Issued At: 2026-06-14T00:00:00.000Z')
  })

  it('verifies a valid signature', () => {
    expect(verifySignInSignature({ message, signature: sign(message, kp), address })).toBe(true)
  })

  it('rejects a signature from a different key', () => {
    const other = Keypair.generate()
    expect(
      verifySignInSignature({ message, signature: sign(message, other), address }),
    ).toBe(false)
  })

  it('rejects a tampered message', () => {
    const sig = sign(message, kp)
    expect(
      verifySignInSignature({ message: message + ' ', signature: sig, address }),
    ).toBe(false)
  })

  it('rejects malformed signature / address without throwing', () => {
    expect(verifySignInSignature({ message, signature: 'not-base64!!', address })).toBe(false)
    expect(verifySignInSignature({ message, signature: sign(message, kp), address: '0xdead' })).toBe(false)
  })

  it('distinguishes solana addresses from EVM', () => {
    expect(isSolanaAddress(address)).toBe(true)
    expect(isSolanaAddress('0x1234567890123456789012345678901234567890')).toBe(false)
    expect(isSolanaAddress('garbage')).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { runSiwsHandshake } from '@/lib/solana/sign-in'
import { verifySignInSignature } from '@/lib/solana/auth'

const kp = Keypair.generate()
const address = kp.publicKey.toBase58()

const walletSign = (message: Uint8Array): Promise<Uint8Array> =>
  Promise.resolve(nacl.sign.detached(Uint8Array.from(message), Uint8Array.from(kp.secretKey)))

describe('runSiwsHandshake', () => {
  it('runs nonce -> sign -> verify and succeeds for a valid wallet', async () => {
    const getNonce = vi.fn().mockResolvedValue('nonce-xyz')
    const verify = vi.fn(({ message, signature, address }) =>
      Promise.resolve(verifySignInSignature({ message, signature, address })),
    )

    const ok = await runSiwsHandshake({
      address,
      domain: 'kuest.com',
      uri: 'https://kuest.com',
      statement: 'Sign in to Kuest',
      getNonce,
      signMessage: walletSign,
      verify,
      now: () => new Date('2026-06-14T00:00:00.000Z'),
    })

    expect(ok).toBe(true)
    expect(getNonce).toHaveBeenCalledWith(address)
    // the message carried to verify must contain the server nonce
    expect(verify.mock.calls[0][0].message).toContain('Nonce: nonce-xyz')
    expect(verify.mock.calls[0][0].address).toBe(address)
  })

  it('fails verification if the wallet signs with the wrong key', async () => {
    const wrong = Keypair.generate()
    const ok = await runSiwsHandshake({
      address,
      domain: 'kuest.com',
      getNonce: () => Promise.resolve('n1'),
      signMessage: msg =>
        Promise.resolve(nacl.sign.detached(Uint8Array.from(msg), Uint8Array.from(wrong.secretKey))),
      verify: args => Promise.resolve(verifySignInSignature(args)),
    })
    expect(ok).toBe(false)
  })

  it('propagates a failing nonce fetch', async () => {
    await expect(
      runSiwsHandshake({
        address,
        domain: 'kuest.com',
        getNonce: () => Promise.reject(new Error('nonce failed')),
        signMessage: walletSign,
        verify: () => Promise.resolve(true),
      }),
    ).rejects.toThrow('nonce failed')
  })
})

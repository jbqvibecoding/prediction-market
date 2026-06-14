'use client'

import { useCallback, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { runSiwsHandshake } from '@/lib/solana/sign-in'

/** Server contract the SIWS routes must satisfy (see decision note in chat). */
async function fetchNonce(address: string): Promise<string> {
  const res = await fetch('/api/auth/siws/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  if (!res.ok) throw new Error('failed to fetch sign-in nonce')
  const body = (await res.json()) as { nonce?: string }
  if (!body.nonce) throw new Error('nonce missing from response')
  return body.nonce
}

async function verifySignIn(args: {
  message: string
  signature: string
  address: string
}): Promise<boolean> {
  const res = await fetch('/api/auth/siws/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) return false
  const body = (await res.json()) as { success?: boolean }
  return Boolean(body.success)
}

export interface UseSolanaSignIn {
  signIn: () => Promise<boolean>
  signingIn: boolean
  error: Error | null
  connected: boolean
}

/**
 * Sign-In With Solana — the replacement for Kuest's AppKit SIWE flow. Drives the
 * connected wallet through the nonce -> sign -> verify handshake. Requires the
 * server-side SIWS routes (better-auth's built-in siwe plugin is EVM-only).
 */
export function useSolanaSignIn(): UseSolanaSignIn {
  const { publicKey, signMessage } = useWallet()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const signIn = useCallback(async () => {
    if (!publicKey) throw new Error('wallet not connected')
    if (!signMessage) throw new Error('wallet does not support message signing')

    setSigningIn(true)
    setError(null)
    try {
      return await runSiwsHandshake({
        address: publicKey.toBase58(),
        domain: window.location.host,
        uri: window.location.origin,
        statement: 'Sign in to Kuest',
        getNonce: fetchNonce,
        signMessage,
        verify: verifySignIn,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setError(err)
      throw err
    } finally {
      setSigningIn(false)
    }
  }, [publicKey, signMessage])

  return { signIn, signingIn, error, connected: Boolean(publicKey) }
}

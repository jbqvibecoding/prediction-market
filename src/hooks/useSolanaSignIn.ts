'use client'

import { useCallback, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { authClient } from '@/lib/auth-client'
import { runSiwsHandshake } from '@/lib/solana/sign-in'

export interface UseSolanaSignIn {
  signIn: () => Promise<boolean>
  signingIn: boolean
  error: Error | null
  connected: boolean
}

/**
 * Sign-In With Solana — the replacement for Kuest's AppKit SIWE flow. Drives the
 * connected wallet through the nonce -> sign -> verify handshake against the
 * SIWS better-auth plugin (authClient.siws). On success the '/siws/verify' atom
 * listener refreshes the better-auth session.
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
        getNonce: async (address) => {
          const { data, error: nonceError } = await authClient.siws.nonce({ address })
          if (nonceError || !data?.nonce) {
            throw new Error(nonceError?.message ?? 'failed to fetch sign-in nonce')
          }
          return data.nonce
        },
        signMessage,
        verify: async ({ message, signature, address }) => {
          const { data } = await authClient.siws.verify({ message, signature, address })
          return Boolean(data?.success)
        },
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

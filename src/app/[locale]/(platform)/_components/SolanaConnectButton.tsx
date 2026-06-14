'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useSolanaSignIn } from '@/hooks/useSolanaSignIn'
import { cn } from '@/lib/utils'

/**
 * Solana wallet connect + Sign-In With Solana button. Additive during the
 * EVM->Solana migration (sits alongside the existing AppKit connect UI).
 */
export default function SolanaConnectButton() {
  const { connected } = useWallet()
  const { signIn, signingIn } = useSolanaSignIn()

  return (
    <div className="flex items-center gap-2">
      <WalletMultiButton />
      {connected && (
        <button
          type="button"
          onClick={() => {
            void signIn().catch(() => {})
          }}
          disabled={signingIn}
          className={cn(
            'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
            'disabled:opacity-60',
          )}
        >
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
      )}
    </div>
  )
}

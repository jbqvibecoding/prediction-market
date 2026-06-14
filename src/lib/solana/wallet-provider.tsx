'use client'

import { ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { getSolanaConfig } from './config'

/**
 * Solana wallet context for the app — the replacement for Kuest's EVM
 * AppKit/wagmi provider (src/providers/AppKitProvider.tsx).
 *
 * Additive for now: not yet mounted in the root layout. Wiring it in (and
 * removing the EVM provider) is a later, invasive step. Consumers use
 * `useWallet()` / `useConnection()` from @solana/wallet-adapter-react, or the
 * `useSolanaClob` hook.
 *
 * Note: mount the adapter UI styles where this is used, e.g.
 *   import '@solana/wallet-adapter-react-ui/styles.css'
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const { rpcUrl } = getSolanaConfig()
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  )

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

'use client'

import { createContext, useCallback } from 'react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

export interface AppKitValue {
  open: (options?: unknown) => Promise<void>
  close: () => Promise<void>
  isReady: boolean
}

export const defaultAppKitValue: AppKitValue = {
  open: async () => {},
  close: async () => {},
  isReady: false,
}

// Retained only so the legacy AppKitProvider still compiles during the
// migration; useAppKit() no longer reads it.
export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

/**
 * Solana wallet-modal facade. Replaces the Reown AppKit open/close: opening the
 * "connect wallet" prompt now shows the Solana wallet-adapter modal. Backed by
 * @solana/wallet-adapter-react-ui (mounted via SolanaWalletProvider).
 */
export function useAppKit(): AppKitValue {
  const { setVisible } = useWalletModal()
  const open = useCallback(async (_options?: unknown) => {
    setVisible(true)
  }, [setVisible])
  const close = useCallback(async () => {
    setVisible(false)
  }, [setVisible])
  return { open, close, isReady: true }
}

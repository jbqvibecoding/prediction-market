'use client'

import { useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

/**
 * Wallet connection facade over the Solana wallet adapter. Replacement for the
 * EVM AppKit hooks (useAppKit / useAppKitAccount / useDisconnect / useWalletInfo)
 * so connect/disconnect/account-read call sites can move off Reown/wagmi.
 */
export interface WalletConnection {
  /** base58 address, or undefined when disconnected */
  address: string | undefined
  isConnected: boolean
  /** open the wallet selection modal */
  open: () => void
  disconnect: () => Promise<void>
  walletName: string | undefined
  walletIcon: string | undefined
}

export function useWalletConnection(): WalletConnection {
  const { publicKey, connected, disconnect, wallet } = useWallet()
  const { setVisible } = useWalletModal()

  const open = useCallback(() => setVisible(true), [setVisible])

  return {
    address: publicKey?.toBase58(),
    isConnected: connected,
    open,
    disconnect,
    walletName: wallet?.adapter.name,
    walletIcon: wallet?.adapter.icon,
  }
}

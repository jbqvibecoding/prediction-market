'use client'

import { useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { buildSplTransferToOwner } from '@/lib/solana/spl-token'

export interface SplTransferInput {
  /** base58 token mint */
  mint: string
  decimals: number
  /** recipient wallet (owner) base58 */
  to: string
  /** base-unit amount */
  amount: bigint
}

export interface UseSplTransfer {
  /** transfer SPL tokens from the connected wallet to `to`; resolves to the tx signature */
  transfer: (input: SplTransferInput) => Promise<string>
  connected: boolean
}

/**
 * Send SPL tokens from the connected wallet (creating the recipient's ATA if
 * needed). Replacement for the EVM deposit-wallet withdraw (buildSendErc20Call +
 * signAndSubmitDepositWalletCalls).
 */
export function useSplTransfer(): UseSplTransfer {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  const transfer = useCallback(
    async (input: SplTransferInput): Promise<string> => {
      if (!publicKey || !sendTransaction) throw new Error('wallet not connected')
      const instructions = buildSplTransferToOwner({
        mint: new PublicKey(input.mint),
        decimals: input.decimals,
        fromOwner: publicKey,
        toOwner: new PublicKey(input.to),
        amount: input.amount,
      })
      const tx = new Transaction().add(...instructions)
      return sendTransaction(tx, connection)
    },
    [connection, publicKey, sendTransaction],
  )

  return { transfer, connected: Boolean(publicKey) }
}

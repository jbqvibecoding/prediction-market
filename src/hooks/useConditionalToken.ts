'use client'

import { useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import {
  buildMergeInstruction,
  buildRedeemInstruction,
  buildSplitInstruction,
} from '@/lib/solana/conditional-token'

export interface ConditionalTokenArgs {
  /** base58 market pubkey (condition seed) */
  market: string
  /** base58 collateral mint */
  collateralMint: string
  /** base-unit amount */
  amount: bigint
}

export interface RedeemArgs extends ConditionalTokenArgs {
  /** 0 = YES, 1 = NO (the resolved winner) */
  winningOutcome: number
}

export interface UseConditionalToken {
  /** lock collateral -> mint YES + NO; resolves to the tx signature */
  split: (args: ConditionalTokenArgs) => Promise<string>
  /** burn YES + NO -> unlock collateral */
  merge: (args: ConditionalTokenArgs) => Promise<string>
  /** after resolution, burn winning token -> unlock collateral */
  redeem: (args: RedeemArgs) => Promise<string>
  connected: boolean
}

/**
 * Conditional-token actions on Solana: build the program instruction and send it
 * with the connected wallet. Replacement for the EVM deposit-wallet batched-call
 * flow (signAndSubmitDepositWalletCalls + build{Split,Merge,Redeem}PositionCall).
 */
export function useConditionalToken(): UseConditionalToken {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  const send = useCallback(
    async (instruction: TransactionInstruction): Promise<string> => {
      if (!publicKey || !sendTransaction) throw new Error('wallet not connected')
      const tx = new Transaction().add(instruction)
      return sendTransaction(tx, connection)
    },
    [connection, publicKey, sendTransaction],
  )

  const split = useCallback(
    (args: ConditionalTokenArgs) => {
      if (!publicKey) throw new Error('wallet not connected')
      return send(
        buildSplitInstruction({
          market: new PublicKey(args.market),
          user: publicKey,
          collateralMint: new PublicKey(args.collateralMint),
          amount: args.amount,
        }),
      )
    },
    [publicKey, send],
  )

  const merge = useCallback(
    (args: ConditionalTokenArgs) => {
      if (!publicKey) throw new Error('wallet not connected')
      return send(
        buildMergeInstruction({
          market: new PublicKey(args.market),
          user: publicKey,
          collateralMint: new PublicKey(args.collateralMint),
          amount: args.amount,
        }),
      )
    },
    [publicKey, send],
  )

  const redeem = useCallback(
    (args: RedeemArgs) => {
      if (!publicKey) throw new Error('wallet not connected')
      return send(
        buildRedeemInstruction({
          market: new PublicKey(args.market),
          user: publicKey,
          collateralMint: new PublicKey(args.collateralMint),
          amount: args.amount,
          winningOutcome: args.winningOutcome,
        }),
      )
    },
    [publicKey, send],
  )

  return { split, merge, redeem, connected: Boolean(publicKey) }
}

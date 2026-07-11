'use client'

import { useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { getSolanaConfig } from '@/lib/solana/config'
import {
  buildClaimWinningsInstruction,
  buildMintOutcomeTokensInstruction,
  buildRedeemOutcomeTokensInstruction,
} from '@/lib/solana/spark'

export interface SparkTradeArgs {
  /** u64 spark market id (decimal string) */
  marketId: string
  outcomeIndex: number
  /** base-unit amount: USDC in for mint, outcome tokens in for redeem */
  amount: bigint
}

export interface SparkClaimArgs {
  marketId: string
  /** the resolved winning outcome index */
  outcomeIndex: number
}

export interface UseSparkMarket {
  /** buy: pay USDC -> mint outcome tokens along the curve; resolves to the tx signature */
  mint: (args: SparkTradeArgs) => Promise<string>
  /** sell: burn outcome tokens -> USDC back along the curve */
  redeem: (args: SparkTradeArgs) => Promise<string>
  /** after resolution: burn the winning balance for the pro-rata pool share */
  claim: (args: SparkClaimArgs) => Promise<string>
  connected: boolean
}

/**
 * Spark (event-futures) market actions on Solana: build the events_futures
 * program instruction and send it with the connected wallet. Mirrors
 * useConditionalToken (the CTF hook).
 */
export function useSparkMarket(): UseSparkMarket {
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

  const mint = useCallback(
    (args: SparkTradeArgs) => {
      if (!publicKey) throw new Error('wallet not connected')
      return send(
        buildMintOutcomeTokensInstruction({
          marketId: BigInt(args.marketId),
          outcomeIndex: args.outcomeIndex,
          user: publicKey,
          collateralMint: new PublicKey(getSolanaConfig().collateralMint),
          amount: args.amount,
        }),
      )
    },
    [publicKey, send],
  )

  const redeem = useCallback(
    (args: SparkTradeArgs) => {
      if (!publicKey) throw new Error('wallet not connected')
      return send(
        buildRedeemOutcomeTokensInstruction({
          marketId: BigInt(args.marketId),
          outcomeIndex: args.outcomeIndex,
          user: publicKey,
          collateralMint: new PublicKey(getSolanaConfig().collateralMint),
          amount: args.amount,
        }),
      )
    },
    [publicKey, send],
  )

  const claim = useCallback(
    (args: SparkClaimArgs) => {
      if (!publicKey) throw new Error('wallet not connected')
      return send(
        buildClaimWinningsInstruction({
          marketId: BigInt(args.marketId),
          outcomeIndex: args.outcomeIndex,
          user: publicKey,
          collateralMint: new PublicKey(getSolanaConfig().collateralMint),
        }),
      )
    },
    [publicKey, send],
  )

  return { mint, redeem, claim, connected: Boolean(publicKey) }
}

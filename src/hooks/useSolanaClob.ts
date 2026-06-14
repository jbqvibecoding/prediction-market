'use client'

import { useCallback, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { ClobClient } from '@/lib/solana/clob-client'
import { getSolanaConfig } from '@/lib/solana/config'
import { PlaceOrderResult, placeOrder } from '@/lib/solana/place-order'

/** Matching-engine client bound to the configured URL. */
export function useClobClient(): ClobClient {
  const { matchingEngineUrl } = getSolanaConfig()
  return useMemo(() => new ClobClient(matchingEngineUrl), [matchingEngineUrl])
}

export interface PlaceLimitOrderInput {
  market: string
  /** 0 = YES, 1 = NO */
  outcome: number
  /** 0 = BUY, 1 = SELL */
  side: number
  shares: bigint
  /** price in micro units (1..1_000_000) */
  priceMicro: bigint
  expiration?: bigint
  feeRateBps?: number
}

export interface UseSolanaClob {
  clob: ClobClient
  connected: boolean
  placeOrder: (input: PlaceLimitOrderInput) => Promise<PlaceOrderResult>
}

/**
 * Trading hook over the matching engine: builds, signs (via the connected
 * wallet), and submits orders. Replaces Kuest's EVM order-submission path
 * (store-order server action + EIP-712 signing).
 */
export function useSolanaClob(): UseSolanaClob {
  const clob = useClobClient()
  const { publicKey, signMessage } = useWallet()

  const submit = useCallback(
    async (input: PlaceLimitOrderInput): Promise<PlaceOrderResult> => {
      if (!publicKey) throw new Error('wallet not connected')
      if (!signMessage) {
        throw new Error('wallet does not support message signing')
      }
      return placeOrder(clob, {
        ...input,
        maker: publicKey.toBase58(),
        signMessage,
      })
    },
    [clob, publicKey, signMessage],
  )

  return { clob, connected: Boolean(publicKey), placeOrder: submit }
}

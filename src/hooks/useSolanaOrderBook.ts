'use client'

import { useQuery } from '@tanstack/react-query'
import { useClobClient } from '@/hooks/useSolanaClob'
import { OrderBookSummary, toOrderBookSummary } from '@/lib/solana/orderbook'

export interface UseSolanaOrderBookOptions {
  enabled?: boolean
  /** decimals of the collateral/share base unit (default 6). */
  shareDecimals?: number
  /** cap price levels per side. */
  maxLevels?: number
  /** polling interval in ms (react-query refetchInterval). */
  refetchInterval?: number
}

/**
 * Live order book for a (market, outcome), aggregated into price-level
 * summaries. Solana counterpart of `useOrderBookSummaries` — reads the matching
 * engine via ClobClient instead of the EVM CLOB_URL.
 */
export function useSolanaOrderBook(
  market: string | undefined,
  outcome: number,
  options: UseSolanaOrderBookOptions = {},
) {
  const clob = useClobClient()
  const enabled = (options.enabled ?? true) && Boolean(market)

  return useQuery<OrderBookSummary>({
    queryKey: ['solana-orderbook', market ?? null, outcome],
    queryFn: async () => {
      const book = await clob.orderBook(market as string, outcome)
      return toOrderBookSummary(book, {
        shareDecimals: options.shareDecimals,
        maxLevels: options.maxLevels,
      })
    },
    enabled,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: options.refetchInterval,
    retry: 1,
  })
}

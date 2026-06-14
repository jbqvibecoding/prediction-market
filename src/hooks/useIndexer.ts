'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSolanaConfig } from '@/lib/solana/config'
import {
  IndexerClient,
  IndexerMarket,
  IndexerPosition,
  IndexerTrade,
  LeaderboardEntry,
} from '@/lib/solana/indexer-client'

/** Indexer read client bound to the configured URL. */
export function useIndexerClient(): IndexerClient {
  const { indexerUrl } = getSolanaConfig()
  return useMemo(() => new IndexerClient(indexerUrl), [indexerUrl])
}

const STALE = 15_000
const GC = 60_000

/** On-chain markets the indexer has seen (with resolution + volume). */
export function useIndexerMarkets(options: { enabled?: boolean } = {}) {
  const indexer = useIndexerClient()
  return useQuery<IndexerMarket[]>({
    queryKey: ['indexer-markets'],
    queryFn: () => indexer.markets(),
    enabled: options.enabled ?? true,
    staleTime: STALE,
    gcTime: GC,
  })
}

/** A user's net positions across markets/outcomes. */
export function useIndexerPositions(
  user: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const indexer = useIndexerClient()
  return useQuery<IndexerPosition[]>({
    queryKey: ['indexer-positions', user ?? null],
    queryFn: () => indexer.positions(user as string),
    enabled: (options.enabled ?? true) && Boolean(user),
    staleTime: STALE,
    gcTime: GC,
  })
}

/** Settled trades, optionally filtered by market. */
export function useIndexerTrades(
  market?: string,
  options: { enabled?: boolean } = {},
) {
  const indexer = useIndexerClient()
  return useQuery<IndexerTrade[]>({
    queryKey: ['indexer-trades', market ?? null],
    queryFn: () => indexer.trades(market),
    enabled: options.enabled ?? true,
    staleTime: STALE,
    gcTime: GC,
  })
}

/** Volume leaderboard by traded collateral. */
export function useIndexerLeaderboard(options: { enabled?: boolean } = {}) {
  const indexer = useIndexerClient()
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['indexer-leaderboard'],
    queryFn: () => indexer.leaderboard(),
    enabled: options.enabled ?? true,
    staleTime: STALE,
    gcTime: GC,
  })
}

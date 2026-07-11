import type { Market, MarketType } from '@/types'

/**
 * Resolve a market's protocol type. Markets created before the spark rollout
 * have no `market_type` field and are CTF (order-book) markets.
 */
export function getMarketType(market: Pick<Market, 'market_type'> | null | undefined): MarketType {
  return market?.market_type === 'spark' ? 'spark' : 'ctf'
}

export function isSparkMarket(market: Pick<Market, 'market_type'> | null | undefined): boolean {
  return getMarketType(market) === 'spark'
}

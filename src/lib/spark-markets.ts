import type { SparkCurve } from '@/lib/solana/spark'
import type { SparkMarketConfig } from '@/types'
import { sparkSpotPriceScaled, SPARK_CURVE_SCALE } from '@/lib/solana/spark'

/** USDC base units per whole USDC (6 decimals). */
export const SPARK_USDC_UNIT = 1_000_000

/** A spark market as served by the listing API (config + display metadata). */
export interface SparkMarketListing {
  title: string
  description?: string
  imageUrl?: string
  endDateIso?: string
  config: SparkMarketConfig
}

/** Parse the on-chain curve config (decimal strings) into bigint curve params. */
export function parseSparkCurve(config: SparkMarketConfig): SparkCurve {
  const nNum = Number(config.curve.nNum)
  const nDen = Number(config.curve.nDen)
  // MVP supports integer exponents only (blueprint recommends n = 2).
  const n = nDen === 1 && Number.isInteger(nNum) && nNum >= 1 ? nNum : 2
  return {
    mNum: BigInt(config.curve.mNum),
    mDen: BigInt(config.curve.mDen),
    n,
  }
}

/** Spot price of one outcome in whole USDC (display), from its current supply. */
export function sparkOutcomeSpotPrice(config: SparkMarketConfig, outcomeIndex: number): number {
  const outcome = config.outcomes.find(item => item.index === outcomeIndex)
  if (!outcome) {
    return 0
  }
  const curve = parseSparkCurve(config)
  const scaled = sparkSpotPriceScaled(curve, BigInt(outcome.currentSupply))
  // scaled is per base-unit token × SPARK_CURVE_SCALE; price per whole token
  // (1e6 base units) in whole USDC (1e6 base units) leaves ×1 net.
  return Number(scaled) / Number(SPARK_CURVE_SCALE)
}

/** Base-unit USDC → whole-USDC number for display. */
export function sparkBaseToUsdc(value: string | bigint): number {
  return Number(value) / SPARK_USDC_UNIT
}

/** Whole tokens (6-decimals) from a base-unit amount. */
export function sparkBaseToTokens(value: string | bigint): number {
  return Number(value) / SPARK_USDC_UNIT
}

function isSparkOutcomeShape(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const outcome = value as Record<string, unknown>
  return typeof outcome.index === 'number'
    && typeof outcome.label === 'string'
    && typeof outcome.mint === 'string'
    && typeof outcome.currentSupply === 'string'
    && typeof outcome.usdcInCurve === 'string'
}

export function isSparkMarketListing(value: unknown): value is SparkMarketListing {
  if (!value || typeof value !== 'object') {
    return false
  }
  const listing = value as Record<string, unknown>
  if (typeof listing.title !== 'string' || !listing.config || typeof listing.config !== 'object') {
    return false
  }
  const config = listing.config as Record<string, unknown>
  return typeof config.marketId === 'string'
    && Array.isArray(config.outcomes)
    && config.outcomes.every(isSparkOutcomeShape)
    && typeof config.curve === 'object'
    && config.curve !== null
}

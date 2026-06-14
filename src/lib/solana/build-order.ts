import {
  SIDE_BUY,
  SIDE_SELL,
  SolanaOrder,
  serializeOrder,
} from './order'

/**
 * Order construction helpers for the trading UI.
 *
 * Prices are expressed in "micro" units out of {@link PRICE_DENOMINATOR}
 * (1_000_000 = a probability of 1.0), avoiding floats. Collateral and shares
 * are base-unit bigints; outcome mints share the collateral's decimals, so one
 * share maps to `price` collateral.
 *
 *   collateral = shares * priceMicro / 1_000_000
 *
 * BUY : maker gives `collateral`, wants `shares`.
 * SELL: maker gives `shares`,     wants `collateral`.
 *
 * This is the Solana/CLOB counterpart of Kuest's EVM `buildOrderPayload`.
 */
export const PRICE_DENOMINATOR = 1_000_000n

export interface BuildOrderParams {
  maker: string
  market: string
  /** 0 = YES, 1 = NO */
  outcome: number
  /** 0 = BUY, 1 = SELL */
  side: number
  /** outcome shares (base units) */
  shares: bigint
  /** price in micro units, 1..1_000_000 */
  priceMicro: bigint
  /** unix seconds; 0 = no expiry */
  expiration?: bigint
  feeRateBps?: number
  /** deterministic salt; a random u64 is generated when omitted */
  salt?: bigint
}

export function randomSalt(): bigint {
  const a = new BigUint64Array(1)
  globalThis.crypto.getRandomValues(a)
  return a[0]!
}

/** Collateral required/received for `shares` at `priceMicro`. */
export function collateralFor(shares: bigint, priceMicro: bigint): bigint {
  return (shares * priceMicro) / PRICE_DENOMINATOR
}

export function buildLimitOrder(params: BuildOrderParams): SolanaOrder {
  if (params.shares <= 0n) throw new Error('shares must be greater than zero')
  if (params.priceMicro <= 0n || params.priceMicro > PRICE_DENOMINATOR) {
    throw new Error('price must be within (0, 1]')
  }
  if (params.side !== SIDE_BUY && params.side !== SIDE_SELL) {
    throw new Error('invalid side')
  }

  const collateral = collateralFor(params.shares, params.priceMicro)
  if (collateral <= 0n) throw new Error('collateral rounds to zero; increase size or price')

  const [makerAmount, takerAmount] =
    params.side === SIDE_BUY
      ? [collateral, params.shares]
      : [params.shares, collateral]

  return {
    salt: params.salt ?? randomSalt(),
    maker: params.maker,
    market: params.market,
    outcome: params.outcome,
    side: params.side,
    makerAmount,
    takerAmount,
    expiration: params.expiration ?? 0n,
    feeRateBps: params.feeRateBps ?? 0,
  }
}

/** Recover the price (micro units) an order is quoting, for display. */
export function orderPriceMicro(order: SolanaOrder): bigint {
  return order.side === SIDE_BUY
    ? (order.makerAmount * PRICE_DENOMINATOR) / order.takerAmount
    : (order.takerAmount * PRICE_DENOMINATOR) / order.makerAmount
}

/** Convenience: build and serialize in one step (bytes the maker must sign). */
export function buildAndSerialize(params: BuildOrderParams): {
  order: SolanaOrder
  message: Uint8Array
} {
  const order = buildLimitOrder(params)
  return { order, message: serializeOrder(order) }
}

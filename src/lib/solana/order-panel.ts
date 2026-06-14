import { BuildOrderParams } from './build-order'
import { SIDE_BUY, SIDE_SELL } from './order'

/**
 * Translation layer between Kuest's order-panel inputs and the Solana CLOB
 * order builder. The panel works in cents (0..100) and human share amounts;
 * the engine/program work in micro-price (0..1_000_000) and base-unit bigints.
 *
 * Pure and unit-tested so the eventual EventOrderPanelForm rewire is a thin
 * call: `buildLimitOrder(panelLimitOrderParams(inputs))`.
 */
export interface PanelLimitInputs {
  /** base58 maker pubkey */
  maker: string
  /** base58 market pubkey */
  market: string
  /** 0 = YES, 1 = NO */
  outcome: number
  side: 'buy' | 'sell'
  /** limit price in cents (0, 100], may be fractional (e.g. 52.5) */
  limitPriceCents: number
  /** order size in human shares (> 0) */
  shares: number
  /** base-unit decimals of the share/collateral mint (default 6) */
  shareDecimals?: number
  expiration?: bigint
  feeRateBps?: number
}

/** 1 cent = 0.01 probability = 10_000 micro-price units. */
export function centsToPriceMicro(cents: number): bigint {
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100) {
    throw new Error('limit price must be within (0, 100] cents')
  }
  return BigInt(Math.round(cents * 10_000))
}

export function sharesToBaseUnits(shares: number, decimals = 6): bigint {
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Error('shares must be greater than zero')
  }
  return BigInt(Math.round(shares * 10 ** decimals))
}

export function panelLimitOrderParams(input: PanelLimitInputs): BuildOrderParams {
  return {
    maker: input.maker,
    market: input.market,
    outcome: input.outcome,
    side: input.side === 'buy' ? SIDE_BUY : SIDE_SELL,
    shares: sharesToBaseUnits(input.shares, input.shareDecimals),
    priceMicro: centsToPriceMicro(input.limitPriceCents),
    expiration: input.expiration,
    feeRateBps: input.feeRateBps,
  }
}

import { PRICE_DENOMINATOR } from './build-order'
import { OrderBookResponse } from './clob-client'
import { SIDE_BUY, WireOrder } from './order'

/**
 * Adapter: aggregate the matching engine's raw order list (per-order `WireOrder`
 * bids/asks) into the price-level summary shape Kuest's order-book UI consumes
 * (`{ price, size }` levels — structurally compatible with
 * `OrderbookLevelSummary`/`OrderBookSummaryResponse`).
 *
 * Prices are emitted as 0..1 probability decimals (the convention the existing
 * CLOB returned); sizes are human share amounts derived from base-unit bigints
 * using `shareDecimals`.
 */
export interface OrderBookLevelSummary {
  price: string
  size: string
}

export interface OrderBookSummary {
  bids: OrderBookLevelSummary[]
  asks: OrderBookLevelSummary[]
  last_trade_price?: string
}

export interface AggregateOptions {
  /** decimals of the collateral/share base unit (default 6). */
  shareDecimals?: number
  /** cap the number of price levels per side (UI caps too). */
  maxLevels?: number
  /** optional last trade price (0..1) to pass through to the summary. */
  lastTradePrice?: string
}

/** Implied price (micro units, 0..1_000_000) an order is quoting. */
export function wireOrderPriceMicro(order: WireOrder): bigint {
  const maker = BigInt(order.makerAmount)
  const taker = BigInt(order.takerAmount)
  if (maker <= 0n || taker <= 0n) return 0n
  return order.side === SIDE_BUY
    ? (maker * PRICE_DENOMINATOR) / taker
    : (taker * PRICE_DENOMINATOR) / maker
}

/** Outcome-share quantity (base units) resting on an order. */
export function wireOrderShares(order: WireOrder): bigint {
  return order.side === SIDE_BUY
    ? BigInt(order.takerAmount)
    : BigInt(order.makerAmount)
}

function priceToString(priceMicro: bigint): string {
  return (Number(priceMicro) / Number(PRICE_DENOMINATOR)).toString()
}

function sharesToString(shares: bigint, decimals: number): string {
  if (decimals <= 0) return shares.toString()
  return (Number(shares) / 10 ** decimals).toString()
}

function compareMicro(a: bigint, b: bigint): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function aggregateSide(
  orders: WireOrder[],
  side: 'bid' | 'ask',
  decimals: number,
  maxLevels?: number,
): OrderBookLevelSummary[] {
  const sharesByPrice = new Map<string, bigint>()
  for (const order of orders) {
    const priceMicro = wireOrderPriceMicro(order)
    if (priceMicro <= 0n) continue
    const shares = wireOrderShares(order)
    if (shares <= 0n) continue
    const key = priceMicro.toString()
    sharesByPrice.set(key, (sharesByPrice.get(key) ?? 0n) + shares)
  }

  let levels = [...sharesByPrice.entries()].map(([key, shares]) => ({
    priceMicro: BigInt(key),
    shares,
  }))

  // bids: best (highest) first; asks: best (lowest) first.
  levels.sort((a, b) =>
    side === 'ask'
      ? compareMicro(a.priceMicro, b.priceMicro)
      : compareMicro(b.priceMicro, a.priceMicro),
  )

  if (maxLevels && maxLevels > 0) levels = levels.slice(0, maxLevels)

  return levels.map(level => ({
    price: priceToString(level.priceMicro),
    size: sharesToString(level.shares, decimals),
  }))
}

export function toOrderBookSummary(
  book: OrderBookResponse,
  options: AggregateOptions = {},
): OrderBookSummary {
  const decimals = options.shareDecimals ?? 6
  const summary: OrderBookSummary = {
    bids: aggregateSide(book.bids ?? [], 'bid', decimals, options.maxLevels),
    asks: aggregateSide(book.asks ?? [], 'ask', decimals, options.maxLevels),
  }
  if (options.lastTradePrice !== undefined) {
    summary.last_trade_price = options.lastTradePrice
  }
  return summary
}

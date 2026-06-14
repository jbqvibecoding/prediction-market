import { describe, expect, it } from 'vitest'
import { SIDE_BUY, SIDE_SELL, WireOrder } from '@/lib/solana/order'
import {
  toOrderBookSummary,
  wireOrderPriceMicro,
  wireOrderShares,
} from '@/lib/solana/orderbook'

function buy(maker: string, taker: string): WireOrder {
  return {
    salt: '1', maker: 'M', market: 'K', outcome: 0, side: SIDE_BUY,
    makerAmount: maker, takerAmount: taker, expiration: '0', feeRateBps: 0,
  }
}
function sell(maker: string, taker: string): WireOrder {
  return {
    salt: '1', maker: 'M', market: 'K', outcome: 0, side: SIDE_SELL,
    makerAmount: maker, takerAmount: taker, expiration: '0', feeRateBps: 0,
  }
}

describe('solana order book adapter', () => {
  it('derives price (micro) and shares per side', () => {
    // BUY 100 shares for 60 collateral => price 0.6, size 100 shares
    expect(wireOrderPriceMicro(buy('60', '100'))).toBe(600_000n)
    expect(wireOrderShares(buy('60', '100'))).toBe(100n)
    // SELL 80 shares for 50 collateral => price 0.625, size 80 shares
    expect(wireOrderPriceMicro(sell('80', '50'))).toBe(625_000n)
    expect(wireOrderShares(sell('80', '50'))).toBe(80n)
  })

  it('aggregates orders at the same price and sorts bids desc / asks asc', () => {
    const book = {
      bids: [buy('60', '100'), buy('30', '50'), buy('55', '100')], // 0.6 x150, 0.55 x100
      asks: [sell('40', '26'), sell('80', '50')], // 0.65 x40, 0.625 x80
    }
    const summary = toOrderBookSummary(book, { shareDecimals: 0 })

    expect(summary.bids).toEqual([
      { price: '0.6', size: '150' },
      { price: '0.55', size: '100' },
    ])
    expect(summary.asks).toEqual([
      { price: '0.625', size: '80' },
      { price: '0.65', size: '40' },
    ])
  })

  it('converts base-unit shares to human size via shareDecimals', () => {
    const summary = toOrderBookSummary({ bids: [buy('600000', '1000000')], asks: [] }, {
      shareDecimals: 6,
    })
    // 1_000_000 base units / 1e6 = 1 share; price 0.6
    expect(summary.bids).toEqual([{ price: '0.6', size: '1' }])
  })

  it('caps levels with maxLevels and passes through last trade price', () => {
    const book = {
      bids: [buy('90', '100'), buy('80', '100'), buy('70', '100')],
      asks: [],
    }
    const summary = toOrderBookSummary(book, { shareDecimals: 0, maxLevels: 2, lastTradePrice: '0.85' })
    expect(summary.bids).toHaveLength(2)
    expect(summary.bids[0]).toEqual({ price: '0.9', size: '100' })
    expect(summary.last_trade_price).toBe('0.85')
  })

  it('skips degenerate orders', () => {
    const summary = toOrderBookSummary({ bids: [buy('0', '100'), buy('60', '0')], asks: [] }, {
      shareDecimals: 0,
    })
    expect(summary.bids).toEqual([])
  })
})

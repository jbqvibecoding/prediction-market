import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import { buildLimitOrder } from '@/lib/solana/build-order'
import { SIDE_BUY, SIDE_SELL } from '@/lib/solana/order'
import {
  centsToPriceMicro,
  panelLimitOrderParams,
  sharesToBaseUnits,
} from '@/lib/solana/order-panel'

const maker = Keypair.generate().publicKey.toBase58()
const market = Keypair.generate().publicKey.toBase58()

describe('order-panel translation', () => {
  it('converts cents to micro price', () => {
    expect(centsToPriceMicro(52.5)).toBe(525_000n)
    expect(centsToPriceMicro(100)).toBe(1_000_000n)
    expect(centsToPriceMicro(1)).toBe(10_000n)
  })

  it('rejects out-of-range prices', () => {
    expect(() => centsToPriceMicro(0)).toThrow()
    expect(() => centsToPriceMicro(100.1)).toThrow()
    expect(() => centsToPriceMicro(Number.NaN)).toThrow()
  })

  it('converts human shares to base units by decimals', () => {
    expect(sharesToBaseUnits(100, 6)).toBe(100_000_000n)
    expect(sharesToBaseUnits(1.5, 6)).toBe(1_500_000n)
    expect(sharesToBaseUnits(100, 0)).toBe(100n)
    expect(() => sharesToBaseUnits(0)).toThrow()
  })

  it('maps panel inputs into BuildOrderParams (buy)', () => {
    const params = panelLimitOrderParams({
      maker, market, outcome: 0, side: 'buy', limitPriceCents: 60, shares: 100, shareDecimals: 0,
    })
    expect(params.side).toBe(SIDE_BUY)
    expect(params.priceMicro).toBe(600_000n)
    expect(params.shares).toBe(100n)
  })

  it('composes with buildLimitOrder end-to-end (sell)', () => {
    const order = buildLimitOrder(
      panelLimitOrderParams({
        maker, market, outcome: 1, side: 'sell', limitPriceCents: 60, shares: 100, shareDecimals: 0,
      }),
    )
    // SELL 100 shares @ 0.60 => maker gives 100 shares, wants 60 collateral
    expect(order.side).toBe(SIDE_SELL)
    expect(order.makerAmount).toBe(100n)
    expect(order.takerAmount).toBe(60n)
    expect(order.outcome).toBe(1)
  })
})

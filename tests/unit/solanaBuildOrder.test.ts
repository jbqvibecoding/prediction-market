import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import {
  PRICE_DENOMINATOR,
  buildLimitOrder,
  collateralFor,
  orderPriceMicro,
  randomSalt,
} from '@/lib/solana/build-order'
import { SIDE_BUY, SIDE_SELL, serializeOrder } from '@/lib/solana/order'

const maker = Keypair.generate().publicKey.toBase58()
const market = Keypair.generate().publicKey.toBase58()

describe('build-order', () => {
  it('computes collateral from shares and price', () => {
    expect(collateralFor(100n, 600_000n)).toBe(60n) // 100 shares @ 0.6
  })

  it('builds a BUY order (maker gives collateral, wants shares)', () => {
    const o = buildLimitOrder({
      maker,
      market,
      outcome: 0,
      side: SIDE_BUY,
      shares: 100n,
      priceMicro: 600_000n,
      salt: 7n,
    })
    expect(o.side).toBe(SIDE_BUY)
    expect(o.makerAmount).toBe(60n)
    expect(o.takerAmount).toBe(100n)
    expect(o.salt).toBe(7n)
    expect(serializeOrder(o)).toHaveLength(100)
  })

  it('builds a SELL order (maker gives shares, wants collateral)', () => {
    const o = buildLimitOrder({
      maker,
      market,
      outcome: 1,
      side: SIDE_SELL,
      shares: 100n,
      priceMicro: 600_000n,
      salt: 9n,
    })
    expect(o.makerAmount).toBe(100n)
    expect(o.takerAmount).toBe(60n)
  })

  it('round-trips the quoted price', () => {
    const buy = buildLimitOrder({
      maker, market, outcome: 0, side: SIDE_BUY, shares: 100n, priceMicro: 600_000n, salt: 1n,
    })
    const sell = buildLimitOrder({
      maker, market, outcome: 0, side: SIDE_SELL, shares: 100n, priceMicro: 250_000n, salt: 2n,
    })
    expect(orderPriceMicro(buy)).toBe(600_000n)
    expect(orderPriceMicro(sell)).toBe(250_000n)
  })

  it('rejects invalid price and size', () => {
    const base = { maker, market, outcome: 0, side: SIDE_BUY, salt: 1n }
    expect(() => buildLimitOrder({ ...base, shares: 0n, priceMicro: 500_000n })).toThrow()
    expect(() => buildLimitOrder({ ...base, shares: 100n, priceMicro: 0n })).toThrow()
    expect(() =>
      buildLimitOrder({ ...base, shares: 100n, priceMicro: PRICE_DENOMINATOR + 1n }),
    ).toThrow(/within/)
  })

  it('generates 64-bit salts', () => {
    const s = randomSalt()
    expect(s).toBeGreaterThanOrEqual(0n)
    expect(s).toBeLessThan(2n ** 64n)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { IndexerClient } from '@/lib/solana/indexer-client'

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async (_url: string) => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

const BASE = 'http://indexer'

describe('IndexerClient', () => {
  it('lists markets', async () => {
    const markets = [
      { market: 'M', condition: 'C', collateralMint: 'U', yesMint: 'Y', noMint: 'N', resolved: false, winningOutcome: null, volume: '0' },
    ]
    const fetchImpl = fakeFetch(markets)
    const client = new IndexerClient(BASE, fetchImpl)
    expect(await client.markets()).toEqual(markets)
    expect(fetchImpl).toHaveBeenCalledWith('http://indexer/markets')
  })

  it('fetches positions for a user (encoded)', async () => {
    const fetchImpl = fakeFetch([{ market: 'M', outcome: 0, shares: '100' }])
    const client = new IndexerClient(BASE, fetchImpl)
    const out = await client.positions('a/b')
    expect(out).toEqual([{ market: 'M', outcome: 0, shares: '100' }])
    expect(fetchImpl).toHaveBeenCalledWith('http://indexer/positions?user=a%2Fb')
  })

  it('fetches volume and leaderboard', async () => {
    const vol = new IndexerClient(BASE, fakeFetch({ market: 'M', volume: '60' }))
    expect(await vol.volume('M')).toEqual({ market: 'M', volume: '60' })

    const lbFetch = fakeFetch([{ trader: 'B', volume: '60' }])
    const lb = new IndexerClient(BASE, lbFetch)
    expect(await lb.leaderboard()).toEqual([{ trader: 'B', volume: '60' }])
    expect(lbFetch).toHaveBeenCalledWith('http://indexer/leaderboard')
  })

  it('fetches trades with and without a market filter', async () => {
    const all = fakeFetch([])
    await new IndexerClient(BASE, all).trades()
    expect(all).toHaveBeenCalledWith('http://indexer/trades')

    const filtered = fakeFetch([])
    await new IndexerClient(BASE, filtered).trades('M')
    expect(filtered).toHaveBeenCalledWith('http://indexer/trades?market=M')
  })

  it('throws on non-ok responses', async () => {
    const client = new IndexerClient(BASE, fakeFetch({}, false, 500))
    await expect(client.markets()).rejects.toThrow(/500/)
  })
})

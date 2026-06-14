import { describe, expect, it, vi } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  ORDER_SERIALIZED_LEN,
  type SolanaOrder,
  SIDE_BUY,
  serializeOrder,
  signOrder,
  toWireOrder,
} from '@/lib/solana/order'
import { ClobClient } from '@/lib/solana/clob-client'
import { IndexerClient } from '@/lib/solana/indexer-client'

function sample(over: Partial<SolanaOrder> = {}): SolanaOrder {
  return {
    salt: 42n,
    maker: Keypair.generate().publicKey.toBase58(),
    market: Keypair.generate().publicKey.toBase58(),
    outcome: 0,
    side: SIDE_BUY,
    makerAmount: 70n,
    takerAmount: 100n,
    expiration: 0n,
    feeRateBps: 0,
    ...over,
  }
}

describe('solana order serialization', () => {
  it('matches the 100-byte borsh layout used by the engine/program', () => {
    const maker = Keypair.generate().publicKey
    const market = Keypair.generate().publicKey
    const buf = Buffer.from(
      serializeOrder(
        sample({
          salt: 0x0102030405060708n,
          maker: maker.toBase58(),
          market: market.toBase58(),
          outcome: 1,
          side: 1,
          makerAmount: 100n,
          takerAmount: 60n,
          expiration: 1700000000n,
          feeRateBps: 250,
        }),
      ),
    )
    expect(buf.length).toBe(ORDER_SERIALIZED_LEN)
    expect(buf.readBigUInt64LE(0)).toBe(0x0102030405060708n)
    expect(new PublicKey(buf.subarray(8, 40)).equals(maker)).toBe(true)
    expect(new PublicKey(buf.subarray(40, 72)).equals(market)).toBe(true)
    expect(buf.readUInt8(72)).toBe(1)
    expect(buf.readUInt8(73)).toBe(1)
    expect(buf.readBigUInt64LE(74)).toBe(100n)
    expect(buf.readBigUInt64LE(82)).toBe(60n)
    expect(buf.readBigInt64LE(90)).toBe(1700000000n)
    expect(buf.readUInt16LE(98)).toBe(250)
  })

  it('toWireOrder renders bigints as decimal strings', () => {
    const w = toWireOrder(sample({ salt: 9n, makerAmount: 70n }))
    expect(w.salt).toBe('9')
    expect(w.makerAmount).toBe('70')
    expect(typeof w.outcome).toBe('number')
  })

  it('signOrder signs the serialized bytes and returns base64', async () => {
    const order = sample()
    const signMessage = vi.fn(async (m: Uint8Array) => m.slice(0, 8))
    const sig = await signOrder(order, signMessage)
    expect(signMessage).toHaveBeenCalledOnce()
    const signedBytes = signMessage.mock.calls[0]![0]
    expect(signedBytes.length).toBe(ORDER_SERIALIZED_LEN)
    expect(sig).toBe(Buffer.from(serializeOrder(order).slice(0, 8)).toString('base64'))
  })
})

describe('service clients', () => {
  it('ClobClient.submitOrder posts the wire order + signature', async () => {
    const order = sample()
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'x', matches: [], settlements: [] }), {
        status: 200,
      }),
    )
    const client = new ClobClient('http://engine', fetchImpl as unknown as typeof fetch)
    const res = await client.submitOrder(order, 'c2ln')
    expect(res.id).toBe('x')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://engine/order')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.signature).toBe('c2ln')
    expect(body.order.salt).toBe('42')
  })

  it('ClobClient surfaces engine errors', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'order expired' }), { status: 400 }),
    )
    const client = new ClobClient('http://engine', fetchImpl as unknown as typeof fetch)
    await expect(client.submitOrder(sample(), 'sig')).rejects.toThrow(/order expired/)
  })

  it('IndexerClient.positions builds the query and parses', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([{ market: 'm', outcome: 0, shares: '5' }]), {
        status: 200,
      }),
    )
    const client = new IndexerClient('http://idx', fetchImpl as unknown as typeof fetch)
    const positions = await client.positions('user1')
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://idx/positions?user=user1')
    expect(positions[0]!.shares).toBe('5')
  })
})

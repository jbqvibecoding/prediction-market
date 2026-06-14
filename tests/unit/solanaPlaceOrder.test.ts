import { describe, expect, it, vi } from 'vitest'
import { Keypair } from '@solana/web3.js'
import { ClobClient, SubmitOrderResponse } from '@/lib/solana/clob-client'
import { placeOrder } from '@/lib/solana/place-order'
import { SIDE_BUY, serializeOrder } from '@/lib/solana/order'

const maker = Keypair.generate().publicKey.toBase58()
const market = Keypair.generate().publicKey.toBase58()

function stubClob(captured: { order?: unknown; signature?: string }): ClobClient {
  const response: SubmitOrderResponse = { id: 'x', matches: [], settlements: [] }
  return {
    submitOrder: vi.fn(async (order: unknown, signature: string) => {
      captured.order = order
      captured.signature = signature
      return response
    }),
  } as unknown as ClobClient
}

describe('placeOrder', () => {
  it('builds, signs, and submits a limit order', async () => {
    const captured: { order?: unknown; signature?: string } = {}
    const clob = stubClob(captured)

    // deterministic 64-byte "signature"
    const signMessage = vi.fn(async (_m: Uint8Array) => new Uint8Array(64).fill(7))

    const result = await placeOrder(clob, {
      maker,
      market,
      outcome: 0,
      side: SIDE_BUY,
      shares: 100n,
      priceMicro: 600_000n,
      salt: 42n,
      signMessage,
    })

    expect(result.order.makerAmount).toBe(60n)
    expect(result.order.takerAmount).toBe(100n)
    expect(result.order.salt).toBe(42n)

    // the wallet signed the exact serialized order bytes
    expect(signMessage).toHaveBeenCalledOnce()
    expect(signMessage.mock.calls[0]![0]).toEqual(serializeOrder(result.order))

    // submitted as base64
    expect(result.signature).toBe(Buffer.from(new Uint8Array(64).fill(7)).toString('base64'))
    expect(captured.signature).toBe(result.signature)
    expect(result.response.id).toBe('x')
  })

  it('propagates build validation errors before signing', async () => {
    const clob = stubClob({})
    const signMessage = vi.fn(async () => new Uint8Array(64))
    await expect(
      placeOrder(clob, {
        maker, market, outcome: 0, side: SIDE_BUY,
        shares: 0n, priceMicro: 600_000n, signMessage,
      }),
    ).rejects.toThrow()
    expect(signMessage).not.toHaveBeenCalled()
  })
})

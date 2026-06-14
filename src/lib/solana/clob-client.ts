import { SolanaOrder, WireOrder, orderId, toWireOrder } from './order'

/**
 * Client for the off-chain matching engine (replaces Kuest's CLOB_URL client).
 * Mirrors matching-engine/src/api.ts.
 */
export interface SubmitOrderResponse {
  id: string
  matches: Array<{
    buy: WireOrder
    sell: WireOrder
    shares: string
    cost: string
  }>
  settlements: string[]
}

export interface OrderBookResponse {
  bids: WireOrder[]
  asks: WireOrder[]
}

export interface PricesResponse {
  bid: number | null
  ask: number | null
}

type Fetcher = typeof fetch

export class ClobClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: Fetcher = fetch,
  ) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
    const body = (await res.json()) as unknown
    if (!res.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `request failed: ${res.status}`
      throw new Error(message)
    }
    return body as T
  }

  /** Submit a signed order. `signature` is base64 (see `signOrder`). */
  submitOrder(order: SolanaOrder, signature: string): Promise<SubmitOrderResponse> {
    return this.json<SubmitOrderResponse>('/order', {
      method: 'POST',
      body: JSON.stringify({ order: toWireOrder(order), signature }),
    })
  }

  cancelOrder(id: string): Promise<{ cancelled: boolean }> {
    return this.json<{ cancelled: boolean }>(
      `/order/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' },
    )
  }

  cancelOrderFor(order: SolanaOrder): Promise<{ cancelled: boolean }> {
    return this.cancelOrder(orderId(order))
  }

  orderBook(market: string, outcome: number): Promise<OrderBookResponse> {
    return this.json<OrderBookResponse>(
      `/orderbook?market=${encodeURIComponent(market)}&outcome=${outcome}`,
    )
  }

  prices(market: string, outcome: number): Promise<PricesResponse> {
    return this.json<PricesResponse>(
      `/prices?market=${encodeURIComponent(market)}&outcome=${outcome}`,
    )
  }
}

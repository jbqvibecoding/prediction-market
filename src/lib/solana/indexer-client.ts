/**
 * Client for the indexer read API (replaces Kuest's DATA_URL / USER_PNL_URL).
 * Mirrors indexer/src/api.ts.
 */
export interface IndexerPosition {
  market: string
  outcome: number
  shares: string
}

export interface IndexerTrade {
  market: string
  outcome: number
  buyer: string
  seller: string
  shares: string
  cost: string
  fee: string
  signature?: string
  slot?: number
}

export interface LeaderboardEntry {
  trader: string
  volume: string
}

type Fetcher = typeof fetch

export class IndexerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: Fetcher = fetch,
  ) {}

  private async json<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`)
    if (!res.ok) throw new Error(`indexer request failed: ${res.status}`)
    return (await res.json()) as T
  }

  positions(user: string): Promise<IndexerPosition[]> {
    return this.json<IndexerPosition[]>(`/positions?user=${encodeURIComponent(user)}`)
  }

  volume(market: string): Promise<{ market: string; volume: string }> {
    return this.json(`/volume?market=${encodeURIComponent(market)}`)
  }

  trades(market?: string): Promise<IndexerTrade[]> {
    const q = market ? `?market=${encodeURIComponent(market)}` : ''
    return this.json<IndexerTrade[]>(`/trades${q}`)
  }

  leaderboard(): Promise<LeaderboardEntry[]> {
    return this.json<LeaderboardEntry[]>('/leaderboard')
  }
}

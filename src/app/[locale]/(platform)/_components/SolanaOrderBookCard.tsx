'use client'

import { useSolanaOrderBook } from '@/hooks/useSolanaOrderBook'

function formatPrice(p: string): string {
  const n = Number(p)
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}¢` : p
}

/**
 * Live order book for a Solana (market, outcome), read from the matching engine
 * via useSolanaOrderBook + toOrderBookSummary. Real consumer of the Solana CLOB
 * read path.
 */
export default function SolanaOrderBookCard({
  market,
  outcome,
}: {
  market: string
  outcome: number
}) {
  const { data, isLoading, isError } = useSolanaOrderBook(market, outcome, {
    refetchInterval: 5000,
    maxLevels: 8,
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading order book…</p>
  if (isError) return <p className="text-sm text-destructive">Failed to load order book.</p>

  const asks = data?.asks ?? []
  const bids = data?.bids ?? []

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <div className="mb-1 font-medium text-emerald-600">Bids</div>
        {bids.length === 0 && <div className="text-muted-foreground">—</div>}
        {bids.map((b, i) => (
          <div key={`b${i}`} className="flex justify-between tabular-nums">
            <span>{formatPrice(b.price)}</span>
            <span className="text-muted-foreground">{b.size}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 font-medium text-red-600">Asks</div>
        {asks.length === 0 && <div className="text-muted-foreground">—</div>}
        {asks.map((a, i) => (
          <div key={`a${i}`} className="flex justify-between tabular-nums">
            <span>{formatPrice(a.price)}</span>
            <span className="text-muted-foreground">{a.size}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

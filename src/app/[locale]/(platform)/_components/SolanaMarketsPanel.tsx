'use client'

import { useState } from 'react'
import SolanaOrderBookCard from '@/app/[locale]/(platform)/_components/SolanaOrderBookCard'
import { useIndexerMarkets } from '@/hooks/useIndexer'
import { cn } from '@/lib/utils'

function short(pubkey: string): string {
  return pubkey.length > 12 ? `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}` : pubkey
}

/**
 * Browse Solana markets (from the indexer /markets read API) and view the
 * selected market's live order book (from the matching engine). End-to-end
 * consumer of both Solana read paths.
 */
export default function SolanaMarketsPanel() {
  const { data: markets, isLoading, isError } = useIndexerMarkets()
  const [selected, setSelected] = useState<string | null>(null)
  const [outcome, setOutcome] = useState(0)

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading markets…</p>
  if (isError) return <p className="text-sm text-destructive">Failed to load markets.</p>
  if ((markets?.length ?? 0) === 0) {
    return <p className="text-sm text-muted-foreground">No Solana markets indexed yet.</p>
  }

  const active = selected ?? markets![0]!.market

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <ul className="space-y-1">
        {markets!.map((m) => (
          <li key={m.market}>
            <button
              type="button"
              onClick={() => setSelected(m.market)}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm',
                m.market === active ? 'bg-muted font-medium' : 'hover:bg-muted/50',
              )}
            >
              <span className="font-mono">{short(m.market)}</span>
              <span className="ml-2 text-muted-foreground">
                {m.resolved ? `resolved (${m.winningOutcome === 0 ? 'YES' : 'NO'})` : 'open'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex gap-2">
          {['YES', 'NO'].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setOutcome(i)}
              className={cn(
                'rounded-md px-3 py-1 text-sm',
                outcome === i ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <SolanaOrderBookCard market={active} outcome={outcome} />
      </div>
    </div>
  )
}

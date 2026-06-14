'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useIndexerPositions } from '@/hooks/useIndexer'

function short(pubkey: string): string {
  return pubkey.length > 12 ? `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}` : pubkey
}

function formatShares(base: string, decimals = 6): string {
  const n = Number(base) / 10 ** decimals
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : base
}

/**
 * Solana positions sourced live from the indexer read API (useIndexerPositions),
 * keyed by the connected Solana wallet. Additive during the EVM->Solana
 * migration — sits alongside the existing EVM portfolio tabs.
 */
export default function SolanaPositionsList() {
  const { publicKey } = useWallet()
  const address = publicKey?.toBase58()
  const { data: positions, isLoading, isError } = useIndexerPositions(address)

  if (!address) return null

  return (
    <section className="mt-4 rounded-lg border border-border p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Solana positions</h2>

      {isLoading && <p className="text-sm text-muted-foreground">Loading positions…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load positions.</p>}
      {!isLoading && !isError && (positions?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">No Solana positions yet.</p>
      )}

      {!isLoading && !isError && (positions?.length ?? 0) > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Market</th>
              <th className="py-1 font-medium">Outcome</th>
              <th className="py-1 text-right font-medium">Shares</th>
            </tr>
          </thead>
          <tbody>
            {positions!.map((p) => (
              <tr key={`${p.market}:${p.outcome}`} className="border-t border-border">
                <td className="py-1 font-mono">{short(p.market)}</td>
                <td className="py-1">{p.outcome === 0 ? 'YES' : 'NO'}</td>
                <td className="py-1 text-right tabular-nums">{formatShares(p.shares)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

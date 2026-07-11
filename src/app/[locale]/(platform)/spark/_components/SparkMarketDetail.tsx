'use client'

import type { SparkMarketListing } from '@/lib/spark-markets'
import { useQuery } from '@tanstack/react-query'
import { ZapIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/formatters'
import { sparkBaseToUsdc, sparkOutcomeSpotPrice } from '@/lib/spark-markets'
import { cn } from '@/lib/utils'
import SparkTradePanel from './SparkTradePanel'

async function fetchSparkMarket(marketId: string): Promise<SparkMarketListing | null> {
  const response = await fetch(`/api/spark/markets?marketId=${encodeURIComponent(marketId)}`)
  if (!response.ok) {
    throw new Error(`Failed to load spark market (${response.status})`)
  }
  const payload = await response.json() as { market?: SparkMarketListing | null }
  return payload.market ?? null
}

export default function SparkMarketDetail({ marketId }: { marketId: string }) {
  const t = useExtracted()
  const { data: listing, isLoading } = useQuery({
    queryKey: ['spark-market', marketId],
    queryFn: () => fetchSparkMarket(marketId),
    staleTime: 15_000,
  })

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <ZapIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">{t('Spark market not found')}</p>
      </div>
    )
  }

  const { config } = listing
  const totalPool = sparkBaseToUsdc(config.totalUsdcDeposited)
  const isResolved = config.status === 'resolved'

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <ZapIcon className="size-3" />
            {t('Spark market')}
          </span>
          <h1 className="text-2xl font-bold">{listing.title}</h1>
          {listing.description && (
            <p className="text-sm text-muted-foreground">{listing.description}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground uppercase">{t('Total pool')}</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalPool)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground uppercase">{t('Outcomes')}</p>
            <p className="text-lg font-semibold tabular-nums">{config.outcomes.length}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground uppercase">{t('Status')}</p>
            <p className="text-lg font-semibold">
              {isResolved ? t('Resolved') : config.status === 'active' ? t('Active') : config.status}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">{t('Outcome pools')}</h2>
          <div className="grid gap-2">
            {config.outcomes.map((outcome) => {
              const isWinner = isResolved && config.winningOutcome === outcome.index
              return (
                <div
                  key={outcome.index}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3',
                    isWinner && 'border-primary bg-primary/10',
                  )}
                >
                  <div>
                    <p className="font-medium">{outcome.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('Locked')}
                      {': '}
                      {formatCurrency(sparkBaseToUsdc(outcome.usdcInCurve))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {isResolved
                        ? (isWinner ? t('Won') : t('Lost'))
                        : formatCurrency(sparkOutcomeSpotPrice(config, outcome.index))}
                    </p>
                    {!isResolved && (
                      <p className="text-xs text-muted-foreground">{t('Curve price')}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {t('Spark markets price each outcome on its own bonding curve. When the market resolves, every pool merges and winners split the total pro-rata — the losing side goes to zero.')}
        </div>
      </div>

      <SparkTradePanel listing={listing} />
    </div>
  )
}

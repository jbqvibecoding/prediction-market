'use client'

import type { Route } from 'next'
import type { SparkMarketListing } from '@/lib/spark-markets'
import { ZapIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import AppLink from '@/components/AppLink'
import { sparkBaseToUsdc, sparkOutcomeSpotPrice } from '@/lib/spark-markets'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'

/**
 * Listing card for a spark (bonding-curve) market: outcome spot prices are
 * derived from each outcome pool's current supply via P(s) = m·s^n — there is
 * no order book.
 */
export default function SparkMarketCard({ listing }: { listing: SparkMarketListing }) {
  const t = useExtracted()
  const { config } = listing
  const poolUsdc = sparkBaseToUsdc(config.totalUsdcDeposited)
  const isResolved = config.status === 'resolved'

  return (
    <AppLink
      href={`/spark/${config.marketId}` as Route}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-semibold">{listing.title}</h3>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <ZapIcon className="size-3" />
          {t('Spark')}
        </span>
      </div>

      <div className="grid gap-1.5">
        {config.outcomes.map((outcome) => {
          const price = sparkOutcomeSpotPrice(config, outcome.index)
          const isWinner = isResolved && config.winningOutcome === outcome.index
          return (
            <div
              key={outcome.index}
              className={cn(
                'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm',
                isWinner && 'border-primary bg-primary/10',
              )}
            >
              <span className="font-medium">{outcome.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {isResolved
                  ? (isWinner ? t('Won') : t('Lost'))
                  : formatCurrency(price)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t('Pool')}
          {': '}
          {formatCurrency(poolUsdc)}
        </span>
        <span>
          {isResolved ? t('Resolved') : t('Live curve')}
        </span>
      </div>
    </AppLink>
  )
}

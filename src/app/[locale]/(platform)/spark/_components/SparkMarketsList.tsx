'use client'

import type { SparkMarketListing } from '@/lib/spark-markets'
import { useQuery } from '@tanstack/react-query'
import { ZapIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'
import SparkMarketCard from './SparkMarketCard'

async function fetchSparkMarkets(): Promise<SparkMarketListing[]> {
  const response = await fetch('/api/spark/markets')
  if (!response.ok) {
    throw new Error(`Failed to load spark markets (${response.status})`)
  }
  const payload = await response.json() as { markets?: SparkMarketListing[] }
  return payload.markets ?? []
}

export default function SparkMarketsList() {
  const t = useExtracted()
  const { data: markets, isLoading } = useQuery({
    queryKey: ['spark-markets'],
    queryFn: fetchSparkMarkets,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} className="h-44 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!markets?.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <ZapIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">{t('No spark markets yet')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('Spark markets trade on a live bonding curve and settle their whole pool to the winning side.')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {markets.map(listing => (
        <SparkMarketCard key={listing.config.marketId} listing={listing} />
      ))}
    </div>
  )
}

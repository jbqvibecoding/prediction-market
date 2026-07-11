import { NextResponse } from 'next/server'
import { isSparkMarketListing } from '@/lib/spark-markets'

/**
 * Spark market listings.
 *
 * Interim data source: the SPARK_MARKETS_JSON env var (a JSON array of
 * SparkMarketListing). This lets ops publish spark markets without a DB
 * migration while the events_futures program + indexer are stood up; once the
 * indexer projects OutcomePool/Market accounts into the DB, this route reads
 * from there instead.
 */
export async function GET(request: Request) {
  let listings: unknown[] = []
  const raw = process.env.SPARK_MARKETS_JSON?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        listings = parsed
      }
    }
    catch (error) {
      console.error('Invalid SPARK_MARKETS_JSON:', error)
    }
  }

  const markets = listings.filter(isSparkMarketListing)

  const marketId = new URL(request.url).searchParams.get('marketId')
  if (marketId) {
    const market = markets.find(item => item.config.marketId === marketId) ?? null
    return NextResponse.json({ market })
  }

  return NextResponse.json({ markets })
}

import type { SparkMarketListing } from '@/lib/spark-markets'
import { NextResponse } from 'next/server'
import { isSparkMarketListing } from '@/lib/spark-markets'

/**
 * Spark market listings.
 *
 * Primary source: the indexer's GET /spark-markets (SPARK_INDEXER_URL), which
 * projects the events_futures program's events into SparkMarketListing objects.
 * Fallback: the SPARK_MARKETS_JSON env var (a JSON array of SparkMarketListing)
 * so ops can publish markets before the indexer is stood up.
 */
async function loadFromIndexer(): Promise<unknown[] | null> {
  const baseUrl = process.env.SPARK_INDEXER_URL?.trim()
  if (!baseUrl) {
    return null
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/spark-markets`, {
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    })
    if (!response.ok) {
      console.error(`Spark indexer responded ${response.status}`)
      return null
    }
    const payload = await response.json() as unknown
    return Array.isArray(payload) ? payload : null
  }
  catch (error) {
    console.error('Spark indexer fetch failed:', error)
    return null
  }
}

function loadFromEnv(): unknown[] {
  const raw = process.env.SPARK_MARKETS_JSON?.trim()
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  }
  catch (error) {
    console.error('Invalid SPARK_MARKETS_JSON:', error)
    return []
  }
}

export async function GET(request: Request) {
  const fromIndexer = await loadFromIndexer()
  const listings = fromIndexer ?? loadFromEnv()
  const markets: SparkMarketListing[] = listings.filter(isSparkMarketListing)

  const marketId = new URL(request.url).searchParams.get('marketId')
  if (marketId) {
    const market = markets.find(item => item.config.marketId === marketId) ?? null
    return NextResponse.json({ market })
  }

  return NextResponse.json({ markets })
}

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import SolanaMarketsPanel from '@/app/[locale]/(platform)/_components/SolanaMarketsPanel'

export const metadata: Metadata = {
  title: 'Solana markets',
}

export default async function SolanaPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="container mx-auto py-6">
      <h1 className="mb-4 text-xl font-semibold">Solana markets</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Live from the indexer (/markets) and the matching engine (order book).
      </p>
      <SolanaMarketsPanel />
    </div>
  )
}

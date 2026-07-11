import type { Metadata } from 'next'
import type { SupportedLocale } from '@/i18n/locales'
import { setRequestLocale } from 'next-intl/server'
import SparkMarketDetail from '@/app/[locale]/(platform)/spark/_components/SparkMarketDetail'

export const metadata: Metadata = {
  title: 'Spark Market',
}

export default async function SparkMarketPage({ params }: PageProps<'/[locale]/spark/[marketId]'>) {
  const { locale, marketId } = await params
  setRequestLocale(locale as SupportedLocale)

  return (
    <main className="container mx-auto py-6">
      <SparkMarketDetail marketId={marketId} />
    </main>
  )
}

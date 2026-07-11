import type { Metadata } from 'next'
import type { SupportedLocale } from '@/i18n/locales'
import { getExtracted, setRequestLocale } from 'next-intl/server'
import SparkMarketsList from '@/app/[locale]/(platform)/spark/_components/SparkMarketsList'

export const metadata: Metadata = {
  title: 'Spark Markets',
}

export default async function SparkPage({ params }: PageProps<'/[locale]/spark'>) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)
  const t = await getExtracted()

  return (
    <main className="container mx-auto space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('Spark Markets')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('Event futures on a live bonding curve — buy outcomes early, winners split the whole pool.')}
        </p>
      </div>
      <SparkMarketsList />
    </main>
  )
}

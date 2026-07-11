import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import AdminSparkCreateForm from '@/app/[locale]/admin/spark/_components/AdminSparkCreateForm'

export const metadata: Metadata = {
  title: 'Spark Markets',
}

export default async function AdminSparkPage({ params }: PageProps<'/[locale]/admin/spark'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return <AdminSparkCreateForm />
}

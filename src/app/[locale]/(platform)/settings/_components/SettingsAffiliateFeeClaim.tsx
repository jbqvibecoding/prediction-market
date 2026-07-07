'use client'

import { ArrowDownToLineIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/formatters'

/**
 * Solana: affiliate fee claiming was an EVM deposit-wallet on-chain flow (read
 * claimable fees + signed claim) with no Solana equivalent yet, so it is
 * disabled. The settings card is kept present but inert until claiming is
 * reimplemented for Solana; all wagmi/viem/deposit-wallet usage is removed.
 */
export default function SettingsAffiliateFeeClaim() {
  const t = useExtracted()

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{t('Affiliate Commissions')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('{amount} available to claim', { amount: formatCurrency(0) })}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => toast.info(t('Affiliate fee claiming is not available yet.'))}
        >
          <ArrowDownToLineIcon className="size-4" />
          {t('Claim')}
        </Button>
      </div>
    </div>
  )
}

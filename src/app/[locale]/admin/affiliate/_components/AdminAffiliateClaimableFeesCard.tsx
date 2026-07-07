'use client'

import { ArrowDownToLineIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatCurrency } from '@/lib/formatters'

interface AdminAffiliateClaimableFeesCardProps {
  feeRecipientWallet: string
}

/**
 * Solana: affiliate fee claiming (deposit-wallet and connected-EOA paths) was an
 * EVM on-chain flow with no Solana equivalent yet, so it is disabled. The card
 * is kept present but inert until claiming is reimplemented for Solana; all
 * wagmi/viem/appkit/deposit-wallet usage is removed.
 */
export default function AdminAffiliateClaimableFeesCard(
  _props: AdminAffiliateClaimableFeesCardProps,
) {
  const t = useExtracted()
  const disabledMessage = t('Affiliate fee claiming is not available yet.')

  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground uppercase">{t('Your Claimable fees')}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-2xl font-semibold">{formatCurrency(0)}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                size="icon"
                className="size-8 rounded-md"
                onClick={() => toast.info(disabledMessage)}
                aria-label={disabledMessage}
              >
                <ArrowDownToLineIcon className="size-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64 text-left">
            {disabledMessage}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

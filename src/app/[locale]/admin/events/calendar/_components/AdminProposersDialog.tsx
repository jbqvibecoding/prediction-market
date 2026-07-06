'use client'

import type { ProposerWhitelistStatus } from '@/lib/proposer-whitelist'
import { useExtracted } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AdminProposersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialCreatorAddress?: string | null
  lockCreatorSelection?: boolean
  onStatusChange?: (status: ProposerWhitelistStatus) => void
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Solana note: the EVM per-creator "proposer whitelist" contracts have no
 * on-chain analog here. In the conditional_token program each market's
 * `Condition` stores a single `authority` (set at market creation) that is the
 * only wallet allowed to `resolve` it — there is no separate proposer list to
 * deploy or manage.
 *
 * This dialog is therefore an informational stub. It preserves the previous
 * props contract and reports an "ok" whitelist status so the create-event flow
 * (which gated on `whitelistAddress`) is not blocked. The old EVM whitelist
 * deployment/management UI (CREATE2, wagmi/viem) is removed.
 */
export default function AdminProposersDialog({
  open,
  onOpenChange,
  initialCreatorAddress,
  onStatusChange,
}: AdminProposersDialogProps) {
  const t = useExtracted()

  useEffect(() => {
    if (!open) {
      return
    }
    const creator = (
      initialCreatorAddress && initialCreatorAddress.startsWith('0x')
        ? initialCreatorAddress
        : ZERO_ADDRESS
    ) as ProposerWhitelistStatus['creator']
    onStatusChange?.({
      creator,
      registryAddress: creator,
      // Non-null so callers treat resolution permission as satisfied — on
      // Solana the resolve authority is bound to the condition at creation.
      whitelistAddress: creator,
      proposers: [],
      hasServerSigner: true,
    })
  }, [open, initialCreatorAddress, onStatusChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Resolution authority')}</DialogTitle>
          <DialogDescription>
            {t('On Solana the wallet allowed to resolve a market is set when the market is created. There is no separate proposer whitelist to manage here.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

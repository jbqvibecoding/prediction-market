'use client'

import type { MouseEvent } from 'react'
import type { DirectResolutionOutcome } from '@/lib/direct-resolution'
import type { Event } from '@/types'
import { useExtracted } from 'next-intl'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useConditionalToken } from '@/hooks/useConditionalToken'
import { useSignaturePromptRunner } from '@/hooks/useSignaturePromptRunner'
import { OUTCOME_INDEX } from '@/lib/constants'
import { isDirectResolutionMarket } from '@/lib/direct-resolution'
import { cn } from '@/lib/utils'

interface DirectResolutionButtonProps {
  market: Event['markets'][number]
  event: Event
  size?: 'sm' | 'default'
  className?: string
  disabled?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

type DirectResolutionState = 'idle' | 'pending' | 'submitted' | 'resolved' | 'error'

function getOutcomeLabel(market: Event['markets'][number], outcomeIndex: number, fallback: string) {
  return market.outcomes.find(outcome => outcome.outcome_index === outcomeIndex)?.outcome_text || fallback
}

function getResolutionSource(market: Event['markets'][number]) {
  return market.resolution_source_url?.trim() || market.resolution_source?.trim() || ''
}

export default function DirectResolutionButton({
  market,
  event,
  size = 'sm',
  className,
  disabled = false,
  onClick,
}: DirectResolutionButtonProps) {
  const t = useExtracted()
  const { resolve: resolveConditional, connected } = useConditionalToken()
  const { runWithSignaturePrompt } = useSignaturePromptRunner()
  const rulesCheckboxId = useId()
  const sourceCheckboxId = useId()
  const [open, setOpen] = useState(false)
  const [selectedOutcome, setSelectedOutcome] = useState<DirectResolutionOutcome | null>(null)
  const [rulesConfirmed, setRulesConfirmed] = useState(false)
  const [sourceConfirmed, setSourceConfirmed] = useState(false)
  const [state, setState] = useState<DirectResolutionState>('idle')
  const [message, setMessage] = useState('')

  const isDirect = isDirectResolutionMarket(market)
  const resolutionSource = getResolutionSource(market)
  const requiresSourceConfirmation = Boolean(resolutionSource)
  const isResolved = Boolean(market.is_resolved || market.condition?.resolved)
  const canSubmit = Boolean(
    isDirect
    && connected
    && selectedOutcome
    && selectedOutcome !== 'unknown'
    && rulesConfirmed
    && (!requiresSourceConfirmation || sourceConfirmed)
    && state !== 'pending'
    && !isResolved,
  )

  // The Solana conditional-token program is binary (YES/NO) — there is no
  // on-chain "unknown" outcome, so it is not offered.
  const outcomeOptions = useMemo<Array<{ value: DirectResolutionOutcome, label: string }>>(() => [
    { value: 'yes', label: getOutcomeLabel(market, OUTCOME_INDEX.YES, t('Yes')) },
    { value: 'no', label: getOutcomeLabel(market, OUTCOME_INDEX.NO, t('No')) },
  ], [market, t])

  async function openDialog(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event)
    if (event.defaultPrevented) {
      return
    }
    setOpen(true)
    setSelectedOutcome(null)
    setRulesConfirmed(false)
    setSourceConfirmed(false)
    if (isResolved) {
      setState('resolved')
      setMessage(t('This market is already resolved.'))
      return
    }
    setState('idle')
    setMessage('')
    if (!connected) {
      setMessage(t('Connect an authorized proposer wallet to resolve this market.'))
    }
  }

  async function submitResolution() {
    if (!connected || !selectedOutcome) {
      toast.error(t('Wallet connection is not ready.'))
      return
    }

    const conditionId = market.condition_id
    if (!conditionId) {
      setState('error')
      setMessage(t('This market is not ready for direct resolution yet.'))
      return
    }

    // yes -> OUTCOME_YES (0), no -> OUTCOME_NO (1); the program enforces that
    // only the condition authority may resolve.
    const winningOutcome = selectedOutcome === 'yes' ? 0 : selectedOutcome === 'no' ? 1 : -1
    if (winningOutcome < 0) {
      setState('error')
      setMessage(t('This outcome cannot be resolved on-chain.'))
      return
    }

    setState('pending')
    setMessage('')
    try {
      await runWithSignaturePrompt(() => resolveConditional({
        market: conditionId,
        winningOutcome,
      }), {
        title: t('Submit final result'),
        description: t('Open your wallet and approve the final result transaction.'),
      })

      setState('submitted')
      setMessage(t('Result submitted. The market will update shortly.'))
      toast.success(t('Resolution submitted.'))
    }
    catch (error) {
      console.error('Direct resolution failed:', error)
      setState('error')
      setMessage(error instanceof Error
        ? error.message
        : t('Could not submit resolution.'))
    }
  }

  if (!isDirect) {
    return null
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={cn('shrink-0', className)}
        disabled={disabled || isResolved}
        onClick={openDialog}
      >
        {t('Propose resolution')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('Propose resolution')}</DialogTitle>
            <DialogDescription>
              {t('The selected result is final after an approved proposer submits it.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t('Final outcome')}</Label>
              <div className="grid gap-2">
                {outcomeOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'rounded-md border px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-muted',
                      selectedOutcome === option.value && 'border-primary bg-primary/10 text-primary',
                    )}
                    onClick={() => setSelectedOutcome(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label htmlFor={rulesCheckboxId} className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                id={rulesCheckboxId}
                checked={rulesConfirmed}
                onCheckedChange={checked => setRulesConfirmed(checked === true)}
              />
              <span>
                {t('I have read the market rules and will resolve according to them.')}
              </span>
            </label>

            {requiresSourceConfirmation && (
              <label htmlFor={sourceCheckboxId} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <Checkbox
                  id={sourceCheckboxId}
                  checked={sourceConfirmed}
                  onCheckedChange={checked => setSourceConfirmed(checked === true)}
                />
                <span>
                  {t('The final result is published at the listed resolution source and I checked it.')}
                </span>
              </label>
            )}

            {message && (
              <p className={cn(
                'rounded-md border px-3 py-2 text-sm',
                state === 'error'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'text-muted-foreground',
              )}
              >
                {message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => void submitResolution()}>
              {state === 'pending'
                ? t('Submitting...')
                : t('Submit final result')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

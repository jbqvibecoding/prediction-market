'use client'

import type { SparkMarketListing } from '@/lib/spark-markets'
import { useExtracted } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSparkMarket } from '@/hooks/useSparkMarket'
import { useWalletConnection } from '@/hooks/useWalletConnection'
import { formatCurrency } from '@/lib/formatters'
import {
  parseSparkCurve,
  sparkBaseToTokens,
  sparkBaseToUsdc,
  SPARK_USDC_UNIT,
  sparkOutcomeSpotPrice,
} from '@/lib/spark-markets'
import {
  sparkClaimPayout,
  sparkMintCost,
  sparkTokensForUsdc,
} from '@/lib/solana/spark'
import { isUserRejectedRequestError } from '@/lib/wallet'
import { cn } from '@/lib/utils'

type TradeSide = 'buy' | 'sell'

function toBaseUnits(value: string): bigint {
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0n
  }
  return BigInt(Math.floor(numeric * SPARK_USDC_UNIT))
}

/**
 * Bonding-curve trade panel for spark markets. Buy = mint outcome tokens along
 * P(s) = m·s^n (USDC → tokens via the bisection inverse); sell = redeem back
 * along the curve. No order book — the price preview comes from the curve
 * integral. After resolution, the winning outcome claims the parimutuel pool.
 */
export default function SparkTradePanel({ listing }: { listing: SparkMarketListing }) {
  const t = useExtracted()
  const { config } = listing
  const { isConnected, open } = useWalletConnection()
  const { mint, redeem, claim } = useSparkMarket()
  const [side, setSide] = useState<TradeSide>('buy')
  const [outcomeIndex, setOutcomeIndex] = useState(config.outcomes[0]?.index ?? 0)
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const curve = useMemo(() => parseSparkCurve(config), [config])
  const outcome = config.outcomes.find(item => item.index === outcomeIndex) ?? config.outcomes[0]
  const supply = BigInt(outcome?.currentSupply ?? '0')
  const spotPrice = outcome ? sparkOutcomeSpotPrice(config, outcome.index) : 0
  const isResolved = config.status === 'resolved'
  const isActive = config.status === 'active'

  const amountBase = toBaseUnits(amount)

  const preview = useMemo(() => {
    if (!outcome || amountBase <= 0n) {
      return null
    }
    if (side === 'buy') {
      const tokensOut = sparkTokensForUsdc(curve, supply, amountBase)
      if (tokensOut <= 0n) {
        return null
      }
      const avgPrice = Number(amountBase) / Number(tokensOut)
      return {
        primary: `${sparkBaseToTokens(tokensOut).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${outcome.label}`,
        avgPrice,
        impact: spotPrice > 0 ? (avgPrice - spotPrice) / spotPrice : 0,
      }
    }
    const tokensIn = amountBase
    if (tokensIn > supply) {
      return null
    }
    const proceeds = sparkMintCost(curve, supply - tokensIn, supply)
    const avgPrice = tokensIn > 0n ? Number(proceeds) / Number(tokensIn) : 0
    return {
      primary: formatCurrency(sparkBaseToUsdc(proceeds)),
      avgPrice,
      impact: spotPrice > 0 ? (avgPrice - spotPrice) / spotPrice : 0,
    }
  }, [amountBase, curve, outcome, side, spotPrice, supply])

  const claimPreview = useMemo(() => {
    if (!isResolved || config.winningOutcome == null) {
      return null
    }
    const winning = config.outcomes.find(item => item.index === config.winningOutcome)
    if (!winning) {
      return null
    }
    const totalPool = BigInt(config.totalUsdcDeposited) - BigInt(config.totalFeesCollected)
    // Per-token payout preview (the claim burns the holder's full balance).
    const perToken = sparkClaimPayout(BigInt(SPARK_USDC_UNIT), totalPool, BigInt(winning.currentSupply))
    return { label: winning.label, perToken: sparkBaseToUsdc(perToken) }
  }, [config, isResolved])

  async function submitTrade() {
    if (!isConnected) {
      open()
      return
    }
    if (!outcome || amountBase <= 0n) {
      toast.error(t('Enter a valid amount.'))
      return
    }
    setIsSubmitting(true)
    try {
      const args = { marketId: config.marketId, outcomeIndex: outcome.index, amount: amountBase }
      const signature = side === 'buy' ? await mint(args) : await redeem(args)
      toast.success(side === 'buy' ? t('Buy submitted') : t('Sell submitted'), {
        description: signature,
      })
      setAmount('')
    }
    catch (error) {
      console.error('Spark trade failed:', error)
      toast.error(isUserRejectedRequestError(error)
        ? t('You rejected the signature request.')
        : error instanceof Error ? error.message : t('Could not submit the trade.'))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function submitClaim() {
    if (!isConnected) {
      open()
      return
    }
    if (config.winningOutcome == null) {
      return
    }
    setIsSubmitting(true)
    try {
      const signature = await claim({ marketId: config.marketId, outcomeIndex: config.winningOutcome })
      toast.success(t('Claim submitted'), { description: signature })
    }
    catch (error) {
      console.error('Spark claim failed:', error)
      toast.error(isUserRejectedRequestError(error)
        ? t('You rejected the signature request.')
        : error instanceof Error ? error.message : t('Could not submit the claim.'))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  if (isResolved) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <h3 className="font-semibold">{t('Claim winnings')}</h3>
        {claimPreview && (
          <p className="text-sm text-muted-foreground">
            {t('{outcome} won. Each winning share redeems for about {amount} from the shared pool.', {
              outcome: claimPreview.label,
              amount: formatCurrency(claimPreview.perToken),
            })}
          </p>
        )}
        <Button type="button" className="w-full" disabled={isSubmitting} onClick={() => void submitClaim()}>
          {isConnected ? t('Claim') : t('Connect wallet')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['buy', 'sell'] as const).map(option => (
          <button
            key={option}
            type="button"
            className={cn(
              'rounded-md py-1.5 text-sm font-semibold transition-colors',
              side === option ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
            onClick={() => setSide(option)}
          >
            {option === 'buy' ? t('Buy') : t('Sell')}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <Label>{t('Outcome')}</Label>
        <div className="grid gap-1.5">
          {config.outcomes.map(item => (
            <button
              key={item.index}
              type="button"
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted',
                outcomeIndex === item.index && 'border-primary bg-primary/10',
              )}
              onClick={() => setOutcomeIndex(item.index)}
            >
              <span>{item.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatCurrency(sparkOutcomeSpotPrice(config, item.index))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="spark-amount">
          {side === 'buy' ? t('Amount (USDC)') : t('Shares to sell')}
        </Label>
        <Input
          id="spark-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder="0.00"
        />
      </div>

      {preview && (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{side === 'buy' ? t('You receive') : t('You get back')}</span>
            <span className="font-semibold tabular-nums">{preview.primary}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Avg price')}</span>
            <span className="tabular-nums">{formatCurrency(preview.avgPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Price impact')}</span>
            <span className="tabular-nums">
              {`${(preview.impact * 100).toFixed(2)}%`}
            </span>
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={isSubmitting || !isActive || (isConnected && amountBase <= 0n)}
        onClick={() => void submitTrade()}
      >
        {!isConnected
          ? t('Connect wallet')
          : side === 'buy'
            ? t('Buy {outcome}', { outcome: outcome?.label ?? '' })
            : t('Sell {outcome}', { outcome: outcome?.label ?? '' })}
      </Button>
    </div>
  )
}

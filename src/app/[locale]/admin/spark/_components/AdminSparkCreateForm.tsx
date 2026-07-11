'use client'

import type { SparkMarketListing } from '@/lib/spark-markets'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { PlusIcon, Trash2Icon, ZapIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getSolanaConfig } from '@/lib/solana/config'
import {
  buildAddSparkOutcomeInstruction,
  buildCreateSparkMarketInstruction,
  deriveOutcomeMint,
  deriveSparkVault,
} from '@/lib/solana/spark'
import { isUserRejectedRequestError } from '@/lib/wallet'

/**
 * Admin creation for spark (event-futures) markets. Builds the on-chain
 * create_market + add_outcome instructions for the events_futures program and
 * sends them with the connected Solana wallet, then emits the
 * SparkMarketListing JSON to publish via SPARK_MARKETS_JSON (the interim
 * listing source until the indexer projects spark markets into the DB).
 *
 * Deliberately separate from AdminCreateEventForm: spark uses a different
 * program and market model (bonding curve, no order book / oracle plan).
 */
export default function AdminSparkCreateForm() {
  const t = useExtracted()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [title, setTitle] = useState('')
  const [marketId, setMarketId] = useState(() => `${Date.now()}`)
  const [outcomes, setOutcomes] = useState<string[]>(['Yes', 'No'])
  // Curve P(s) = m·s^2 (quadratic MVP). m = mNum/mDen with USDC 6-decimals
  // base units; the default 1/1e12 prices one whole token at $1 when supply
  // reaches 1M whole tokens.
  const [mNum, setMNum] = useState('1')
  const [mDen, setMDen] = useState('1000000000000')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [listingJson, setListingJson] = useState('')

  const normalizedOutcomes = useMemo(
    () => outcomes.map(label => label.trim()).filter(Boolean),
    [outcomes],
  )
  const canSubmit = Boolean(
    title.trim()
    && /^\d+$/.test(marketId.trim())
    && normalizedOutcomes.length >= 2
    && /^\d+$/.test(mNum.trim())
    && /^\d+$/.test(mDen.trim())
    && !isSubmitting,
  )

  function updateOutcome(index: number, value: string) {
    setOutcomes(previous => previous.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  function buildListing(): SparkMarketListing {
    const id = BigInt(marketId.trim())
    return {
      title: title.trim(),
      config: {
        marketId: id.toString(),
        outcomeCount: normalizedOutcomes.length,
        curve: { mNum: mNum.trim(), mDen: mDen.trim(), nNum: '2', nDen: '1' },
        vault: deriveSparkVault(id).toBase58(),
        totalUsdcDeposited: '0',
        totalFeesCollected: '0',
        status: 'active',
        winningOutcome: null,
        outcomes: normalizedOutcomes.map((label, index) => ({
          index,
          label,
          mint: deriveOutcomeMint(id, index).toBase58(),
          currentSupply: '0',
          usdcInCurve: '0',
        })),
      },
    }
  }

  async function handleCreate() {
    if (!publicKey || !sendTransaction) {
      toast.error(t('Connect a Solana wallet first.'))
      return
    }
    if (!canSubmit) {
      return
    }

    setIsSubmitting(true)
    try {
      const id = BigInt(marketId.trim())
      const collateralMint = new PublicKey(getSolanaConfig().collateralMint)
      const tx = new Transaction()
      tx.add(buildCreateSparkMarketInstruction({
        marketId: id,
        creator: publicKey,
        collateralMint,
        title: title.trim().slice(0, 128),
        curve: { mNum: BigInt(mNum.trim()), mDen: BigInt(mDen.trim()), nNum: 2n, nDen: 1n },
      }))
      for (const [index, label] of normalizedOutcomes.entries()) {
        tx.add(buildAddSparkOutcomeInstruction({
          marketId: id,
          outcomeIndex: index,
          admin: publicKey,
          label: label.slice(0, 64),
        }))
      }

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction(signature, 'confirmed')
      toast.success(t('Spark market created on-chain.'), { description: signature })
      setListingJson(JSON.stringify(buildListing(), null, 2))
    }
    catch (error) {
      console.error('Spark market creation failed:', error)
      toast.error(isUserRejectedRequestError(error)
        ? t('You rejected the signature request.')
        : error instanceof Error ? error.message : t('Could not create the spark market.'))
      // Still emit the listing JSON so the market can be published once the
      // on-chain step succeeds (e.g. when the program is deployed).
      setListingJson(JSON.stringify(buildListing(), null, 2))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ZapIcon className="size-5 text-primary" />
          {t('Create Spark Market')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('Spark markets price outcomes on a quadratic bonding curve and settle parimutuel — the whole pool goes to the winning side.')}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="spark-title">{t('Title')}</Label>
        <Input
          id="spark-title"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('Will BTC close the year above $150K?')}
          maxLength={128}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="spark-market-id">{t('Market ID (u64)')}</Label>
        <Input
          id="spark-market-id"
          value={marketId}
          onChange={event => setMarketId(event.target.value)}
          inputMode="numeric"
        />
      </div>

      <div className="grid gap-2">
        <Label>{t('Outcomes')}</Label>
        <div className="grid gap-1.5">
          {outcomes.map((label, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="flex items-center gap-2">
              <Input
                value={label}
                onChange={event => updateOutcome(index, event.target.value)}
                placeholder={t('Outcome label')}
                maxLength={64}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={outcomes.length <= 2}
                onClick={() => setOutcomes(previous => previous.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={outcomes.length >= 8}
          onClick={() => setOutcomes(previous => [...previous, ''])}
        >
          <PlusIcon className="size-4" />
          {t('Add outcome')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="spark-m-num">{t('Curve m numerator')}</Label>
          <Input id="spark-m-num" value={mNum} onChange={event => setMNum(event.target.value)} inputMode="numeric" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="spark-m-den">{t('Curve m denominator')}</Label>
          <Input id="spark-m-den" value={mDen} onChange={event => setMDen(event.target.value)} inputMode="numeric" />
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          {t('Price curve is P(s) = (m numerator / m denominator) × s². The exponent is fixed to 2 in this version.')}
        </p>
      </div>

      <Button type="button" disabled={!canSubmit} onClick={() => void handleCreate()}>
        {isSubmitting ? t('Creating...') : t('Create on-chain')}
      </Button>

      {listingJson && (
        <div className="grid gap-2">
          <Label htmlFor="spark-listing-json">{t('Listing JSON (publish via SPARK_MARKETS_JSON)')}</Label>
          <Textarea
            id="spark-listing-json"
            readOnly
            value={listingJson}
            rows={12}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t('Add this object to the SPARK_MARKETS_JSON array so the market appears in the /spark listing.')}
          </p>
        </div>
      )}
    </div>
  )
}

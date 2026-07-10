'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { useExtracted } from 'next-intl'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBalance } from '@/hooks/useBalance'

const ADMIN_SOL_BALANCE_QUERY_KEY = 'admin-sol-balance'
const LAMPORTS_PER_SOL = 1_000_000_000

function formatAdminBalance(value: number | null | undefined, decimals = 2) {
  if (!Number.isFinite(value)) {
    return '0.00'
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Solana: admin header balances read the connected wallet's SOL (native gas,
 * replacing the EVM POL/native read) and USDC (via the Solana `useBalance`).
 */
export default function AdminHeaderBalances() {
  const t = useExtracted()
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const address = publicKey?.toBase58() ?? null

  const { balance: usdcBalance, isLoadingBalance: isLoadingUsdcBalance } = useBalance({
    enabled: Boolean(address),
  })

  const { data: solBalance, isLoading: isLoadingSolBalance } = useQuery({
    queryKey: [ADMIN_SOL_BALANCE_QUERY_KEY, address],
    enabled: Boolean(address),
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      if (!address) {
        return 0
      }
      const lamports = await connection.getBalance(new PublicKey(address))
      return lamports / LAMPORTS_PER_SOL
    },
  })

  const handleCopy = useCallback(async () => {
    if (!address) {
      return
    }

    try {
      await navigator.clipboard.writeText(address)
      toast.success(t('Wallet address copied.'))
    }
    catch (error) {
      console.error('Failed to copy admin wallet address:', error)
      toast.error(t('Could not copy wallet address.'))
    }
  }, [address, t])

  return (
    <div className="grid grid-cols-2 gap-x-1">
      <Button
        type="button"
        variant="ghost"
        size="header"
        className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-[6px] px-2.5 py-1"
        onClick={() => void handleCopy()}
        disabled={!address}
      >
        <div className="translate-y-px text-xs/tight font-medium text-muted-foreground">{t('Admin SOL')}</div>
        <div className="-translate-y-px text-base/tight font-semibold text-foreground">
          {isLoadingSolBalance
            ? <Skeleton className="h-5 w-12" />
            : formatAdminBalance(solBalance)}
        </div>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="header"
        className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-[6px] px-2.5 py-1"
        onClick={() => void handleCopy()}
        disabled={!address}
      >
        <div className="translate-y-px text-xs/tight font-medium text-muted-foreground">{t('Admin USDC')}</div>
        <div className="-translate-y-px text-base/tight font-semibold text-foreground">
          {isLoadingUsdcBalance
            ? <Skeleton className="h-5 w-12" />
            : formatAdminBalance(usdcBalance.raw)}
        </div>
      </Button>
    </div>
  )
}

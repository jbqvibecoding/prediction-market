'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { associatedTokenAddress } from '@/lib/solana/conditional-token'
import { getSolanaConfig } from '@/lib/solana/config'

interface Balance {
  raw: number
  text: string
  symbol: string
}

export const DEPOSIT_WALLET_BALANCE_QUERY_KEY = 'deposit-wallet-usdc-balance'

const INITIAL_STATE: Balance = {
  raw: 0.0,
  text: '0.00',
  symbol: 'USDC',
}

interface UseBalanceOptions {
  enabled?: boolean
  /** Legacy EVM deposit-wallet option; ignored on Solana (connected wallet is used). */
  depositWalletAddress?: string | null
}

/**
 * USDC balance of the connected Solana wallet (its collateral-mint associated
 * token account). Replaces the EVM ERC-20 balanceOf read on the deposit wallet.
 */
export function useBalance(options: UseBalanceOptions = {}) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const owner = publicKey?.toBase58() ?? null

  const isOptionsEnabled = options.enabled ?? true
  const isQueryEnabled = Boolean(owner && isOptionsEnabled)

  const {
    data,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [DEPOSIT_WALLET_BALANCE_QUERY_KEY, owner],
    enabled: isQueryEnabled,
    staleTime: 'static',
    gcTime: 5 * 60 * 1000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<Balance> => {
      if (!owner) {
        return INITIAL_STATE
      }
      try {
        const { collateralMint } = getSolanaConfig()
        const ata = associatedTokenAddress(new PublicKey(collateralMint), new PublicKey(owner))
        const result = await connection.getTokenAccountBalance(ata)
        const raw = result.value.uiAmount ?? 0
        return {
          raw,
          text: raw.toFixed(2),
          symbol: 'USDC',
        }
      }
      catch {
        // ATA not yet created / RPC error -> treat as zero balance.
        return INITIAL_STATE
      }
    },
  })

  const balance = isQueryEnabled && data ? data : INITIAL_STATE
  const isLoadingBalance = isQueryEnabled ? (isLoading || (!data && isFetching)) : false

  return {
    balance,
    isLoadingBalance,
    refetchBalance: refetch,
  }
}

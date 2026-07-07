'use client'

import type { Event } from '@/types'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { OUTCOME_INDEX } from '@/lib/constants'
import {
  associatedTokenAddress,
  deriveCondition,
  deriveNoMint,
  deriveYesMint,
} from '@/lib/solana/conditional-token'

export interface SharesByCondition {
  [conditionId: string]: {
    [OUTCOME_INDEX.YES]: number
    [OUTCOME_INDEX.NO]: number
  }
}

interface UseUserShareBalancesOptions {
  event?: Event
  /** Legacy EVM owner; ignored on Solana (connected wallet is used). */
  ownerAddress?: string | null
}

async function readUiAmount(
  connection: ReturnType<typeof useConnection>['connection'],
  ata: PublicKey,
): Promise<number> {
  try {
    const result = await connection.getTokenAccountBalance(ata)
    return result.value.uiAmount ?? 0
  }
  catch {
    // ATA not created yet -> zero shares.
    return 0
  }
}

/**
 * The connected wallet's YES/NO outcome-token balances per market condition,
 * read from the Solana conditional-token program's SPL mints. Replaces the EVM
 * ERC-1155 balanceOfBatch read.
 */
export function useUserShareBalances({ event }: UseUserShareBalancesOptions) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const owner = publicKey?.toBase58() ?? null

  const conditionIds = useMemo(() => {
    if (!event?.markets?.length) {
      return []
    }
    return Array.from(
      new Set(event.markets.map(market => market.condition_id).filter(Boolean)),
    )
  }, [event])

  const descriptorKey = conditionIds.join('|')

  const query = useQuery({
    queryKey: ['user-conditional-shares', owner, event?.slug, descriptorKey],
    enabled: Boolean(owner && conditionIds.length),
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<SharesByCondition> => {
      if (!owner || !conditionIds.length) {
        return {}
      }
      const ownerPk = new PublicKey(owner)
      const acc: SharesByCondition = {}

      await Promise.all(conditionIds.map(async (conditionId) => {
        let market: PublicKey
        try {
          market = new PublicKey(conditionId)
        }
        catch {
          // condition_id is not a valid Solana pubkey -> skip.
          return
        }
        const condition = deriveCondition(market)
        const [yes, no] = await Promise.all([
          readUiAmount(connection, associatedTokenAddress(deriveYesMint(condition), ownerPk)),
          readUiAmount(connection, associatedTokenAddress(deriveNoMint(condition), ownerPk)),
        ])
        acc[conditionId] = {
          [OUTCOME_INDEX.YES]: yes,
          [OUTCOME_INDEX.NO]: no,
        }
      }))

      return acc
    },
  })

  const sharesByCondition = useMemo(() => query.data ?? {}, [query.data])

  return {
    ...query,
    sharesByCondition,
  }
}

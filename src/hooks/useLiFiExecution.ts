import type { LiFiWalletTokenItem } from '@/hooks/useLiFiWalletTokens'
import { useMutation } from '@tanstack/react-query'

interface UseLiFiExecutionParams {
  fromToken?: LiFiWalletTokenItem | null
  amountValue: string
  fromAddress?: string | null
  toAddress?: string | null
}

/**
 * Solana: the LiFi EVM cross-chain bridge/swap has no Solana funding path, so it
 * is disabled — fund the Solana wallet with USDC directly instead. This hook is
 * kept as a throwing stub so its consumers (WalletModal / WalletConfirmStep)
 * still compile and any attempt to execute a bridge fails safely without ever
 * sending an EVM approval/bridge transaction. The whole LiFi surface (hooks,
 * API routes, UI) is removed in G.
 */
export function useLiFiExecution(_params: UseLiFiExecutionParams) {
  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      throw new Error('Cross-chain bridge funding is not available. Send USDC to your wallet directly.')
    },
  })

  return {
    execute: mutation.mutateAsync,
    isExecuting: mutation.isPending,
    executionError: mutation.error,
    executionHash: mutation.data,
  }
}

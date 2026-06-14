/**
 * Solana runtime configuration for the prediction-market client.
 *
 * These replace Kuest's EVM contract/network config (contracts.ts, network.ts)
 * and the external CLOB_URL/DATA_URL services with the Solana programs and the
 * self-hosted matching-engine + indexer.
 */
export interface SolanaConfig {
  rpcUrl: string
  /** Off-chain matching engine base URL (replaces CLOB_URL). */
  matchingEngineUrl: string
  /** Indexer base URL (replaces DATA_URL / USER_PNL_URL). */
  indexerUrl: string
  exchangeProgramId: string
  conditionalTokenProgramId: string
  collateralMint: string
}

function env(name: string, fallback = ''): string {
  // NEXT_PUBLIC_* are inlined at build time on the client.
  return process.env[name] ?? fallback
}

export function getSolanaConfig(): SolanaConfig {
  return {
    rpcUrl: env('NEXT_PUBLIC_SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
    matchingEngineUrl: env('NEXT_PUBLIC_MATCHING_ENGINE_URL', 'http://localhost:9100'),
    indexerUrl: env('NEXT_PUBLIC_INDEXER_URL', 'http://localhost:9200'),
    exchangeProgramId: env('NEXT_PUBLIC_EXCHANGE_PROGRAM_ID'),
    conditionalTokenProgramId: env('NEXT_PUBLIC_CONDITIONAL_TOKEN_PROGRAM_ID'),
    collateralMint: env('NEXT_PUBLIC_COLLATERAL_MINT'),
  }
}

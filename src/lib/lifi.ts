import 'server-only'

/**
 * Solana: the LiFi cross-chain bridge is disabled (no Solana funding path), so
 * server-side LiFi SDK configuration is a no-op. Kept as an exported stub for
 * the LiFi API routes that still import it.
 */
export async function ensureLiFiServerConfig(): Promise<void> {
  // no-op
}

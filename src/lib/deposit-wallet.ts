import type { Address, TypedDataDomain } from '@/lib/eth-utils'
import { DEFAULT_CHAIN_ID } from '@/lib/network'

const DEPOSIT_WALLET_DOMAIN_NAME = 'DepositWallet'
const DEPOSIT_WALLET_DOMAIN_VERSION = '1'
export const DEPOSIT_WALLET_BATCH_DEADLINE_SECONDS = 240

/**
 * Solana: there is no EVM deposit-wallet (smart-contract wallet). Trading uses
 * the connected Solana wallet directly. These helpers are retained as viem-free
 * stubs for the remaining callers — deposit wallets are never predicted or
 * deployed on Solana.
 */
export function getDepositWalletDomain(depositWallet: Address): TypedDataDomain {
  return {
    name: DEPOSIT_WALLET_DOMAIN_NAME,
    version: DEPOSIT_WALLET_DOMAIN_VERSION,
    chainId: DEFAULT_CHAIN_ID,
    verifyingContract: depositWallet,
  }
}

export async function getDepositWalletAddress(_owner: Address): Promise<Address> {
  throw new Error('Deposit wallets are not available on Solana.')
}

export async function isDepositWalletDeployed(_address?: Address | string | null) {
  return false
}

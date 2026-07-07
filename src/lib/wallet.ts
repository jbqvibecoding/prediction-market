export function isUserRejectedRequestError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const name = 'name' in error ? (error as { name?: string }).name : undefined
    // viem UserRejectedRequestError (legacy) or Solana wallet-adapter rejections.
    if (name === 'UserRejectedRequestError' || name === 'WalletSignTransactionError') {
      return true
    }

    const message = 'message' in error ? (error as { message?: string }).message : undefined
    if (typeof message === 'string' && /user rejected|user denied|rejected the request/i.test(message)) {
      return true
    }
  }

  return false
}

export function normalizeAddress(value?: string | null): `0x${string}` | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed as `0x${string}` : null
}

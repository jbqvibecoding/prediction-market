/**
 * Minimal EVM address / hashing / unit helpers with NO viem dependency.
 *
 * This is the Solana-migration replacement for the handful of pure viem
 * utilities the codebase still calls (isAddress, getAddress, zeroAddress,
 * keccak256, stringToHex/toHex, parseUnits/formatUnits, parseGwei) plus the
 * string type aliases (Address, Hex, Hash). Behaviour matches viem for the
 * inputs used in this repo; keccak256 is verified against known test vectors
 * in tests/unit/ethUtils.test.ts.
 */

import { keccak_256 } from '@noble/hashes/sha3'

export type Address = `0x${string}`
export type Hex = `0x${string}`
export type Hash = `0x${string}`

/** EIP-712 typed-data domain (viem-compatible shape, kept for signing call sites). */
export interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number
  verifyingContract?: Address
  salt?: Hex
}

/** Minimal viem-compatible receipt shape for the fields still referenced. */
export interface TransactionReceipt {
  status: 'success' | 'reverted'
  transactionHash: Hash
  [key: string]: unknown
}

/** Minimal viem-compatible client shape for the fee-estimation fields still referenced. */
export interface PublicClient {
  getGasPrice: () => Promise<bigint>
  estimateFeesPerGas: (args?: unknown) => Promise<{
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
    gasPrice?: bigint
  }>
  [key: string]: unknown
}

export const zeroAddress: Address = '0x0000000000000000000000000000000000000000'

/** True for a 20-byte 0x-prefixed hex string (case-insensitive). */
export function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value)
}

// keccak-256 via @noble/hashes (audited, pure-JS; already in the dependency
// tree for the Solana libraries).

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): Hex {
  let out = '0x'
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out as Hex
}

/** keccak-256 of a 0x-hex string or byte array, returned as 0x-hex. */
export function keccak256(value: Hex | Uint8Array): Hex {
  const bytes = typeof value === 'string' ? hexToBytes(value) : value
  return bytesToHex(keccak_256(bytes))
}

/** UTF-8 string -> 0x-hex. `size` right-pads (or truncates) to that many bytes. */
export function stringToHex(value: string, opts?: { size?: number }): Hex {
  const bytes = new TextEncoder().encode(value)
  if (opts?.size !== undefined) {
    const padded = new Uint8Array(opts.size)
    padded.set(bytes.subarray(0, opts.size))
    return bytesToHex(padded)
  }
  return bytesToHex(bytes)
}

/** Alias kept for viem call-site compatibility (string|number -> hex). */
export function toHex(value: string | number | bigint): Hex {
  if (typeof value === 'string') {
    return stringToHex(value)
  }
  let hex = value.toString(16)
  if (hex.length % 2) {
    hex = `0${hex}`
  }
  return `0x${hex}` as Hex
}

/** EIP-55 checksummed address. Throws on malformed input, matching viem. */
export function getAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`)
  }
  const lower = address.slice(2).toLowerCase()
  const hash = keccak256(stringToHex(lower)).slice(2)
  let out = '0x'
  for (let i = 0; i < lower.length; i += 1) {
    out += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
  }
  return out as Address
}

// ---------------------------------------------------------------------------
// unit helpers
// ---------------------------------------------------------------------------

/** base-unit bigint -> decimal string. */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const int = digits.slice(0, digits.length - decimals)
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '')
  return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`
}

/** decimal string -> base-unit bigint. */
export function parseUnits(value: string, decimals: number): bigint {
  const negative = value.startsWith('-')
  const clean = negative ? value.slice(1) : value
  const [int, frac = ''] = clean.split('.')
  const paddedFrac = frac.slice(0, decimals).padEnd(decimals, '0')
  const result = BigInt(`${int || '0'}${paddedFrac}`)
  return negative ? -result : result
}

/** gwei decimal string -> wei bigint. */
export function parseGwei(value: string): bigint {
  return parseUnits(value, 9)
}

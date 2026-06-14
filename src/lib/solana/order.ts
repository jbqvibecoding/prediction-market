import { PublicKey } from '@solana/web3.js'

/**
 * Solana CLOB order — the client-side counterpart of `exchange::state::Order`
 * (on-chain) and the matching-engine's `Order`.
 *
 * `serializeOrder` MUST produce the exact 100-byte borsh layout the maker signs
 * and the on-chain program re-derives:
 *   salt u64 | maker [32] | market [32] | outcome u8 | side u8 |
 *   maker_amount u64 | taker_amount u64 | expiration i64 | fee_rate_bps u16
 *
 * This mirrors matching-engine/src/order.ts; the two must stay byte-identical.
 */
export const SIDE_BUY = 0
export const SIDE_SELL = 1

export const OUTCOME_YES = 0
export const OUTCOME_NO = 1

export interface SolanaOrder {
  salt: bigint
  /** base58 public key */
  maker: string
  /** base58 public key */
  market: string
  /** 0 = YES, 1 = NO */
  outcome: number
  /** 0 = BUY, 1 = SELL */
  side: number
  /** BUY: collateral given; SELL: shares given */
  makerAmount: bigint
  /** BUY: shares wanted; SELL: collateral wanted */
  takerAmount: bigint
  /** unix seconds; 0 = no expiry */
  expiration: bigint
  feeRateBps: number
}

export const ORDER_SERIALIZED_LEN = 100

export function serializeOrder(order: SolanaOrder): Uint8Array {
  const buf = Buffer.alloc(ORDER_SERIALIZED_LEN)
  let o = 0
  buf.writeBigUInt64LE(order.salt, o)
  o += 8
  new PublicKey(order.maker).toBuffer().copy(buf, o)
  o += 32
  new PublicKey(order.market).toBuffer().copy(buf, o)
  o += 32
  buf.writeUInt8(order.outcome, o)
  o += 1
  buf.writeUInt8(order.side, o)
  o += 1
  buf.writeBigUInt64LE(order.makerAmount, o)
  o += 8
  buf.writeBigUInt64LE(order.takerAmount, o)
  o += 8
  buf.writeBigInt64LE(order.expiration, o)
  o += 8
  buf.writeUInt16LE(order.feeRateBps, o)
  o += 2
  if (o !== ORDER_SERIALIZED_LEN) {
    throw new Error(`order serialization length mismatch: ${o}`)
  }
  return new Uint8Array(buf)
}

export function orderId(order: SolanaOrder): string {
  return `${order.maker}:${order.salt.toString()}`
}

/** JSON-safe order (bigints as decimal strings) for the matching-engine API. */
export interface WireOrder {
  salt: string
  maker: string
  market: string
  outcome: number
  side: number
  makerAmount: string
  takerAmount: string
  expiration: string
  feeRateBps: number
}

export function toWireOrder(o: SolanaOrder): WireOrder {
  return {
    salt: o.salt.toString(),
    maker: o.maker,
    market: o.market,
    outcome: o.outcome,
    side: o.side,
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    expiration: o.expiration.toString(),
    feeRateBps: o.feeRateBps,
  }
}

/**
 * Sign an order with a wallet's message signer (e.g. the Solana wallet
 * adapter's `signMessage`). Returns the base64 signature the engine expects.
 */
export async function signOrder(
  order: SolanaOrder,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  const signature = await signMessage(serializeOrder(order))
  return Buffer.from(signature).toString('base64')
}

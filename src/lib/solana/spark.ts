import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@/lib/solana/conditional-token'

/**
 * Client-side layer for the `events_futures` program powering spark markets
 * (42.space-style event futures):
 *
 *   - buy  = mint outcome tokens along the power curve P(s) = m·s^n
 *   - sell = redeem outcome tokens back along the curve
 *   - settlement is parimutuel: all outcome pools merge and winners split the
 *     total pool pro-rata (payout = balance × total_pool / winning_supply)
 *
 * Mirrors src/lib/solana/conditional-token.ts: pure builders (no RPC), PDAs
 * derived deterministically, Anchor discriminators = sha256("global:<ix>")[0..8].
 * The program id is a placeholder until the events_futures program is deployed;
 * override with NEXT_PUBLIC_SPARK_PROGRAM_ID.
 *
 * Curve-math helpers for UI previews live at the bottom (integer n = 2 MVP).
 */
export const SPARK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_SPARK_PROGRAM_ID
  // deterministic placeholder (sha256 of 'spark-events-futures-placeholder')
  // until the events_futures program is deployed
  || '7sech8m8biTTjb6e2UpdGx6wnnSqjMVyRFEVGPSvZ6sc',
)

const PROTOCOL_STATE_SEED = Buffer.from('protocol_state')
const MARKET_SEED = Buffer.from('market')
const OUTCOME_SEED = Buffer.from('outcome')
const OUTCOME_MINT_SEED = Buffer.from('outcome_mint')
const MARKET_AUTH_SEED = Buffer.from('market_auth')
const VAULT_SEED = Buffer.from('vault')

const DISCRIMINATOR = {
  initializeProtocol: Uint8Array.from([188, 233, 252, 106, 134, 146, 202, 91]),
  createMarket: Uint8Array.from([103, 226, 97, 235, 200, 188, 251, 254]),
  addOutcome: Uint8Array.from([162, 222, 202, 185, 176, 222, 248, 52]),
  mintOutcomeTokens: Uint8Array.from([27, 243, 237, 46, 2, 226, 144, 209]),
  redeemOutcomeTokens: Uint8Array.from([170, 231, 168, 151, 230, 80, 206, 218]),
  resolveMarket: Uint8Array.from([155, 23, 80, 173, 46, 74, 23, 239]),
  claimWinnings: Uint8Array.from([161, 215, 24, 59, 14, 236, 242, 221]),
  collectFees: Uint8Array.from([164, 152, 207, 99, 30, 186, 19, 182]),
} as const

function marketIdBytes(marketId: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(marketId, 0)
  return buf
}

// ---------------------------------------------------------------------------
// PDA derivation (seeds per the events_futures blueprint)
// ---------------------------------------------------------------------------

export function deriveProtocolState(): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_STATE_SEED], SPARK_PROGRAM_ID)[0]
}

export function deriveSparkMarket(marketId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, marketIdBytes(marketId)],
    SPARK_PROGRAM_ID,
  )[0]
}

export function deriveOutcomePool(marketId: bigint, outcomeIndex: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [OUTCOME_SEED, marketIdBytes(marketId), Buffer.from([outcomeIndex])],
    SPARK_PROGRAM_ID,
  )[0]
}

export function deriveOutcomeMint(marketId: bigint, outcomeIndex: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [OUTCOME_MINT_SEED, marketIdBytes(marketId), Buffer.from([outcomeIndex])],
    SPARK_PROGRAM_ID,
  )[0]
}

export function deriveMarketAuthority(marketId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MARKET_AUTH_SEED, marketIdBytes(marketId)],
    SPARK_PROGRAM_ID,
  )[0]
}

export function deriveSparkVault(marketId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, marketIdBytes(marketId)],
    SPARK_PROGRAM_ID,
  )[0]
}

function key(pubkey: PublicKey, isSigner: boolean, isWritable: boolean) {
  return { pubkey, isSigner, isWritable }
}

// ---------------------------------------------------------------------------
// User instructions
// ---------------------------------------------------------------------------

export interface SparkTradeParams {
  /** u64 spark market id */
  marketId: bigint
  outcomeIndex: number
  /** the user wallet (signer) */
  user: PublicKey
  collateralMint: PublicKey
  /** base-unit amount: USDC in for mint, outcome tokens in for redeem */
  amount: bigint
}

function encodeTradeData(discriminator: Uint8Array, marketId: bigint, outcomeIndex: number, amount: bigint): Buffer {
  // (market_id: u64, outcome_index: u8, amount: u64)
  const data = Buffer.alloc(8 + 8 + 1 + 8)
  data.set(discriminator, 0)
  data.writeBigUInt64LE(marketId, 8)
  data.writeUInt8(outcomeIndex, 16)
  data.writeBigUInt64LE(amount, 17)
  return data
}

function tradeKeys(params: SparkTradeParams) {
  const { marketId, outcomeIndex, user, collateralMint } = params
  const market = deriveSparkMarket(marketId)
  const outcomePool = deriveOutcomePool(marketId, outcomeIndex)
  const outcomeMint = deriveOutcomeMint(marketId, outcomeIndex)
  const marketAuthority = deriveMarketAuthority(marketId)
  const vault = deriveSparkVault(marketId)

  return [
    key(user, true, true),
    key(deriveProtocolState(), false, false),
    key(market, false, true),
    key(outcomePool, false, true),
    key(outcomeMint, false, true),
    key(marketAuthority, false, false),
    key(vault, false, true),
    key(associatedTokenAddress(collateralMint, user), false, true),
    key(associatedTokenAddress(outcomeMint, user), false, true),
    key(TOKEN_PROGRAM_ID, false, false),
    key(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
    key(SystemProgram.programId, false, false),
  ]
}

/** mint_outcome_tokens: pay `amount` USDC -> mint outcome tokens along the curve. */
export function buildMintOutcomeTokensInstruction(params: SparkTradeParams): TransactionInstruction {
  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: tradeKeys(params),
    data: encodeTradeData(DISCRIMINATOR.mintOutcomeTokens, params.marketId, params.outcomeIndex, params.amount),
  })
}

/** redeem_outcome_tokens: burn `amount` outcome tokens -> USDC back along the curve. */
export function buildRedeemOutcomeTokensInstruction(params: SparkTradeParams): TransactionInstruction {
  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: tradeKeys(params),
    data: encodeTradeData(DISCRIMINATOR.redeemOutcomeTokens, params.marketId, params.outcomeIndex, params.amount),
  })
}

export interface SparkClaimParams {
  marketId: bigint
  /** the resolved winning outcome index */
  outcomeIndex: number
  user: PublicKey
  collateralMint: PublicKey
}

/** claim_winnings: after resolution, burn the whole winning balance for the pro-rata pool share. */
export function buildClaimWinningsInstruction(params: SparkClaimParams): TransactionInstruction {
  const { marketId, outcomeIndex } = params
  // (market_id: u64, outcome_index: u8)
  const data = Buffer.alloc(8 + 8 + 1)
  data.set(DISCRIMINATOR.claimWinnings, 0)
  data.writeBigUInt64LE(marketId, 8)
  data.writeUInt8(outcomeIndex, 16)

  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: tradeKeys({ ...params, amount: 0n }),
    data,
  })
}

// ---------------------------------------------------------------------------
// Admin instructions
// ---------------------------------------------------------------------------

export interface InitializeProtocolParams {
  admin: PublicKey
  feeBps: number
  treasury: PublicKey
}

/** initialize_protocol: create the singleton ProtocolState (admin, fee, treasury). */
export function buildInitializeProtocolInstruction(params: InitializeProtocolParams): TransactionInstruction {
  const { admin, feeBps, treasury } = params
  // (fee_bps: u16, treasury: Pubkey)
  const data = Buffer.alloc(8 + 2 + 32)
  data.set(DISCRIMINATOR.initializeProtocol, 0)
  data.writeUInt16LE(feeBps, 8)
  data.set(treasury.toBuffer(), 10)

  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: [
      key(admin, true, true),
      key(deriveProtocolState(), false, true),
      key(SystemProgram.programId, false, false),
    ],
    data,
  })
}

export interface CreateSparkMarketParams {
  marketId: bigint
  creator: PublicKey
  collateralMint: PublicKey
  /** market title (stored on-chain, max 128 chars per blueprint) */
  title: string
  /** curve P(s) = (mNum/mDen)·s^(nNum/nDen); MVP uses integer n (nDen = 1) */
  curve: { mNum: bigint, mDen: bigint, nNum: bigint, nDen: bigint }
}

/** create_market: init the Market account, market authority, and USDC vault. */
export function buildCreateSparkMarketInstruction(params: CreateSparkMarketParams): TransactionInstruction {
  const { marketId, creator, collateralMint, title, curve } = params
  const titleBytes = Buffer.from(title, 'utf8')
  // (market_id: u64, title: string, m_num: u64, m_den: u64, n_num: u64, n_den: u64)
  const data = Buffer.alloc(8 + 8 + 4 + titleBytes.length + 8 * 4)
  let offset = 0
  data.set(DISCRIMINATOR.createMarket, offset)
  offset += 8
  data.writeBigUInt64LE(marketId, offset)
  offset += 8
  data.writeUInt32LE(titleBytes.length, offset)
  offset += 4
  data.set(titleBytes, offset)
  offset += titleBytes.length
  for (const value of [curve.mNum, curve.mDen, curve.nNum, curve.nDen]) {
    data.writeBigUInt64LE(value, offset)
    offset += 8
  }

  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: [
      key(creator, true, true),
      key(deriveProtocolState(), false, true),
      key(deriveSparkMarket(marketId), false, true),
      key(deriveMarketAuthority(marketId), false, false),
      key(collateralMint, false, false),
      key(deriveSparkVault(marketId), false, true),
      key(TOKEN_PROGRAM_ID, false, false),
      key(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
      key(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data,
  })
}

export interface AddSparkOutcomeParams {
  marketId: bigint
  outcomeIndex: number
  admin: PublicKey
  /** outcome label (max 64 chars per blueprint) */
  label: string
}

/** add_outcome: create the OutcomePool + outcome SPL mint for one outcome. */
export function buildAddSparkOutcomeInstruction(params: AddSparkOutcomeParams): TransactionInstruction {
  const { marketId, outcomeIndex, admin, label } = params
  const labelBytes = Buffer.from(label, 'utf8')
  // (market_id: u64, outcome_index: u8, label: string)
  const data = Buffer.alloc(8 + 8 + 1 + 4 + labelBytes.length)
  let offset = 0
  data.set(DISCRIMINATOR.addOutcome, offset)
  offset += 8
  data.writeBigUInt64LE(marketId, offset)
  offset += 8
  data.writeUInt8(outcomeIndex, offset)
  offset += 1
  data.writeUInt32LE(labelBytes.length, offset)
  offset += 4
  data.set(labelBytes, offset)

  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: [
      key(admin, true, true),
      key(deriveSparkMarket(marketId), false, true),
      key(deriveOutcomePool(marketId, outcomeIndex), false, true),
      key(deriveOutcomeMint(marketId, outcomeIndex), false, true),
      key(deriveMarketAuthority(marketId), false, false),
      key(TOKEN_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
      key(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data,
  })
}

export interface ResolveSparkMarketParams {
  marketId: bigint
  /** the protocol/market authority allowed to resolve (signer) */
  authority: PublicKey
  winningOutcome: number
}

/** resolve_market: record the winning outcome; trading stops, claims open. */
export function buildResolveSparkMarketInstruction(params: ResolveSparkMarketParams): TransactionInstruction {
  const { marketId, authority, winningOutcome } = params
  // (market_id: u64, winning_outcome: u8)
  const data = Buffer.alloc(8 + 8 + 1)
  data.set(DISCRIMINATOR.resolveMarket, 0)
  data.writeBigUInt64LE(marketId, 8)
  data.writeUInt8(winningOutcome, 16)

  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: [
      key(authority, true, false),
      key(deriveProtocolState(), false, false),
      key(deriveSparkMarket(marketId), false, true),
    ],
    data,
  })
}

export interface CollectSparkFeesParams {
  marketId: bigint
  admin: PublicKey
  collateralMint: PublicKey
  treasury: PublicKey
}

/** collect_fees: sweep accrued protocol fees from the market vault to the treasury. */
export function buildCollectSparkFeesInstruction(params: CollectSparkFeesParams): TransactionInstruction {
  const { marketId, admin, collateralMint, treasury } = params
  const data = Buffer.alloc(8 + 8)
  data.set(DISCRIMINATOR.collectFees, 0)
  data.writeBigUInt64LE(marketId, 8)

  return new TransactionInstruction({
    programId: SPARK_PROGRAM_ID,
    keys: [
      key(admin, true, true),
      key(deriveProtocolState(), false, false),
      key(deriveSparkMarket(marketId), false, true),
      key(deriveMarketAuthority(marketId), false, false),
      key(deriveSparkVault(marketId), false, true),
      key(associatedTokenAddress(collateralMint, treasury), false, true),
      key(TOKEN_PROGRAM_ID, false, false),
    ],
    data,
  })
}

// ---------------------------------------------------------------------------
// Power-curve math (UI previews; mirrors the on-chain fixed-point math)
//
// P(s) = m·s^n with integer n (MVP: n = 2, the blueprint's recommended start).
// Mint cost from supply s1 to s2:  m/(n+1) · (s2^(n+1) − s1^(n+1))
// All amounts are base units (bigint); m is the rational mNum/mDen scaled by
// SPARK_CURVE_SCALE to keep precision, matching the on-chain SCALE approach.
// ---------------------------------------------------------------------------

/** Fixed-point scale for curve math (10^12, per the blueprint). */
export const SPARK_CURVE_SCALE = 1_000_000_000_000n

export interface SparkCurve {
  mNum: bigint
  mDen: bigint
  /** integer exponent (MVP supports n >= 1; quadratic n = 2 recommended) */
  n: number
}

function powInt(base: bigint, exp: number): bigint {
  let result = 1n
  for (let i = 0; i < exp; i += 1) {
    result *= base
  }
  return result
}

/** Spot price P(s) = m·s^n, scaled by SPARK_CURVE_SCALE. */
export function sparkSpotPriceScaled(curve: SparkCurve, supply: bigint): bigint {
  return (powInt(supply, curve.n) * curve.mNum * SPARK_CURVE_SCALE) / curve.mDen
}

/** Mint cost to move supply s1 -> s2: m/(n+1)·(s2^(n+1) − s1^(n+1)), in base units. */
export function sparkMintCost(curve: SparkCurve, s1: bigint, s2: bigint): bigint {
  if (s2 <= s1) {
    return 0n
  }
  const nPlus1 = curve.n + 1
  const diff = powInt(s2, nPlus1) - powInt(s1, nPlus1)
  return (diff * curve.mNum) / (curve.mDen * BigInt(nPlus1))
}

/** Redeem proceeds for burning supply back s2 -> s1 (same integral, reversed). */
export function sparkRedeemProceeds(curve: SparkCurve, s2: bigint, s1: bigint): bigint {
  return sparkMintCost(curve, s1, s2)
}

/**
 * Inverse: how many tokens does `usdcIn` mint from supply s1? Bisection over
 * the mint-cost integral (monotonic), per the blueprint's on-chain approach.
 */
export function sparkTokensForUsdc(curve: SparkCurve, s1: bigint, usdcIn: bigint, maxIterations = 64): bigint {
  if (usdcIn <= 0n) {
    return 0n
  }
  let lo = 0n
  // Upper bound: at zero marginal price the entire deposit mints 1:1; grow
  // until the cost exceeds the target to guarantee the bracket.
  let hi = usdcIn + 1n
  while (sparkMintCost(curve, s1, s1 + hi) < usdcIn) {
    hi *= 2n
    if (hi > usdcIn * 1_000_000n) {
      break
    }
  }
  for (let i = 0; i < maxIterations && lo < hi; i += 1) {
    const mid = (lo + hi + 1n) / 2n
    if (sparkMintCost(curve, s1, s1 + mid) <= usdcIn) {
      lo = mid
    }
    else {
      hi = mid - 1n
    }
  }
  return lo
}

/** Parimutuel payout preview: balance × totalPool / winningSupply (base units). */
export function sparkClaimPayout(balance: bigint, totalPool: bigint, winningSupply: bigint): bigint {
  if (winningSupply <= 0n || balance <= 0n) {
    return 0n
  }
  return (balance * totalPool) / winningSupply
}

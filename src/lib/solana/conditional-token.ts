import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js'

/**
 * Client-side instruction builders for the on-chain `conditional_token` program
 * (binary YES/NO prediction markets). Mirrors
 * prediction-market-smartcontract/programs/conditional_token/src/lib.rs:
 *
 *   split (amount)  : lock collateral -> mint amount YES + amount NO
 *   merge (amount)  : burn amount YES + amount NO -> unlock collateral
 *   redeem(amount)  : after resolution, burn winning token -> unlock collateral
 *
 * Pure (no RPC): callers assemble these into a Transaction and have the wallet
 * sign/send. PDAs and ATAs are derived deterministically; the 8-byte Anchor
 * discriminators are sha256("global:<ix>")[0..8].
 */
export const CONDITIONAL_TOKEN_PROGRAM_ID = new PublicKey(
  'HYryinXp2Vf8zM4ZuTuyuSvN5kmNRHparmU1MJ6Z8u9J',
)
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
)
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
)

const CONDITION_SEED = Buffer.from('condition')
const YES_MINT_SEED = Buffer.from('yes')
const NO_MINT_SEED = Buffer.from('no')
const VAULT_SEED = Buffer.from('vault')

export const OUTCOME_YES = 0
export const OUTCOME_NO = 1

const DISCRIMINATOR = {
  initializeCondition: Uint8Array.from([210, 55, 126, 97, 178, 72, 14, 59]),
  split: Uint8Array.from([124, 189, 27, 43, 216, 40, 147, 66]),
  merge: Uint8Array.from([148, 141, 236, 47, 174, 126, 69, 111]),
  resolve: Uint8Array.from([246, 150, 236, 206, 108, 63, 58, 10]),
  redeem: Uint8Array.from([184, 12, 86, 149, 70, 196, 97, 225]),
} as const

export function deriveCondition(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [CONDITION_SEED, market.toBuffer()],
    CONDITIONAL_TOKEN_PROGRAM_ID,
  )[0]
}

export function deriveYesMint(condition: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [YES_MINT_SEED, condition.toBuffer()],
    CONDITIONAL_TOKEN_PROGRAM_ID,
  )[0]
}

export function deriveNoMint(condition: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [NO_MINT_SEED, condition.toBuffer()],
    CONDITIONAL_TOKEN_PROGRAM_ID,
  )[0]
}

export function deriveVault(condition: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, condition.toBuffer()],
    CONDITIONAL_TOKEN_PROGRAM_ID,
  )[0]
}

/** Associated token account (mirrors spl-token getAssociatedTokenAddressSync). */
export function associatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

function encodeAmountData(discriminator: Uint8Array, amount: bigint): Buffer {
  const data = Buffer.alloc(16)
  data.set(discriminator, 0)
  data.writeBigUInt64LE(amount, 8)
  return data
}

function key(pubkey: PublicKey, isSigner: boolean, isWritable: boolean) {
  return { pubkey, isSigner, isWritable }
}

export interface ConditionalTokenParams {
  /** base58 market pubkey (the condition's seed) */
  market: PublicKey
  /** the user wallet (signer) */
  user: PublicKey
  collateralMint: PublicKey
  /** base-unit amount */
  amount: bigint
}

/** split: lock `amount` collateral -> mint `amount` YES + `amount` NO. */
export function buildSplitInstruction(params: ConditionalTokenParams): TransactionInstruction {
  const { market, user, collateralMint, amount } = params
  const condition = deriveCondition(market)
  const yesMint = deriveYesMint(condition)
  const noMint = deriveNoMint(condition)
  const vault = deriveVault(condition)

  return new TransactionInstruction({
    programId: CONDITIONAL_TOKEN_PROGRAM_ID,
    keys: [
      key(user, true, true),
      key(market, false, false),
      key(condition, false, false),
      key(collateralMint, false, false),
      key(yesMint, false, true),
      key(noMint, false, true),
      key(vault, false, true),
      key(associatedTokenAddress(collateralMint, user), false, true),
      key(associatedTokenAddress(yesMint, user), false, true),
      key(associatedTokenAddress(noMint, user), false, true),
      key(TOKEN_PROGRAM_ID, false, false),
      key(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
    ],
    data: encodeAmountData(DISCRIMINATOR.split, amount),
  })
}

/** merge: burn `amount` YES + `amount` NO -> unlock `amount` collateral. */
export function buildMergeInstruction(params: ConditionalTokenParams): TransactionInstruction {
  const { market, user, collateralMint, amount } = params
  const condition = deriveCondition(market)
  const yesMint = deriveYesMint(condition)
  const noMint = deriveNoMint(condition)
  const vault = deriveVault(condition)

  return new TransactionInstruction({
    programId: CONDITIONAL_TOKEN_PROGRAM_ID,
    keys: [
      key(user, true, true),
      key(market, false, false),
      key(condition, false, false),
      key(collateralMint, false, false),
      key(yesMint, false, true),
      key(noMint, false, true),
      key(vault, false, true),
      key(associatedTokenAddress(collateralMint, user), false, true),
      key(associatedTokenAddress(yesMint, user), false, true),
      key(associatedTokenAddress(noMint, user), false, true),
      key(TOKEN_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
    ],
    data: encodeAmountData(DISCRIMINATOR.merge, amount),
  })
}

export interface RedeemParams extends ConditionalTokenParams {
  /** 0 = YES, 1 = NO (must be the resolved winning outcome) */
  winningOutcome: number
}

/** redeem: after resolution, burn `amount` of the winning token for collateral. */
export function buildRedeemInstruction(params: RedeemParams): TransactionInstruction {
  const { market, user, collateralMint, amount, winningOutcome } = params
  const condition = deriveCondition(market)
  const vault = deriveVault(condition)
  const winningMint =
    winningOutcome === OUTCOME_YES ? deriveYesMint(condition) : deriveNoMint(condition)

  return new TransactionInstruction({
    programId: CONDITIONAL_TOKEN_PROGRAM_ID,
    keys: [
      key(user, true, true),
      key(market, false, false),
      key(condition, false, false),
      key(collateralMint, false, false),
      key(vault, false, true),
      key(winningMint, false, true),
      key(associatedTokenAddress(winningMint, user), false, true),
      key(associatedTokenAddress(collateralMint, user), false, true),
      key(TOKEN_PROGRAM_ID, false, false),
    ],
    data: encodeAmountData(DISCRIMINATOR.redeem, amount),
  })
}

export interface InitializeConditionParams {
  /** base58 market pubkey (the condition's seed) */
  market: PublicKey
  /** the fee payer / creator wallet (signer) */
  payer: PublicKey
  collateralMint: PublicKey
  /** wallet allowed to later `resolve` this condition (the market authority/oracle) */
  authority: PublicKey
}

/**
 * initialize_condition: create the YES/NO mints, the collateral vault, and the
 * `Condition` record for `market`. Mirrors the EVM "initialize market" step of
 * admin market creation. The `authority` arg is written into the Condition and
 * is the only wallet permitted to `resolve` it.
 */
export function buildInitializeConditionInstruction(
  params: InitializeConditionParams,
): TransactionInstruction {
  const { market, payer, collateralMint, authority } = params
  const condition = deriveCondition(market)
  const yesMint = deriveYesMint(condition)
  const noMint = deriveNoMint(condition)
  const vault = deriveVault(condition)

  const data = Buffer.alloc(8 + 32)
  data.set(DISCRIMINATOR.initializeCondition, 0)
  data.set(authority.toBuffer(), 8)

  return new TransactionInstruction({
    programId: CONDITIONAL_TOKEN_PROGRAM_ID,
    keys: [
      key(payer, true, true),
      key(market, false, false),
      key(collateralMint, false, false),
      key(condition, false, true),
      key(yesMint, false, true),
      key(noMint, false, true),
      key(vault, false, true),
      key(TOKEN_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
      key(SYSVAR_RENT_PUBKEY, false, false),
    ],
    data,
  })
}

export interface ResolveParams {
  /** base58 market pubkey (the condition's seed) */
  market: PublicKey
  /** the condition authority (signer) — must equal Condition.authority */
  authority: PublicKey
  /** 0 = YES wins, 1 = NO wins */
  winningOutcome: number
}

/**
 * resolve: record the winning outcome for a condition. Only the condition
 * authority may call this. Mirrors the EVM direct-resolution "propose &
 * resolve" settlement step. Binary only (YES/NO); there is no on-chain
 * "unknown" outcome.
 */
export function buildResolveInstruction(params: ResolveParams): TransactionInstruction {
  const { market, authority, winningOutcome } = params
  const condition = deriveCondition(market)

  const data = Buffer.alloc(8 + 1)
  data.set(DISCRIMINATOR.resolve, 0)
  data.writeUInt8(winningOutcome, 8)

  return new TransactionInstruction({
    programId: CONDITIONAL_TOKEN_PROGRAM_ID,
    keys: [
      key(authority, true, false),
      key(market, false, false),
      key(condition, false, true),
    ],
    data,
  })
}

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  associatedTokenAddress,
} from './conditional-token'

/**
 * SPL Token instruction builders for fund movement (Phase D). On Solana the
 * user holds collateral in their own associated token account (ATA) — there is
 * no EVM-style deposit-wallet contract or ERC20 allowance. "Withdraw" is a plain
 * SPL transfer; "deposit" is just the user already holding tokens.
 *
 * Pure (no RPC). Layouts match the SPL Token + Associated Token programs:
 *   TransferChecked = tag 12 | amount u64 | decimals u8
 *   CreateIdempotent (ATA program) = tag 1
 */
export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, associatedTokenAddress }

const TRANSFER_CHECKED_IX = 12
const CREATE_IDEMPOTENT_IX = 1

function key(pubkey: PublicKey, isSigner: boolean, isWritable: boolean) {
  return { pubkey, isSigner, isWritable }
}

export interface CreateAtaParams {
  payer: PublicKey
  owner: PublicKey
  mint: PublicKey
}

/** Create the owner's ATA for `mint` if missing (idempotent — safe to always include). */
export function buildCreateAtaIdempotentInstruction(
  params: CreateAtaParams,
): TransactionInstruction {
  const ata = associatedTokenAddress(params.mint, params.owner)
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      key(params.payer, true, true),
      key(ata, false, true),
      key(params.owner, false, false),
      key(params.mint, false, false),
      key(SystemProgram.programId, false, false),
      key(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.from([CREATE_IDEMPOTENT_IX]),
  })
}

export interface TransferCheckedParams {
  mint: PublicKey
  decimals: number
  /** source token account authority (signer) */
  owner: PublicKey
  /** source token account */
  source: PublicKey
  /** destination token account */
  destination: PublicKey
  amount: bigint
}

export function buildTransferCheckedInstruction(
  params: TransferCheckedParams,
): TransactionInstruction {
  const data = Buffer.alloc(10)
  data.writeUInt8(TRANSFER_CHECKED_IX, 0)
  data.writeBigUInt64LE(params.amount, 1)
  data.writeUInt8(params.decimals, 9)

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      key(params.source, false, true),
      key(params.mint, false, false),
      key(params.destination, false, true),
      key(params.owner, true, false),
    ],
    data,
  })
}

export interface SplTransferParams {
  mint: PublicKey
  decimals: number
  /** wallet sending the tokens (signer + pays for dest ATA creation) */
  fromOwner: PublicKey
  /** recipient wallet (owner of the destination ATA) */
  toOwner: PublicKey
  amount: bigint
}

/**
 * Transfer `amount` of `mint` from one wallet to another, creating the
 * recipient's ATA if needed. Returns the instructions to assemble into a tx.
 */
export function buildSplTransferToOwner(params: SplTransferParams): TransactionInstruction[] {
  const source = associatedTokenAddress(params.mint, params.fromOwner)
  const destination = associatedTokenAddress(params.mint, params.toOwner)
  return [
    buildCreateAtaIdempotentInstruction({
      payer: params.fromOwner,
      owner: params.toOwner,
      mint: params.mint,
    }),
    buildTransferCheckedInstruction({
      mint: params.mint,
      decimals: params.decimals,
      owner: params.fromOwner,
      source,
      destination,
      amount: params.amount,
    }),
  ]
}

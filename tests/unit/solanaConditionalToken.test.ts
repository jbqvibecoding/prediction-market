// @vitest-environment node
// PDA derivation (findProgramAddressSync) relies on sha256; run in node so the
// hashing works the same as in a real browser (jsdom's realm breaks it).
import { describe, expect, it } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CONDITIONAL_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  buildMergeInstruction,
  buildRedeemInstruction,
  buildSplitInstruction,
  deriveCondition,
  deriveNoMint,
  deriveYesMint,
} from '@/lib/solana/conditional-token'

const market = Keypair.generate().publicKey
const user = Keypair.generate().publicKey
const collateralMint = Keypair.generate().publicKey

describe('conditional-token instruction builders', () => {
  it('derives PDAs deterministically and on-curve-independently', () => {
    const condition = deriveCondition(market)
    expect(deriveCondition(market).equals(condition)).toBe(true)
    expect(deriveYesMint(condition).equals(deriveNoMint(condition))).toBe(false)
  })

  it('derives ATAs via the associated-token program', () => {
    const expected = PublicKey.findProgramAddressSync(
      [user.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), collateralMint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0]
    expect(associatedTokenAddress(collateralMint, user).equals(expected)).toBe(true)
  })

  it('split: discriminator + amount + account metas', () => {
    const ix = buildSplitInstruction({ market, user, collateralMint, amount: 1_000_000n })
    expect(ix.programId.equals(CONDITIONAL_TOKEN_PROGRAM_ID)).toBe(true)
    // discriminator
    expect([...ix.data.subarray(0, 8)]).toEqual([124, 189, 27, 43, 216, 40, 147, 66])
    // amount u64 LE
    expect(ix.data.readBigUInt64LE(8)).toBe(1_000_000n)
    expect(ix.keys).toHaveLength(13)
    // user is the only signer, and is writable
    expect(ix.keys[0].pubkey.equals(user)).toBe(true)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.keys[0].isWritable).toBe(true)
    expect(ix.keys.filter(k => k.isSigner)).toHaveLength(1)
    // yes/no/vault are writable
    const condition = deriveCondition(market)
    const yesIdx = ix.keys.findIndex(k => k.pubkey.equals(deriveYesMint(condition)))
    expect(ix.keys[yesIdx].isWritable).toBe(true)
  })

  it('merge: 12 accounts, merge discriminator', () => {
    const ix = buildMergeInstruction({ market, user, collateralMint, amount: 5n })
    expect([...ix.data.subarray(0, 8)]).toEqual([148, 141, 236, 47, 174, 126, 69, 111])
    expect(ix.data.readBigUInt64LE(8)).toBe(5n)
    expect(ix.keys).toHaveLength(12)
  })

  it('redeem: winning mint selected by outcome; 9 accounts', () => {
    const condition = deriveCondition(market)
    const yes = buildRedeemInstruction({ market, user, collateralMint, amount: 3n, winningOutcome: 0 })
    const no = buildRedeemInstruction({ market, user, collateralMint, amount: 3n, winningOutcome: 1 })
    expect([...yes.data.subarray(0, 8)]).toEqual([184, 12, 86, 149, 70, 196, 97, 225])
    expect(yes.keys).toHaveLength(9)
    // winning_mint slot (index 5) differs by outcome
    expect(yes.keys[5].pubkey.equals(deriveYesMint(condition))).toBe(true)
    expect(no.keys[5].pubkey.equals(deriveNoMint(condition))).toBe(true)
  })
})

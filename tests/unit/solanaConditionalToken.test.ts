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
  buildInitializeConditionInstruction,
  buildMergeInstruction,
  buildRedeemInstruction,
  buildResolveInstruction,
  buildSplitInstruction,
  deriveCondition,
  deriveNoMint,
  deriveVault,
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

describe('admin instruction builders (initialize_condition / resolve)', () => {
  const authority = Keypair.generate().publicKey

  it('initialize_condition: discriminator + authority arg + PDA account metas', () => {
    const ix = buildInitializeConditionInstruction({
      market,
      payer: user,
      collateralMint,
      authority,
    })
    expect(ix.programId.equals(CONDITIONAL_TOKEN_PROGRAM_ID)).toBe(true)
    // discriminator
    expect([...ix.data.subarray(0, 8)]).toEqual([210, 55, 126, 97, 178, 72, 14, 59])
    // authority pubkey serialized after the discriminator (32 bytes)
    expect(ix.data).toHaveLength(8 + 32)
    expect(new PublicKey(ix.data.subarray(8, 40)).equals(authority)).toBe(true)

    // 10 accounts; payer is the only signer, and is writable
    expect(ix.keys).toHaveLength(10)
    expect(ix.keys[0].pubkey.equals(user)).toBe(true)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.keys[0].isWritable).toBe(true)
    expect(ix.keys.filter(k => k.isSigner)).toHaveLength(1)

    // condition/yes/no/vault PDAs present and writable (init)
    const condition = deriveCondition(market)
    for (const pda of [condition, deriveYesMint(condition), deriveNoMint(condition), deriveVault(condition)]) {
      const slot = ix.keys.find(k => k.pubkey.equals(pda))
      expect(slot?.isWritable).toBe(true)
    }
    // market seed account is read-only
    const marketSlot = ix.keys.find(k => k.pubkey.equals(market))
    expect(marketSlot?.isWritable).toBe(false)
  })

  it('resolve: discriminator + u8 outcome; authority signs, condition writable', () => {
    const yes = buildResolveInstruction({ market, authority, winningOutcome: 0 })
    const no = buildResolveInstruction({ market, authority, winningOutcome: 1 })
    expect([...yes.data.subarray(0, 8)]).toEqual([246, 150, 236, 206, 108, 63, 58, 10])
    expect(yes.data).toHaveLength(8 + 1)
    expect(yes.data.readUInt8(8)).toBe(0)
    expect(no.data.readUInt8(8)).toBe(1)

    expect(yes.keys).toHaveLength(3)
    // authority is the sole signer and is not writable
    expect(yes.keys[0].pubkey.equals(authority)).toBe(true)
    expect(yes.keys[0].isSigner).toBe(true)
    expect(yes.keys[0].isWritable).toBe(false)
    // condition PDA is writable (records the outcome)
    const conditionSlot = yes.keys.find(k => k.pubkey.equals(deriveCondition(market)))
    expect(conditionSlot?.isWritable).toBe(true)
  })
})

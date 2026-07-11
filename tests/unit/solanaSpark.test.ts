// @vitest-environment node
// PDA derivation (findProgramAddressSync) relies on sha256; run in node so the
// hashing works the same as in a real browser (jsdom's realm breaks it).
import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import {
  buildAddSparkOutcomeInstruction,
  buildClaimWinningsInstruction,
  buildCreateSparkMarketInstruction,
  buildInitializeProtocolInstruction,
  buildMintOutcomeTokensInstruction,
  buildRedeemOutcomeTokensInstruction,
  buildResolveSparkMarketInstruction,
  deriveMarketAuthority,
  deriveOutcomeMint,
  deriveOutcomePool,
  deriveProtocolState,
  deriveSparkMarket,
  deriveSparkVault,
  SPARK_PROGRAM_ID,
  sparkClaimPayout,
  sparkMintCost,
  sparkRedeemProceeds,
  sparkSpotPriceScaled,
  sparkTokensForUsdc,
} from '@/lib/solana/spark'

const user = Keypair.generate().publicKey
const collateralMint = Keypair.generate().publicKey
const MARKET_ID = 42n

describe('spark PDA derivation', () => {
  it('derives deterministic, distinct PDAs per market/outcome', () => {
    expect(deriveProtocolState().equals(deriveProtocolState())).toBe(true)
    expect(deriveSparkMarket(MARKET_ID).equals(deriveSparkMarket(MARKET_ID))).toBe(true)
    expect(deriveSparkMarket(MARKET_ID).equals(deriveSparkMarket(43n))).toBe(false)
    expect(deriveOutcomePool(MARKET_ID, 0).equals(deriveOutcomePool(MARKET_ID, 1))).toBe(false)
    expect(deriveOutcomeMint(MARKET_ID, 0).equals(deriveOutcomePool(MARKET_ID, 0))).toBe(false)
    expect(deriveMarketAuthority(MARKET_ID).equals(deriveSparkVault(MARKET_ID))).toBe(false)
  })
})

describe('spark trade instructions', () => {
  it('mint_outcome_tokens: discriminator + (marketId, outcomeIndex, amount) payload', () => {
    const ix = buildMintOutcomeTokensInstruction({
      marketId: MARKET_ID,
      outcomeIndex: 1,
      user,
      collateralMint,
      amount: 5_000_000n,
    })
    expect(ix.programId.equals(SPARK_PROGRAM_ID)).toBe(true)
    expect([...ix.data.subarray(0, 8)]).toEqual([27, 243, 237, 46, 2, 226, 144, 209])
    expect(ix.data.readBigUInt64LE(8)).toBe(MARKET_ID)
    expect(ix.data.readUInt8(16)).toBe(1)
    expect(ix.data.readBigUInt64LE(17)).toBe(5_000_000n)
    // 12 accounts; user is the sole signer and writable
    expect(ix.keys).toHaveLength(12)
    expect(ix.keys[0].pubkey.equals(user)).toBe(true)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.keys.filter(k => k.isSigner)).toHaveLength(1)
    // market/outcome/mint/vault writable
    const writable = new Set(ix.keys.filter(k => k.isWritable).map(k => k.pubkey.toBase58()))
    expect(writable.has(deriveSparkMarket(MARKET_ID).toBase58())).toBe(true)
    expect(writable.has(deriveOutcomePool(MARKET_ID, 1).toBase58())).toBe(true)
    expect(writable.has(deriveOutcomeMint(MARKET_ID, 1).toBase58())).toBe(true)
    expect(writable.has(deriveSparkVault(MARKET_ID).toBase58())).toBe(true)
  })

  it('redeem uses its own discriminator with the same account shape', () => {
    const mint = buildMintOutcomeTokensInstruction({ marketId: MARKET_ID, outcomeIndex: 0, user, collateralMint, amount: 1n })
    const redeem = buildRedeemOutcomeTokensInstruction({ marketId: MARKET_ID, outcomeIndex: 0, user, collateralMint, amount: 1n })
    expect([...redeem.data.subarray(0, 8)]).toEqual([170, 231, 168, 151, 230, 80, 206, 218])
    expect(redeem.keys.map(k => k.pubkey.toBase58())).toEqual(mint.keys.map(k => k.pubkey.toBase58()))
  })

  it('claim_winnings: discriminator + (marketId, outcomeIndex)', () => {
    const ix = buildClaimWinningsInstruction({ marketId: MARKET_ID, outcomeIndex: 2, user, collateralMint })
    expect([...ix.data.subarray(0, 8)]).toEqual([161, 215, 24, 59, 14, 236, 242, 221])
    expect(ix.data).toHaveLength(17)
    expect(ix.data.readBigUInt64LE(8)).toBe(MARKET_ID)
    expect(ix.data.readUInt8(16)).toBe(2)
  })
})

describe('spark admin instructions', () => {
  const admin = Keypair.generate().publicKey
  const treasury = Keypair.generate().publicKey

  it('initialize_protocol: fee bps + treasury payload', () => {
    const ix = buildInitializeProtocolInstruction({ admin, feeBps: 250, treasury })
    expect([...ix.data.subarray(0, 8)]).toEqual([188, 233, 252, 106, 134, 146, 202, 91])
    expect(ix.data.readUInt16LE(8)).toBe(250)
    expect(ix.data.subarray(10, 42).equals(treasury.toBuffer())).toBe(true)
    expect(ix.keys[1].pubkey.equals(deriveProtocolState())).toBe(true)
  })

  it('create_market: borsh string title + curve params', () => {
    const ix = buildCreateSparkMarketInstruction({
      marketId: MARKET_ID,
      creator: admin,
      collateralMint,
      title: 'BTC $150K?',
      curve: { mNum: 1n, mDen: 1_000_000n, nNum: 2n, nDen: 1n },
    })
    expect([...ix.data.subarray(0, 8)]).toEqual([103, 226, 97, 235, 200, 188, 251, 254])
    expect(ix.data.readBigUInt64LE(8)).toBe(MARKET_ID)
    const titleLen = ix.data.readUInt32LE(16)
    expect(ix.data.subarray(20, 20 + titleLen).toString('utf8')).toBe('BTC $150K?')
    // curve params trail the title: mNum, mDen, nNum, nDen
    const base = 20 + titleLen
    expect(ix.data.readBigUInt64LE(base)).toBe(1n)
    expect(ix.data.readBigUInt64LE(base + 8)).toBe(1_000_000n)
    expect(ix.data.readBigUInt64LE(base + 16)).toBe(2n)
    expect(ix.data.readBigUInt64LE(base + 24)).toBe(1n)
  })

  it('add_outcome + resolve_market payloads', () => {
    const add = buildAddSparkOutcomeInstruction({ marketId: MARKET_ID, outcomeIndex: 0, admin, label: 'Yes' })
    expect([...add.data.subarray(0, 8)]).toEqual([162, 222, 202, 185, 176, 222, 248, 52])
    expect(add.data.readUInt8(16)).toBe(0)
    expect(add.data.readUInt32LE(17)).toBe(3)
    expect(add.data.subarray(21, 24).toString('utf8')).toBe('Yes')

    const resolve = buildResolveSparkMarketInstruction({ marketId: MARKET_ID, authority: admin, winningOutcome: 1 })
    expect([...resolve.data.subarray(0, 8)]).toEqual([155, 23, 80, 173, 46, 74, 23, 239])
    expect(resolve.data.readUInt8(16)).toBe(1)
    expect(resolve.keys[0].isSigner).toBe(true)
  })
})

describe('spark power-curve math (n = 2 quadratic)', () => {
  // P(s) = m·s² with m = 1/1e12 → mint cost s1→s2 = (s2³ − s1³) / 3e12.
  const curve = { mNum: 1n, mDen: 1_000_000_000_000n, n: 2 }

  it('mint cost matches the closed-form integral', () => {
    // s1=0, s2=30000: cost = 30000³/3e12 = 2.7e13/3e12 = 9
    expect(sparkMintCost(curve, 0n, 30_000n)).toBe(9n)
    // s1=30000, s2=60000: (2.16e14 − 2.7e13)/3e12 = 63
    expect(sparkMintCost(curve, 30_000n, 60_000n)).toBe(63n)
    // zero-width and reversed ranges cost nothing
    expect(sparkMintCost(curve, 500n, 500n)).toBe(0n)
    expect(sparkMintCost(curve, 600n, 500n)).toBe(0n)
  })

  it('redeem proceeds equal the mint cost over the same range', () => {
    expect(sparkRedeemProceeds(curve, 60_000n, 30_000n)).toBe(sparkMintCost(curve, 30_000n, 60_000n))
  })

  it('spot price P(s) = m·s² (scaled)', () => {
    // s=1e6: P = (1e6)²/1e12 = 1 → scaled by 1e12
    expect(sparkSpotPriceScaled(curve, 1_000_000n)).toBe(1_000_000_000_000n)
    expect(sparkSpotPriceScaled(curve, 0n)).toBe(0n)
  })

  it('bisection inverse returns the max tokens whose cost fits the USDC amount', () => {
    // cost(0→s) = floor(s³/3e12) ≤ 9 up to s = 31072 (31072³ < 3e13), so 9 USDC
    // mints 31072 tokens under integer flooring — cbrt(3·9·1e12) ≈ 31072.3.
    const tokens = sparkTokensForUsdc(curve, 0n, 9n)
    expect(tokens).toBe(31_072n)
    // maximality invariants: cost(tokens) ≤ input < cost(tokens + 1)
    expect(sparkMintCost(curve, 0n, tokens) <= 9n).toBe(true)
    expect(sparkMintCost(curve, 0n, tokens + 1n) > 9n).toBe(true)
    expect(sparkTokensForUsdc(curve, 0n, 0n)).toBe(0n)
  })

  it('parimutuel claim payout = balance × pool / winningSupply', () => {
    expect(sparkClaimPayout(100n, 1_000_000n, 400n)).toBe(250_000n)
    expect(sparkClaimPayout(0n, 1_000_000n, 400n)).toBe(0n)
    expect(sparkClaimPayout(100n, 1_000_000n, 0n)).toBe(0n)
  })
})

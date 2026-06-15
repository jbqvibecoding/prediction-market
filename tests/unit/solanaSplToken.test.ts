// @vitest-environment node
// ATA derivation uses sha256 (findProgramAddressSync); run in node so it matches
// a real browser (jsdom's realm breaks it).
import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  buildCreateAtaIdempotentInstruction,
  buildSplTransferToOwner,
  buildTransferCheckedInstruction,
} from '@/lib/solana/spl-token'

const mint = Keypair.generate().publicKey
const from = Keypair.generate().publicKey
const to = Keypair.generate().publicKey

describe('spl-token instruction builders', () => {
  it('transferChecked: tag 12 + amount + decimals, correct metas', () => {
    const source = associatedTokenAddress(mint, from)
    const destination = associatedTokenAddress(mint, to)
    const ix = buildTransferCheckedInstruction({
      mint, decimals: 6, owner: from, source, destination, amount: 1_500_000n,
    })
    expect(ix.programId.equals(TOKEN_PROGRAM_ID)).toBe(true)
    expect(ix.data[0]).toBe(12)
    expect(ix.data.readBigUInt64LE(1)).toBe(1_500_000n)
    expect(ix.data[9]).toBe(6)
    expect(ix.keys).toHaveLength(4)
    // [source(w), mint(ro), destination(w), owner(signer)]
    expect(ix.keys[0].isWritable).toBe(true)
    expect(ix.keys[1].pubkey.equals(mint)).toBe(true)
    expect(ix.keys[2].isWritable).toBe(true)
    expect(ix.keys[3].isSigner).toBe(true)
    expect(ix.keys.filter(k => k.isSigner)).toHaveLength(1)
  })

  it('create idempotent ATA: tag 1, payer is signer', () => {
    const ix = buildCreateAtaIdempotentInstruction({ payer: from, owner: to, mint })
    expect(ix.data).toEqual(Buffer.from([1]))
    expect(ix.keys[0].pubkey.equals(from)).toBe(true)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.keys[1].pubkey.equals(associatedTokenAddress(mint, to))).toBe(true)
    expect(ix.keys).toHaveLength(6)
  })

  it('buildSplTransferToOwner: create dest ATA then transfer', () => {
    const ixs = buildSplTransferToOwner({ mint, decimals: 6, fromOwner: from, toOwner: to, amount: 10n })
    expect(ixs).toHaveLength(2)
    // first creates the recipient ATA, second transfers from sender's ATA
    expect(ixs[0].data).toEqual(Buffer.from([1]))
    expect(ixs[1].data[0]).toBe(12)
    expect(ixs[1].keys[0].pubkey.equals(associatedTokenAddress(mint, from))).toBe(true)
    expect(ixs[1].keys[2].pubkey.equals(associatedTokenAddress(mint, to))).toBe(true)
  })
})

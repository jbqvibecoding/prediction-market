// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseGwei,
  parseUnits,
  stringToHex,
  zeroAddress,
} from '@/lib/eth-utils'

describe('eth-utils keccak256', () => {
  it('matches known keccak-256 vectors', () => {
    // keccak-256 (not SHA3-256) reference digests
    expect(keccak256(stringToHex(''))).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    )
    expect(keccak256(stringToHex('abc'))).toBe(
      '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
    )
    expect(keccak256(stringToHex('The quick brown fox jumps over the lazy dog'))).toBe(
      '0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15',
    )
  })
})

describe('eth-utils address helpers', () => {
  it('isAddress validates 20-byte hex', () => {
    expect(isAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(true)
    expect(isAddress('0x123')).toBe(false)
    expect(isAddress(zeroAddress)).toBe(true)
    expect(isAddress(42)).toBe(false)
  })

  it('getAddress produces EIP-55 checksums', () => {
    expect(getAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(
      '0x52908400098527886E0F7030069857D2E4169EE7',
    )
    expect(getAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    )
    expect(getAddress('0xde709f2102306220921060314715629080e2fb77')).toBe(
      '0xde709f2102306220921060314715629080e2fb77',
    )
    expect(() => getAddress('nope')).toThrow()
  })
})

describe('eth-utils unit helpers', () => {
  it('parseUnits / formatUnits round-trip', () => {
    expect(parseUnits('1.5', 6)).toBe(1_500_000n)
    expect(parseUnits('1', 18)).toBe(1_000_000_000_000_000_000n)
    expect(formatUnits(1_500_000n, 6)).toBe('1.5')
    expect(formatUnits(1_000_000n, 6)).toBe('1')
    expect(formatUnits(0n, 6)).toBe('0')
    expect(parseGwei('1')).toBe(1_000_000_000n)
  })
})

// bs58@4 ships no type declarations. Minimal typing for the base58 codec used
// to encode Solana ed25519 signatures.
declare module 'bs58' {
  const bs58: {
    encode: (buffer: Uint8Array | number[]) => string
    decode: (value: string) => Uint8Array
  }
  export default bs58
}

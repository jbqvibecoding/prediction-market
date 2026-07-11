import { NextResponse } from 'next/server'

// Solana: the LiFi cross-chain bridge is disabled (no Solana funding path).
export async function POST() {
  return NextResponse.json(
    { error: 'Cross-chain bridge funding is not available.' },
    { status: 400 },
  )
}

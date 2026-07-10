import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth-cron'

export const maxDuration = 300

/**
 * Solana: this cron previously executed EVM event-creation drafts on-chain
 * (server-side txPlan execution via viem wallet/public clients). On Solana the
 * market on-chain initialization is owned by the external market backend
 * (CREATE_MARKET_URL) together with the admin create flow, so this cron is
 * disabled. It is kept as an authorized no-op so the endpoint still responds
 * without error; all viem usage is removed.
 */
async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  if (!isCronAuthorized(auth, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    processed: 0,
    note: 'Event-creation on-chain sync is handled by the Solana market backend.',
  })
}

export async function GET(request: Request) {
  return handleRequest(request)
}

export async function POST(request: Request) {
  return handleRequest(request)
}

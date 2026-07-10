import type { Address } from '@/lib/eth-utils'
import { NextResponse } from 'next/server'
import { getAddress, isAddress } from '@/lib/eth-utils'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { AllowedMarketCreatorRepository } from '@/lib/db/queries/allowed-market-creators'
import { UserRepository } from '@/lib/db/queries/user'
import { loadEventCreationSignersFromEnv } from '@/lib/event-creation-signers'
import {
  getServerCreatorProposerWhitelistRegistryAddress,
  readCreatorProposerWhitelistStatus,
  readProposerWhitelistError,
  shortenProposerWhitelistAddress,
} from '@/lib/proposer-whitelist'

export const maxDuration = 120

async function requireAdmin() {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  return Boolean(currentUser?.is_admin)
}

function buildSignerMap() {
  return new Map(loadEventCreationSignersFromEnv().map(signer => [signer.address.toLowerCase(), signer]))
}

async function buildCreatorOptions() {
  const creatorsResult = await AllowedMarketCreatorRepository.list()
  if (creatorsResult.error || !creatorsResult.data) {
    throw new Error(creatorsResult.error ?? DEFAULT_ERROR_MESSAGE)
  }

  const signersByAddress = buildSignerMap()
  const creatorsByAddress = new Map<string, {
    address: Address
    displayName: string
    shortAddress: string
    hasServerSigner: boolean
  }>()

  for (const creator of creatorsResult.data) {
    if (!isAddress(creator.walletAddress)) {
      continue
    }
    const address = getAddress(creator.walletAddress) as Address
    creatorsByAddress.set(address.toLowerCase(), {
      address,
      displayName: creator.displayName,
      shortAddress: shortenProposerWhitelistAddress(address),
      hasServerSigner: signersByAddress.has(address.toLowerCase()),
    })
  }

  return [...creatorsByAddress.values()]
}

async function buildStatusResponse(creatorParam: string | null) {
  const registryAddress = getServerCreatorProposerWhitelistRegistryAddress()
  const creators = await buildCreatorOptions()

  if (!creatorParam) {
    return {
      registryAddress,
      creators,
      status: null,
    }
  }

  if (!isAddress(creatorParam)) {
    throw new Error('Invalid creator address.')
  }

  const creator = getAddress(creatorParam) as Address
  const signersByAddress = buildSignerMap()
  const status = await readCreatorProposerWhitelistStatus({
    creator,
    registryAddress,
    hasServerSigner: signersByAddress.has(creator.toLowerCase()),
  })

  return {
    registryAddress,
    creators,
    status,
  }
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    }

    const creator = new URL(request.url).searchParams.get('creator')
    if (creator && !isAddress(creator)) {
      return NextResponse.json({ error: 'Invalid creator address.' }, { status: 400 })
    }

    return NextResponse.json(await buildStatusResponse(creator))
  }
  catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
    }, { status: 500 })
  }
}

export async function POST() {
  // Solana: the EVM per-creator proposer-whitelist contracts (deploy/register/
  // add/remove) have no on-chain analog — the conditional_token program binds a
  // single resolve authority to each condition at creation. Whitelist mutation
  // is disabled (see AdminProposersDialog).
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Proposer whitelist management is not available on Solana.' },
      { status: 400 },
    )
  }
  catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: readProposerWhitelistError(error) }, { status: 500 })
  }
}

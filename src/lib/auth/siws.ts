import type { Session, User } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import * as z from 'zod'
import { isSolanaAddress, verifySignInSignature } from '@/lib/solana/auth'

/**
 * Sign-In With Solana (SIWS) — a base58-aware better-auth plugin, modelled on
 * better-auth's built-in `siwe` plugin (which hard-rejects non-0x addresses at
 * its endpoint schema). Reuses the `walletAddress` model registered by the siwe
 * plugin, so keep `siwe()` in the plugins list alongside this one.
 *
 * Endpoints (mounted under the auth base path, e.g. /api/auth):
 *   POST /siws/nonce   { address }                       -> { nonce }
 *   POST /siws/verify  { message, signature, address }   -> { success, token, user }
 */
export interface SiwsPluginOptions {
  /** site domain (host), used in the CACAO-style payload. */
  domain: string
  /** domain used to synthesise placeholder emails for wallet users. */
  emailDomainName: string
  /** override nonce generation (defaults to a 32-char random string). */
  getNonce?: () => Promise<string>
}

// Solana has no EVM-style chain id; use a fixed sentinel for the wallets row.
const SOLANA_CHAIN_ID = 0
const NONCE_TTL_MS = 900 * 1000

const addressSchema = z.string().min(32).max(44)

export function siws(options: SiwsPluginOptions) {
  const getNonce = options.getNonce ?? (async () => generateRandomString(32))

  const ensureSolana = (address: string): void => {
    if (!isSolanaAddress(address)) {
      throw APIError.fromStatus('BAD_REQUEST', {
        message: 'A valid base58 Solana address is required',
        status: 400,
      })
    }
  }

  const nonceIdentifier = (address: string): string =>
    `siws:${address}:${SOLANA_CHAIN_ID}`

  return {
    id: 'siws',
    endpoints: {
      getSiwsNonce: createAuthEndpoint(
        '/siws/nonce',
        { method: 'POST', body: z.object({ address: addressSchema }) },
        async (ctx) => {
          const { address } = ctx.body
          ensureSolana(address)
          const nonce = await getNonce()
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: nonceIdentifier(address),
            value: nonce,
            expiresAt: new Date(Date.now() + NONCE_TTL_MS),
          })
          return ctx.json({ nonce })
        },
      ),

      verifySiwsMessage: createAuthEndpoint(
        '/siws/verify',
        {
          method: 'POST',
          body: z.object({
            message: z.string().min(1),
            signature: z.string().min(1),
            address: addressSchema,
          }),
          requireRequest: true,
        },
        async (ctx) => {
          const { message, signature, address } = ctx.body
          ensureSolana(address)

          try {
            const verification = await ctx.context.internalAdapter.findVerificationValue(
              nonceIdentifier(address),
            )
            if (!verification || new Date() > verification.expiresAt) {
              throw APIError.fromStatus('UNAUTHORIZED', {
                message: 'Unauthorized: Invalid or expired nonce',
                status: 401,
              })
            }

            // The signed message must embed the server-issued nonce.
            if (!message.includes(`Nonce: ${verification.value}`)) {
              throw APIError.fromStatus('UNAUTHORIZED', {
                message: 'Unauthorized: nonce mismatch',
                status: 401,
              })
            }

            if (!verifySignInSignature({ message, signature, address })) {
              throw APIError.fromStatus('UNAUTHORIZED', {
                message: 'Unauthorized: Invalid SIWS signature',
                status: 401,
              })
            }

            await ctx.context.internalAdapter.deleteVerificationByIdentifier(
              nonceIdentifier(address),
            )

            let user: User | null = null
            const existingWallet = await ctx.context.adapter.findOne<{ userId: string }>({
              model: 'walletAddress',
              where: [
                { field: 'address', operator: 'eq', value: address },
                { field: 'chainId', operator: 'eq', value: SOLANA_CHAIN_ID },
              ],
            })
            if (existingWallet) {
              user = await ctx.context.adapter.findOne<User>({
                model: 'user',
                where: [{ field: 'id', operator: 'eq', value: existingWallet.userId }],
              })
            }

            if (!user) {
              const email = `${address}@${options.emailDomainName}`
              user = await ctx.context.internalAdapter.createUser({
                name: address,
                email,
                image: '',
              })
              await ctx.context.adapter.create({
                model: 'walletAddress',
                data: {
                  userId: user.id,
                  address,
                  chainId: SOLANA_CHAIN_ID,
                  isPrimary: true,
                  createdAt: new Date(),
                },
              })
              await ctx.context.internalAdapter.createAccount({
                userId: user.id,
                providerId: 'siws',
                accountId: `${address}:${SOLANA_CHAIN_ID}`,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            }

            const session: Session | null = await ctx.context.internalAdapter.createSession(
              user.id,
            )
            if (!session) {
              throw APIError.fromStatus('INTERNAL_SERVER_ERROR', {
                message: 'Internal Server Error',
                status: 500,
              })
            }

            await setSessionCookie(ctx, { session, user })

            return ctx.json({
              token: session.token,
              success: true,
              user: { id: user.id, walletAddress: address, chainId: SOLANA_CHAIN_ID },
            })
          } catch (error) {
            if (error instanceof APIError) throw error
            throw APIError.fromStatus('UNAUTHORIZED', {
              message: 'Something went wrong. Please try again later.',
              status: 401,
            })
          }
        },
      ),
    },
  }
}

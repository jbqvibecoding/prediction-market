import type { BetterAuthClientPlugin } from 'better-auth'
import type { siws } from './siws'

/**
 * Client counterpart of the {@link siws} server plugin. Exposes
 * `authClient.siws.nonce` / `authClient.siws.verify` and lets better-auth infer
 * their types from the server plugin.
 */
export function siwsClient() {
  return {
    id: 'siws',
    $InferServerPlugin: {} as ReturnType<typeof siws>,
    pathMethods: {
      '/siws/nonce': 'POST',
      '/siws/verify': 'POST',
    },
  } satisfies BetterAuthClientPlugin
}

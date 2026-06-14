'use client'

import { siweClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { siwsClient } from '@/lib/auth/siws-client'
import { buildTwoFactorRedirectPath } from '@/lib/locale-path'

const siweSessionClient = {
  ...siweClient(),
  atomListeners: [
    {
      matcher(path: string) {
        return path === '/siwe/verify'
      },
      signal: '$sessionSignal',
    },
  ],
}

const siwsSessionClient = {
  ...siwsClient(),
  atomListeners: [
    {
      matcher(path: string) {
        return path === '/siws/verify'
      },
      signal: '$sessionSignal',
    },
  ],
}

export const authClient = createAuthClient({
  plugins: [
    siweSessionClient,
    siwsSessionClient,
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = buildTwoFactorRedirectPath(window.location.pathname, window.location.search)
      },
    }),
  ],
})

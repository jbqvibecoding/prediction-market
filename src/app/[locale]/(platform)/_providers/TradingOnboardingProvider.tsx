'use client'

import type { ReactNode } from 'react'
import type { TradingOnboardingContextValue } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import type { CommunityProfile } from '@/lib/community-profile'
import type { User } from '@/types'
import { useExtracted } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  updateOnboardingEmailAction,
  updateOnboardingUsernameAction,
} from '@/app/[locale]/(platform)/_actions/deposit-wallet'
import TradingOnboardingDialogs from '@/app/[locale]/(platform)/_components/TradingOnboardingDialogs'
import {
  TradingOnboardingContext,
  useTradingOnboarding,
} from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import { useAffiliateOrderMetadata } from '@/hooks/useAffiliateOrderMetadata'
import { useAppKit } from '@/hooks/useAppKit'
import { useDepositWalletPolling } from '@/hooks/useDepositWalletPolling'
import { useSignaturePromptRunner } from '@/hooks/useSignaturePromptRunner'
import { useWalletConnection } from '@/hooks/useWalletConnection'
import { authClient } from '@/lib/auth-client'
import {
  COMMUNITY_PROFILE_LOOKUP_TIMEOUT_MS,
  fetchCommunityProfileByAddress,
} from '@/lib/community-profile'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { hasUsableUserEmail } from '@/lib/user-email'
import { isUserRejectedRequestError } from '@/lib/wallet'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

type OnboardingModal = 'username' | 'email' | 'enable' | 'enable-status' | 'approve' | 'auto-redeem' | null
type EnableTradingStep = 'idle' | 'enabling' | 'deploying' | 'completed'
type ApprovalsStep = 'idle' | 'signing' | 'completed'
interface OpenNextRequirementOptions {
  forceTradingAuth?: boolean
  allowTradingAuthPrompt?: boolean
}

export function TradingOnboardingProvider({ children }: { children: ReactNode }) {
  const user = useUser()

  return (
    <TradingOnboardingProviderContent
      key={user?.id ?? 'guest'}
      user={user}
    >
      {children}
    </TradingOnboardingProviderContent>
  )
}

interface TradingOnboardingProviderContentProps {
  children: ReactNode
  user: User | null
}

function isGeneratedDepositWalletUsername(username?: string | null, depositWalletAddress?: string | null) {
  const trimmedUsername = username?.trim()
  const trimmedDepositWalletAddress = depositWalletAddress?.trim()
  if (!trimmedUsername || !trimmedDepositWalletAddress) {
    return false
  }

  const prefix = `${trimmedDepositWalletAddress.toLowerCase()}-`
  const normalizedUsername = trimmedUsername.toLowerCase()
  if (!normalizedUsername.startsWith(prefix)) {
    return false
  }

  return /^\d+$/.test(normalizedUsername.slice(prefix.length))
}

function hasUserProvidedUsername(user: User) {
  const username = user.username?.trim()
  return Boolean(
    username
    && !isGeneratedDepositWalletUsername(username, user.deposit_wallet_address),
  )
}

function getUsernameDefaultValue(user: User | null) {
  if (!user?.username) {
    return ''
  }
  if (isGeneratedDepositWalletUsername(user.username, user.deposit_wallet_address)) {
    return ''
  }
  return user.username
}

function useSessionRefresher() {
  return useCallback(async () => {
    try {
      const session = await authClient.getSession({
        query: {
          disableCookieCache: true,
        },
      })
      const sessionUser = session?.data?.user as User | undefined
      if (sessionUser) {
        useUser.setState((previous) => {
          return mergeSessionUserState(previous, sessionUser)
        })
      }
    }
    catch (error) {
      console.error('Failed to refresh user session', error)
    }
  }, [])
}

function mergeUserSettings(previous: User, settingsPatch?: Record<string, any>) {
  if (!settingsPatch) {
    return previous.settings
  }

  return {
    ...(previous.settings ?? {}),
    ...settingsPatch,
    onboarding: {
      ...(previous.settings?.onboarding ?? {}),
      ...(settingsPatch.onboarding ?? {}),
    },
    tradingAuth: {
      ...(previous.settings?.tradingAuth ?? {}),
      ...(settingsPatch.tradingAuth ?? {}),
    },
  }
}

function useOnboardingStatus(user: User | null, requiresTradingAuthRefresh: boolean) {
  return useMemo(() => {
    const onboardingSettings = user?.settings?.onboarding ?? {}
    const hasUsername = Boolean(user && hasUserProvidedUsername(user))
    const needsUsername = Boolean(user && !hasUsername)
    const needsEmail = Boolean(
      user
      && !hasUsableUserEmail(user.email)
      && !onboardingSettings.emailSkippedAt
      && !onboardingSettings.emailCompletedAt,
    )
    const hasDepositWalletAddress = Boolean(user?.deposit_wallet_address)
    // Solana: there is no deposit-wallet deployment, trading-auth relayer, or
    // ERC20/1155 token-approval onboarding — a signed-in user is fully ready.
    // (The EVM onboarding handlers/dialogs below are removed with wagmi in G.)
    const hasDeployedDepositWallet = Boolean(user)
    const isDepositWalletDeploying = false
    const hasTradingAuth = Boolean(user)
    const hasTokenApprovals = Boolean(user)
    const hasAutoRedeemApproval = Boolean(user)
    const tradingReady = Boolean(user)

    return {
      needsUsername,
      needsEmail,
      hasDepositWalletAddress,
      hasDeployedDepositWallet,
      isDepositWalletDeploying,
      hasTradingAuth,
      hasTokenApprovals,
      hasAutoRedeemApproval,
      tradingReady,
    }
  }, [requiresTradingAuthRefresh, user])
}

function resolveNextOnboardingModal({
  needsUsername,
  needsEmail,
  hasDeployedDepositWallet,
  hasTradingAuth,
  hasTokenApprovals,
  allowTradingAuthPrompt,
}: {
  needsUsername: boolean
  needsEmail: boolean
  hasDeployedDepositWallet: boolean
  hasTradingAuth: boolean
  hasTokenApprovals: boolean
  allowTradingAuthPrompt: boolean
}): Exclude<OnboardingModal, null> | null {
  if (needsUsername) {
    return 'username'
  }
  if (needsEmail) {
    return 'email'
  }
  if (!hasDeployedDepositWallet) {
    return 'enable'
  }
  if (allowTradingAuthPrompt && !hasTradingAuth) {
    return 'enable-status'
  }
  if (allowTradingAuthPrompt && !hasTokenApprovals) {
    return 'approve'
  }
  return null
}

function openNextModalWhenAvailable({
  activeModal,
  depositModalOpen,
  dismissedModal,
  fundModalOpen,
  nextModal,
  setActiveModal,
  user,
  withdrawModalOpen,
}: {
  activeModal: OnboardingModal
  depositModalOpen: boolean
  dismissedModal: OnboardingModal
  fundModalOpen: boolean
  nextModal: Exclude<OnboardingModal, null> | null
  setActiveModal: (modal: OnboardingModal) => void
  user: User | null
  withdrawModalOpen: boolean
}) {
  if (!user || activeModal || fundModalOpen || depositModalOpen || withdrawModalOpen) {
    return
  }
  if (!nextModal) {
    return
  }
  if (dismissedModal === nextModal) {
    return
  }
  setActiveModal(nextModal)
}

function completeDepositWalletDeployment({
  enableTradingStep,
  hasDeployedDepositWallet,
  hasTokenApprovals,
  setActiveModal,
  setEnableTradingStep,
}: {
  enableTradingStep: EnableTradingStep
  hasDeployedDepositWallet: boolean
  hasTokenApprovals: boolean
  setActiveModal: (modal: OnboardingModal) => void
  setEnableTradingStep: (step: EnableTradingStep) => void
}) {
  if (hasDeployedDepositWallet && enableTradingStep === 'deploying') {
    setEnableTradingStep('completed')
    if (!hasTokenApprovals) {
      setActiveModal('approve')
    }
    else {
      setActiveModal(null)
    }
  }
}

async function hasDepositWalletCollateralBalance(_depositWalletAddress: string) {
  // Solana: the EVM deposit-wallet collateral read is removed. Balance is read
  // from the connected wallet's USDC ATA elsewhere (useBalance); treat as funded
  // here so the fund modal is not force-opened.
  return true
}

function openFundModalAfterTradingReady({
  hasDeployedDepositWallet,
  hasTokenApprovals,
  setFundModalOpen,
  setShouldShowFundAfterTradingReady,
  shouldShowFundAfterTradingReady,
}: {
  hasDeployedDepositWallet: boolean
  hasTokenApprovals: boolean
  setFundModalOpen: (open: boolean) => void
  setShouldShowFundAfterTradingReady: (shouldShow: boolean) => void
  shouldShowFundAfterTradingReady: boolean
}) {
  if (hasDeployedDepositWallet && hasTokenApprovals && shouldShowFundAfterTradingReady) {
    setShouldShowFundAfterTradingReady(false)
    setFundModalOpen(true)
  }
}

function TradingOnboardingProviderContent({
  children,
  user,
}: TradingOnboardingProviderContentProps) {
  const [activeModal, setActiveModal] = useState<OnboardingModal>(null)
  const [dismissedModal, setDismissedModal] = useState<OnboardingModal>(null)
  const [fundModalOpen, setFundModalOpen] = useState(false)
  const [shouldShowFundAfterTradingReady, setShouldShowFundAfterTradingReady] = useState(false)
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [enableTradingError, setEnableTradingError] = useState<string | null>(null)
  const [tokenApprovalError, setTokenApprovalError] = useState<string | null>(null)
  const [autoRedeemError, setAutoRedeemError] = useState<string | null>(null)
  const [isUsernameSubmitting, setIsUsernameSubmitting] = useState(false)
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)
  const [enableTradingStep, setEnableTradingStep] = useState<EnableTradingStep>('idle')
  const [approvalsStep, setApprovalsStep] = useState<ApprovalsStep>('idle')
  const [autoRedeemStep, setAutoRedeemStep] = useState<ApprovalsStep>('idle')
  const [requiresTradingAuthRefresh, setRequiresTradingAuthRefresh] = useState(false)
  const [shouldContinueTradingAuthPrompt, setShouldContinueTradingAuthPrompt] = useState(false)
  const [communityUsernameHint, setCommunityUsernameHint] = useState<{
    address: string
    username: string
  } | null>(null)
  const { open: openWalletConnect } = useWalletConnection()
  const { runWithSignaturePrompt } = useSignaturePromptRunner()
  const t = useExtracted()
  const pathname = usePathname()
  const affiliateMetadata = useAffiliateOrderMetadata()
  const { open: openAppKit } = useAppKit()
  const refreshSessionUserState = useSessionRefresher()
  const communityApiUrl = process.env.COMMUNITY_URL!

  const status = useOnboardingStatus(user, requiresTradingAuthRefresh)
  const normalizedUserAddress = user?.address?.trim().toLowerCase() ?? ''
  const hasMatchingCommunityUsernameHint = Boolean(
    communityUsernameHint
    && normalizedUserAddress
    && communityUsernameHint.address.trim().toLowerCase() === normalizedUserAddress,
  )
  const communityUsernameHintForCurrentUser = hasMatchingCommunityUsernameHint ? communityUsernameHint : null

  useEffect(function preloadCommunityUsernameHint() {
    if (!user?.address || !status.needsUsername || activeModal !== 'username' || hasMatchingCommunityUsernameHint) {
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, COMMUNITY_PROFILE_LOOKUP_TIMEOUT_MS)
    let cancelled = false

    fetchCommunityProfileByAddress({
      communityApiUrl,
      address: user.address,
      signal: controller.signal,
    })
      .then((profile) => {
        if (cancelled) {
          return
        }

        const username = profile?.username?.trim()
        if (username) {
          setCommunityUsernameHint({
            address: user.address,
            username,
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        if (!cancelled) {
          console.error('Failed to preload community username', error)
        }
      })

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeModal, communityApiUrl, hasMatchingCommunityUsernameHint, status.needsUsername, user?.address])

  useDepositWalletPolling({
    userId: user?.id,
    depositWalletAddress: user?.deposit_wallet_address,
    depositWalletStatus: user?.deposit_wallet_status,
    hasDeployedDepositWallet: status.hasDeployedDepositWallet,
    hasDepositWalletAddress: status.hasDepositWalletAddress,
  })

  const isEventRoute = pathname.includes('/event/')
  const nextModal = resolveNextOnboardingModal({
    ...status,
    allowTradingAuthPrompt: isEventRoute,
  })

  useEffect(function syncNextOnboardingModal() {
    openNextModalWhenAvailable({
      activeModal,
      depositModalOpen,
      dismissedModal,
      fundModalOpen,
      nextModal,
      setActiveModal,
      user,
      withdrawModalOpen,
    })
  }, [activeModal, depositModalOpen, dismissedModal, fundModalOpen, nextModal, user, withdrawModalOpen])

  useEffect(function syncDepositWalletDeploymentCompletion() {
    completeDepositWalletDeployment({
      enableTradingStep,
      hasDeployedDepositWallet: status.hasDeployedDepositWallet,
      hasTokenApprovals: status.hasTokenApprovals,
      setActiveModal,
      setEnableTradingStep,
    })
  }, [enableTradingStep, status.hasDeployedDepositWallet, status.hasTokenApprovals])

  useEffect(function syncFundModalAfterTradingReady() {
    openFundModalAfterTradingReady({
      hasDeployedDepositWallet: status.hasDeployedDepositWallet,
      hasTokenApprovals: status.hasTokenApprovals,
      setFundModalOpen,
      setShouldShowFundAfterTradingReady,
      shouldShowFundAfterTradingReady,
    })
  }, [shouldShowFundAfterTradingReady, status.hasDeployedDepositWallet, status.hasTokenApprovals])

  const openNextRequirement = useCallback((options?: OpenNextRequirementOptions) => {
    if (!user) {
      void openAppKit()
      return
    }

    if (options?.forceTradingAuth) {
      setRequiresTradingAuthRefresh(true)
    }

    setDismissedModal(null)
    setUsernameError(null)
    setEmailError(null)
    setEnableTradingError(null)
    setTokenApprovalError(null)
    setAutoRedeemError(null)
    void refreshSessionUserState()

    const allowTradingAuthPrompt = Boolean(options?.allowTradingAuthPrompt)
      || Boolean(options?.forceTradingAuth)
      || isEventRoute
    setShouldContinueTradingAuthPrompt(allowTradingAuthPrompt)

    const forcedStatus = options?.forceTradingAuth
      ? { ...status, hasTradingAuth: false, tradingReady: false }
      : status
    const modal = resolveNextOnboardingModal({
      ...forcedStatus,
      allowTradingAuthPrompt,
    })
    setActiveModal(modal)
  }, [isEventRoute, openAppKit, refreshSessionUserState, status, user])

  const openFundModalIfBalanceEmpty = useCallback(async () => {
    if (!user?.deposit_wallet_address) {
      setFundModalOpen(true)
      return
    }

    try {
      const hasBalance = await hasDepositWalletCollateralBalance(user.deposit_wallet_address as `0x${string}`)
      if (!hasBalance) {
        setFundModalOpen(true)
      }
    }
    catch {
      setFundModalOpen(true)
    }
  }, [user?.deposit_wallet_address])

  const handleModalOpenChange = useCallback((modal: Exclude<OnboardingModal, null>, open: boolean) => {
    if (open) {
      setDismissedModal(null)
      setActiveModal(modal)
      return
    }
    if (modal === 'username' && status.needsUsername) {
      setDismissedModal(null)
      setActiveModal('username')
      return
    }
    if (modal === 'email' && status.needsEmail) {
      setDismissedModal(null)
      setActiveModal('email')
      return
    }
    if ((modal === 'enable' || modal === 'enable-status') && !enableTradingError) {
      setDismissedModal(null)
      setActiveModal(modal)
      return
    }
    if (modal === 'approve' && !tokenApprovalError) {
      setDismissedModal(null)
      setActiveModal('approve')
      return
    }
    if (modal === 'auto-redeem') {
      setDismissedModal(modal)
      setActiveModal(null)
      setShouldContinueTradingAuthPrompt(false)
      setShouldShowFundAfterTradingReady(false)
      void openFundModalIfBalanceEmpty()
      return
    }
    setDismissedModal(modal)
    setActiveModal(null)
    setShouldContinueTradingAuthPrompt(false)
  }, [
    enableTradingError,
    openFundModalIfBalanceEmpty,
    status.needsEmail,
    status.needsUsername,
    tokenApprovalError,
  ])

  const handleUsernameSubmit = useCallback(async (username: string, termsAccepted: boolean) => {
    if (isUsernameSubmitting) {
      return
    }
    if (!user?.address) {
      setUsernameError(DEFAULT_ERROR_MESSAGE)
      return
    }
    setIsUsernameSubmitting(true)
    setUsernameError(null)
    try {
      // Solana: community profile sync used EVM wallet message signing and is
      // disabled until the community backend accepts Solana signatures. The
      // username still saves to our DB below.
      const communityUsername = username

      const result = await updateOnboardingUsernameAction({
        username,
        communityUsername,
        termsAccepted,
      })
      if (result.error || !result.data) {
        setUsernameError(
          result.code === 'username_taken'
            ? t('That username is already taken.')
            : result.code === 'community_profile_not_synced'
              ? t('Community profile did not confirm the username.')
              : result.error ?? DEFAULT_ERROR_MESSAGE,
        )
        return
      }
      const data = result.data
      useUser.setState((previous) => {
        if (!previous) {
          return previous
        }
        return {
          ...previous,
          username: data.username,
          settings: mergeUserSettings(previous, data.settings),
        }
      })
      void refreshSessionUserState()
      setDismissedModal(null)
      const allowTradingAuthPrompt = shouldContinueTradingAuthPrompt || isEventRoute
      const nextModal = status.needsEmail
        ? 'email'
        : resolveNextOnboardingModal({
            ...status,
            needsUsername: false,
            allowTradingAuthPrompt,
          })
      setActiveModal(nextModal)
      if (!nextModal) {
        setShouldContinueTradingAuthPrompt(false)
      }
    }
    catch (error) {
      setUsernameError(
        isUserRejectedRequestError(error)
          ? t('You rejected the signature request.')
          : error instanceof Error
            ? error.message
            : DEFAULT_ERROR_MESSAGE,
      )
    }
    finally {
      setIsUsernameSubmitting(false)
    }
  }, [
    isUsernameSubmitting,
    refreshSessionUserState,
    shouldContinueTradingAuthPrompt,
    status,
    t,
    user?.address,
    isEventRoute,
  ])

  const handleEmailSubmit = useCallback(async (email: string) => {
    if (isEmailSubmitting) {
      return
    }
    setIsEmailSubmitting(true)
    setEmailError(null)
    try {
      const result = await updateOnboardingEmailAction({ email })
      if (result.error || !result.data) {
        setEmailError(result.error ?? DEFAULT_ERROR_MESSAGE)
        return
      }
      const data = result.data
      useUser.setState((previous) => {
        if (!previous) {
          return previous
        }
        return {
          ...previous,
          email: data.email,
          settings: mergeUserSettings(previous, data.settings),
        }
      })
      void refreshSessionUserState()
      setDismissedModal(null)
      const allowTradingAuthPrompt = shouldContinueTradingAuthPrompt || isEventRoute
      const nextModal = resolveNextOnboardingModal({
        ...status,
        needsEmail: false,
        allowTradingAuthPrompt,
      })
      setActiveModal(nextModal)
      if (!nextModal) {
        setShouldContinueTradingAuthPrompt(false)
      }
    }
    finally {
      setIsEmailSubmitting(false)
    }
  }, [isEmailSubmitting, refreshSessionUserState, shouldContinueTradingAuthPrompt, status, isEventRoute])

  const handleEmailSkip = useCallback(async () => {
    if (isEmailSubmitting) {
      return
    }
    setIsEmailSubmitting(true)
    setEmailError(null)
    try {
      const result = await updateOnboardingEmailAction({ skip: true })
      if (result.error || !result.data) {
        setEmailError(result.error ?? DEFAULT_ERROR_MESSAGE)
        return
      }
      const data = result.data
      useUser.setState((previous) => {
        if (!previous) {
          return previous
        }
        return {
          ...previous,
          settings: mergeUserSettings(previous, data.settings),
        }
      })
      void refreshSessionUserState()
      setDismissedModal(null)
      const allowTradingAuthPrompt = shouldContinueTradingAuthPrompt || isEventRoute
      const nextModal = resolveNextOnboardingModal({
        ...status,
        needsEmail: false,
        allowTradingAuthPrompt,
      })
      setActiveModal(nextModal)
      if (!nextModal) {
        setShouldContinueTradingAuthPrompt(false)
      }
    }
    finally {
      setIsEmailSubmitting(false)
    }
  }, [isEmailSubmitting, refreshSessionUserState, shouldContinueTradingAuthPrompt, status, isEventRoute])

  const enableTradingAuthForCurrentUser = useCallback(async () => {
    // Solana: there is no EVM trading-auth (relayer/CLOB EIP-712) step. No-op.
    setRequiresTradingAuthRefresh(false)
    setDismissedModal(null)
  }, [])

  const handleCreateDepositWallet = useCallback(async () => {
    // Solana: no EVM deposit-wallet deployment. A connected, signed-in user is
    // trading-ready (status is forced ready), so this is a no-op.
    setEnableTradingStep('completed')
    setDismissedModal(null)
    setActiveModal(null)
  }, [])

  const handleEnableTradingAuth = useCallback(async () => {
    // Solana: no EVM trading-auth step. No-op (status is trading-ready).
    setEnableTradingStep('completed')
    setActiveModal(null)
  }, [])

  const resolveReferralExchanges = useCallback(async (_depositWallet: string): Promise<string[]> => {
    // Solana: EVM referral/exchange reads removed.
    return []
  }, [])

  const resolveMissingApprovalCalls = useCallback(async (_depositWalletAddress: string): Promise<unknown[]> => {
    // Solana: no EVM ERC20/1155 approvals; nothing to approve.
    return []
  }, [])

  const ensureAutoRedeemStatusFromChain = useCallback(async (_depositWalletAddress: string) => {
    // Solana: no EVM auto-redeem operator approval; treat as approved.
    return true
  }, [])

  const handleApproveTokens = useCallback(async () => {
    // Solana: no EVM ERC20/1155 token approvals. Treat approvals as complete and
    // continue the (Solana-ready) flow.
    setApprovalsStep('completed')
    setDismissedModal(null)
    setActiveModal(null)
    setShouldShowFundAfterTradingReady(false)
    await openFundModalIfBalanceEmpty()
  }, [openFundModalIfBalanceEmpty])

  const handleApproveAutoRedeem = useCallback(async () => {
    // Solana: no EVM auto-redeem approval. Treat as complete.
    setAutoRedeemStep('completed')
    setDismissedModal(null)
    setActiveModal(null)
    setShouldShowFundAfterTradingReady(false)
    await openFundModalIfBalanceEmpty()
  }, [openFundModalIfBalanceEmpty])

  const ensureTradingReady = useCallback(() => {
    if (!user) {
      openWalletConnect()
      return false
    }

    // Solana: no EVM deposit-wallet / token-approval onboarding — a connected,
    // signed-in user is trading-ready. (The legacy EVM onboarding machinery
    // below is removed with wagmi in Phase G.)
    return true
  }, [openWalletConnect, user])

  const openTradeRequirements = useCallback((options?: { forceTradingAuth?: boolean }) => {
    openNextRequirement({
      ...options,
      allowTradingAuthPrompt: true,
    })
  }, [openNextRequirement])

  const promptAutoRedeem = useCallback(() => {
    if (!user) {
      void openAppKit()
      return false
    }
    if (status.hasAutoRedeemApproval) {
      return false
    }
    if (!status.tradingReady) {
      openNextRequirement({ allowTradingAuthPrompt: true })
      return false
    }
    if (!user.deposit_wallet_address) {
      return false
    }

    void ensureAutoRedeemStatusFromChain(user.deposit_wallet_address as `0x${string}`)
      .then((hasAutoRedeemOnChain) => {
        if (hasAutoRedeemOnChain) {
          return
        }

        setDismissedModal(null)
        setAutoRedeemStep('idle')
        setAutoRedeemError(null)
        setShouldContinueTradingAuthPrompt(false)
        setShouldShowFundAfterTradingReady(false)
        setActiveModal('auto-redeem')
      })
      .catch((error) => {
        console.warn('Failed to verify auto-redeem approval before prompting.', error)
        setDismissedModal(null)
        setAutoRedeemStep('idle')
        setAutoRedeemError(null)
        setShouldContinueTradingAuthPrompt(false)
        setShouldShowFundAfterTradingReady(false)
        setActiveModal('auto-redeem')
      })
    return true
  }, [
    ensureAutoRedeemStatusFromChain,
    openAppKit,
    openNextRequirement,
    status.hasAutoRedeemApproval,
    status.tradingReady,
    user,
  ])

  const openWalletModal = useCallback(() => {
    if (!user) {
      void openAppKit()
      return
    }
    if (!status.hasDeployedDepositWallet) {
      openNextRequirement()
      return
    }
    setDepositModalOpen(true)
  }, [openAppKit, openNextRequirement, status.hasDeployedDepositWallet, user])

  const startDepositFlow = useCallback(() => {
    if (!user) {
      void openAppKit()
      return
    }

    if (status.hasDeployedDepositWallet) {
      setDepositModalOpen(true)
      return
    }

    setShouldShowFundAfterTradingReady(true)
    openNextRequirement()
  }, [openAppKit, openNextRequirement, status.hasDeployedDepositWallet, user])

  const startWithdrawFlow = useCallback(() => {
    if (!user) {
      void openAppKit()
      return
    }

    if (!status.hasDeployedDepositWallet) {
      openNextRequirement()
      return
    }

    setWithdrawModalOpen(true)
  }, [openAppKit, openNextRequirement, status.hasDeployedDepositWallet, user])

  const closeFundModal = useCallback((nextOpen: boolean) => {
    setFundModalOpen(nextOpen)
    if (!nextOpen) {
      setShouldShowFundAfterTradingReady(false)
    }
  }, [])

  const contextValue: TradingOnboardingContextValue = useMemo(() => ({
    startDepositFlow,
    startWithdrawFlow,
    ensureTradingReady,
    openTradeRequirements,
    promptAutoRedeem,
    hasDepositWallet: status.hasDeployedDepositWallet,
    openWalletModal,
  }), [
    ensureTradingReady,
    openTradeRequirements,
    openWalletModal,
    promptAutoRedeem,
    startDepositFlow,
    startWithdrawFlow,
    status.hasDeployedDepositWallet,
  ])

  const meldUrl = useMemo(() => {
    if (!status.hasDeployedDepositWallet || !user?.deposit_wallet_address) {
      return null
    }
    const params = new URLSearchParams({
      destinationCurrencyCodeLocked: 'USDC_POLYGON',
      walletAddressLocked: user.deposit_wallet_address,
    })
    return `https://meldcrypto.com/?${params.toString()}`
  }, [status.hasDeployedDepositWallet, user?.deposit_wallet_address])

  return (
    <TradingOnboardingContext value={contextValue}>
      {children}

      <TradingOnboardingDialogs
        activeModal={activeModal}
        onModalOpenChange={handleModalOpenChange}
        usernameDefaultValue={communityUsernameHintForCurrentUser?.username ?? getUsernameDefaultValue(user)}
        usernameError={usernameError}
        isUsernameSubmitting={isUsernameSubmitting}
        onUsernameSubmit={handleUsernameSubmit}
        emailDefaultValue={hasUsableUserEmail(user?.email) ? user?.email ?? '' : ''}
        emailError={emailError}
        isEmailSubmitting={isEmailSubmitting}
        onEmailSubmit={handleEmailSubmit}
        onEmailSkip={handleEmailSkip}
        enableTradingStep={status.isDepositWalletDeploying ? 'deploying' : enableTradingStep}
        enableTradingError={enableTradingError}
        onCreateDepositWallet={handleCreateDepositWallet}
        onEnableTradingAuth={handleEnableTradingAuth}
        hasDeployedDepositWallet={status.hasDeployedDepositWallet}
        hasTradingAuth={status.hasTradingAuth}
        hasTokenApprovals={status.hasTokenApprovals}
        approvalsStep={approvalsStep}
        tokenApprovalError={tokenApprovalError}
        onApproveTokens={handleApproveTokens}
        autoRedeemStep={autoRedeemStep}
        autoRedeemError={autoRedeemError}
        onApproveAutoRedeem={handleApproveAutoRedeem}
        fundModalOpen={fundModalOpen}
        onFundOpenChange={closeFundModal}
        onFundDeposit={() => {
          closeFundModal(false)
          openWalletModal()
        }}
        depositModalOpen={depositModalOpen}
        onDepositOpenChange={setDepositModalOpen}
        withdrawModalOpen={withdrawModalOpen}
        onWithdrawOpenChange={setWithdrawModalOpen}
        user={user}
        meldUrl={meldUrl}
      />
    </TradingOnboardingContext>
  )
}

export { useTradingOnboarding }

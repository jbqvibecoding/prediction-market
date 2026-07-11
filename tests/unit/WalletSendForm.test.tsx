import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import WalletSendForm from '@/app/[locale]/(platform)/_components/wallet-modal/WalletSendForm'

vi.mock('next/image', () => ({
  default: function MockImage(props: any) {
    return createElement('img', props)
  },
}))

function renderWalletSendForm(overrides: Partial<ComponentProps<typeof WalletSendForm>> = {}) {
  return render(
    <WalletSendForm
      sendTo=""
      onChangeSendTo={vi.fn()}
      sendAmount=""
      onChangeSendAmount={vi.fn()}
      isSending={false}
      onSubmitSend={event => event.preventDefault()}
      connectedWalletAddress="0x1234567890123456789012345678901234567890"
      onUseConnectedWallet={vi.fn()}
      availableBalance={100}
      {...overrides}
    />,
  )
}

describe('walletSendForm', () => {
  // Solana: embedded (email/social) wallets no longer exist, so the connected
  // wallet shortcut is always available when an address is connected.
  it('allows using the connected wallet shortcut', () => {
    const onUseConnectedWallet = vi.fn()

    renderWalletSendForm({ onUseConnectedWallet })

    fireEvent.click(screen.getByRole('button', { name: /use connected/i }))

    expect(onUseConnectedWallet).toHaveBeenCalledTimes(1)
  })
})

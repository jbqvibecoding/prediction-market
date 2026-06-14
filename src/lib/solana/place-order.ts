import { BuildOrderParams, buildLimitOrder } from './build-order'
import { ClobClient, SubmitOrderResponse } from './clob-client'
import { SolanaOrder, signOrder } from './order'

/**
 * End-to-end "place a limit order" flow, decoupled from React so it can be
 * unit-tested: build the order, sign its canonical bytes with the wallet's
 * message signer, and submit it to the matching engine.
 *
 * The React hook (useSolanaClob) is a thin wrapper that supplies `clob` from
 * config and `maker`/`signMessage` from the connected wallet adapter.
 */
export interface PlaceOrderArgs extends Omit<BuildOrderParams, 'maker'> {
  maker: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}

export interface PlaceOrderResult {
  order: SolanaOrder
  signature: string
  response: SubmitOrderResponse
}

export async function placeOrder(
  clob: ClobClient,
  args: PlaceOrderArgs,
): Promise<PlaceOrderResult> {
  const { signMessage, ...buildParams } = args
  const order = buildLimitOrder(buildParams)
  const signature = await signOrder(order, signMessage)
  const response = await clob.submitOrder(order, signature)
  return { order, signature, response }
}

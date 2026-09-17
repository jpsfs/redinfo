/** What every channel's `send()` returns — enough for `NotificationDelivery` to be written from. */
export interface ChannelSendResult {
  ok: boolean;
  providerMessageId?: string;
  /** Only meaningful when `ok` is false. */
  error?: string;
  /** Web Push only: the endpoint is gone (404/410) and the subscription should be pruned. */
  expired?: boolean;
}

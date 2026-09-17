import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { ChannelSendResult } from './channel.types';

export interface WebPushDestination {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Thin wrapper around the `web-push` package — the Web Push protocol over
 * VAPID keys we generate ourselves, no third-party account or per-message
 * cost. Fails soft with no VAPID keys configured, same reasoning as
 * `EmailChannelService`.
 */
@Injectable()
export class WebPushChannelService {
  private readonly logger = new Logger(WebPushChannelService.name);
  private readonly configured: boolean;

  constructor() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:noreply@redinfo.local';
    let configured = Boolean(publicKey && privateKey);
    if (configured) {
      // web-push validates its inputs synchronously and throws on anything
      // malformed (e.g. a subject that isn't a URL/mailto). The three env
      // vars above are expected to be either all real or all absent, but
      // this is deploy-pipeline-supplied config, not something the app
      // controls — a bad value reaching here (misconfigured variable group,
      // a templating glitch upstream) must never take the whole process
      // down over one optional notification channel. Same "fail soft"
      // contract as EmailChannelService, just enforced defensively here
      // too instead of only trusting the presence check above.
      try {
        webpush.setVapidDetails(subject, publicKey as string, privateKey as string);
      } catch (cause) {
        this.logger.warn(
          `Ignoring invalid VAPID configuration — push notifications disabled: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
        configured = false;
      }
    }
    this.configured = configured;
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  /** Null until `VAPID_PUBLIC_KEY` is set — that's what the frontend subscribes against. */
  get publicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }

  async send(destination: WebPushDestination, title: string, body: string): Promise<ChannelSendResult> {
    if (!this.configured) {
      this.logger.warn(`VAPID keys not set — skipping push to ${destination.endpoint}`);
      return { ok: false, error: 'Push channel not configured' };
    }
    try {
      await webpush.sendNotification(
        { endpoint: destination.endpoint, keys: { p256dh: destination.p256dh, auth: destination.auth } },
        JSON.stringify({ title, body }),
      );
      return { ok: true };
    } catch (cause) {
      // A 404/410 means the browser dropped the subscription — the caller
      // prunes it so we stop retrying a device that will never receive it.
      const statusCode = (cause as { statusCode?: number }).statusCode;
      const expired = statusCode === 404 || statusCode === 410;
      const error = cause instanceof Error ? cause.message : 'Unknown push error';
      return { ok: false, error, expired };
    }
  }
}

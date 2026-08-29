import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ChannelSendResult } from './channel.types';

/**
 * Thin wrapper around Resend (chosen for its free tier — 3k emails/month —
 * and its webhook-based delivery events). Kept behind this one method so
 * swapping providers later is an adapter, not a rewrite of whatever calls it.
 *
 * Fails soft: with no `RESEND_API_KEY` set (local/dev/test, or before the
 * account is provisioned), every send is logged and reported failed rather
 * than throwing — the rest of the notice flow works without a real provider.
 */
@Injectable()
export class EmailChannelService {
  private readonly logger = new Logger(EmailChannelService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = process.env.NOTIFICATION_EMAIL_FROM ?? 'notices@redinfo.local';
  }

  get isConfigured(): boolean {
    return this.resend !== null;
  }

  async send(to: string, subject: string, body: string): Promise<ChannelSendResult> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY not set — skipping email to ${to}: "${subject}"`);
      return { ok: false, error: 'Email channel not configured' };
    }
    try {
      // Checked on `result` itself, not on destructured `data`/`error` —
      // that's what keeps the `data`/`error` discriminated union narrowed.
      const result = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        text: body,
      });
      if (result.error) return { ok: false, error: result.error.message };
      return { ok: true, providerMessageId: result.data.id };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Unknown email error';
      this.logger.error(`Email send to ${to} failed: ${error}`);
      return { ok: false, error };
    }
  }
}

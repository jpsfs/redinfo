import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import { ChannelSendResult } from './channel.types';

/**
 * Two transports, picked purely by which config is present — never by NODE_ENV,
 * since staging deliberately runs with NODE_ENV=production for build parity and
 * so can't be used to tell "is this really production":
 *
 * - `SMTP_HOST` set → send via SMTP (an internal Mailpit-style catch-all in
 *   non-production environments — nothing reaches a real inbox, and it's
 *   viewable wherever that box's UI lives). Takes priority over Resend, so a
 *   `RESEND_API_KEY` that ends up set alongside it (leaked, copy-pasted)
 *   still can't cause a real send.
 * - else `RESEND_API_KEY` set → send via Resend (production; 3k/mo free tier,
 *   webhook-based delivery events). Kept behind this one method so swapping
 *   providers later is an adapter, not a rewrite of whatever calls it.
 * - else → fails soft: every send is logged and reported failed rather than
 *   throwing, so the rest of the notice flow works with no provider configured
 *   at all (local dev with a bare `.env`, before either account is provisioned).
 */
@Injectable()
export class EmailChannelService {
  private readonly logger = new Logger(EmailChannelService.name);
  private readonly resend: Resend | null;
  private readonly smtp: nodemailer.Transporter | null;
  private readonly from: string;

  constructor() {
    const smtpHost = process.env.SMTP_HOST;
    this.smtp = smtpHost
      ? nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.SMTP_PORT ?? 1025),
          secure: false,
        })
      : null;

    const apiKey = process.env.RESEND_API_KEY;
    this.resend = !this.smtp && apiKey ? new Resend(apiKey) : null;

    this.from = process.env.NOTIFICATION_EMAIL_FROM ?? 'notices@redinfo.local';
  }

  get isConfigured(): boolean {
    return this.smtp !== null || this.resend !== null;
  }

  async send(to: string, subject: string, body: string): Promise<ChannelSendResult> {
    if (this.smtp) return this.sendViaSmtp(this.smtp, to, subject, body);
    if (this.resend) return this.sendViaResend(this.resend, to, subject, body);
    this.logger.warn(`No email transport configured — skipping email to ${to}: "${subject}"`);
    return { ok: false, error: 'Email channel not configured' };
  }

  private async sendViaSmtp(
    smtp: nodemailer.Transporter,
    to: string,
    subject: string,
    body: string,
  ): Promise<ChannelSendResult> {
    try {
      const info = await smtp.sendMail({ from: this.from, to, subject, text: body });
      return { ok: true, providerMessageId: info.messageId };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Unknown email error';
      this.logger.error(`SMTP send to ${to} failed: ${error}`);
      return { ok: false, error };
    }
  }

  private async sendViaResend(
    resend: Resend,
    to: string,
    subject: string,
    body: string,
  ): Promise<ChannelSendResult> {
    try {
      // Checked on `result` itself, not on destructured `data`/`error` —
      // that's what keeps the `data`/`error` discriminated union narrowed.
      const result = await resend.emails.send({ from: this.from, to, subject, text: body });
      if (result.error) return { ok: false, error: result.error.message };
      return { ok: true, providerMessageId: result.data.id };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Unknown email error';
      this.logger.error(`Email send to ${to} failed: ${error}`);
      return { ok: false, error };
    }
  }
}

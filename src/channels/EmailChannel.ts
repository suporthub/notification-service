import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../lib/logger';
import { INotificationChannel } from './INotificationChannel';
import { NotificationEvent, DeliveryResult } from '../types/notification.types';
import { renderEmailTemplate } from '../templates/email.templates';

// ── Single Responsibility: only handles email delivery via SMTP ───────────────

export class EmailChannel implements INotificationChannel {
  readonly channel = 'email' as const;

  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host:   config.emailHost,
        port:   config.emailPort,
        secure: config.emailSecure,
        auth:   { user: config.emailUser, pass: config.emailPass },
        tls:    { rejectUnauthorized: false }, // Hostinger compatibility
      });
    }
    return this.transporter;
  }

  canHandle(event: NotificationEvent): boolean {
    return event.channel === 'email' && typeof event.recipient === 'string' && event.recipient.includes('@');
  }

  async deliver(event: NotificationEvent): Promise<DeliveryResult> {
    try {
      const rendered = renderEmailTemplate(event.template, event.data);
      const transport = this.getTransporter();

      await transport.sendMail({
        from:    config.emailFrom,
        to:      event.recipient,
        subject: rendered.subject,
        html:    rendered.html,
        text:    rendered.text,
      });

      logger.info(
        { template: event.template, to: event.recipient },
        'Email delivered',
      );

      return { success: true, channel: 'email', recipient: event.recipient };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, template: event.template, to: event.recipient },
        'Email delivery failed',
      );
      return { success: false, channel: 'email', recipient: event.recipient, error: message };
    }
  }
}

import { INotificationChannel } from '../channels/INotificationChannel';
import { NotificationEvent, DeliveryResult } from '../types/notification.types';
import { logger } from '../lib/logger';

// ── Dependency Inversion: depends only on INotificationChannel[] ──────────────
// ── Open/Closed: add channels by passing new impl — never modify this class ──

const STALE_EVENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export class NotificationService {
  constructor(private readonly channels: INotificationChannel[]) {}

  /**
   * Route the event to the matching channel and attempt delivery.
   * Staleness check: discard events older than 5 min (prevents retry storm
   * replaying expired OTPs on consumer restart).
   */
  async dispatch(event: NotificationEvent): Promise<DeliveryResult> {
    // Staleness guard
    if (event.createdAt) {
      const age = Date.now() - new Date(event.createdAt).getTime();
      if (age > STALE_EVENT_THRESHOLD_MS) {
        logger.warn(
          { template: event.template, age: Math.round(age / 1000) + 's' },
          'Discarding stale notification event',
        );
        return { success: false, channel: event.channel, recipient: event.recipient, error: 'Event too old' };
      }
    }

    const handler = this.channels.find((c) => c.canHandle(event));
    if (!handler) {
      logger.warn({ channel: event.channel, template: event.template }, 'No handler for channel — skipping');
      return { success: false, channel: event.channel, recipient: event.recipient, error: 'No handler' };
    }

    const result = await handler.deliver(event);

    if (!result.success) {
      logger.error(
        { channel: result.channel, template: event.template, recipient: result.recipient, error: result.error },
        'Notification delivery failed',
      );
    }

    return result;
  }
}

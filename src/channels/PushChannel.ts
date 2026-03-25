import { INotificationChannel } from './INotificationChannel';
import { NotificationEvent, DeliveryResult } from '../types/notification.types';
import { logger } from '../lib/logger';

/**
 * PushChannel — placeholder for FCM/APNs push notifications.
 * Implement when mobile apps are ready.
 * OCP: drop-in replacement without touching NotificationService.
 */
export class PushChannel implements INotificationChannel {
  readonly channel = 'push' as const;

  canHandle(event: NotificationEvent): boolean {
    return event.channel === 'push';
  }

  async deliver(event: NotificationEvent): Promise<DeliveryResult> {
    // TODO: integrate FCM / APNs when mobile app is ready
    logger.warn({ template: event.template, recipient: event.recipient }, 'Push channel not implemented yet — skipping');
    return { success: false, channel: 'push', recipient: event.recipient, error: 'Push not implemented' };
  }
}

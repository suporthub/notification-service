import { NotificationEvent, DeliveryResult } from '../types/notification.types';

/**
 * INotificationChannel — Dependency Inversion interface.
 * Each delivery channel (email, push, SMS) implements this.
 * NotificationService depends on this abstraction, not on Nodemailer.
 */
export interface INotificationChannel {
  readonly channel: NotificationEvent['channel'];

  /**
   * Returns true if this handler can handle the given event.
   * Used for quick capability check before attempting delivery.
   */
  canHandle(event: NotificationEvent): boolean;

  /**
   * Deliver the notification.
   * Must never throw — catches internally and returns DeliveryResult.
   */
  deliver(event: NotificationEvent): Promise<DeliveryResult>;
}

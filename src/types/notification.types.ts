// ─── Notification Domain Types (zero external dependencies) ──────────────────

/** All supported delivery channels */
export type NotificationChannel = 'email' | 'push' | 'sms';

/** Template IDs — each maps to a renderer + subject */
export type NotificationTemplate =
  // Auth
  | 'otp'
  | 'new_device_login'
  | 'password_changed'
  | 'password_reset'
  // Registration
  | 'welcome_live'
  | 'welcome_demo'
  // Account / Trading
  | 'auto_cutoff'
  | 'margin_call'
  | 'deposit_approved'
  | 'withdrawal_approved'
  | 'withdrawal_rejected'
  // Admin announcements (body provided inline — no template render needed)
  | 'announcement';

export type NotificationPriority = 'high' | 'normal' | 'low';

/**
 * The canonical notification event published on Kafka topic `notification.send`.
 * Any service that needs to send a notification publishes this shape.
 */
export interface NotificationEvent {
  /** BCP-47 locale for template rendering. Default: 'en' */
  locale?:    string;
  channel:    NotificationChannel;
  template:   NotificationTemplate;
  priority:   NotificationPriority;
  recipient:  string;          // email address, FCM token, or phone number
  /** Template data — varies per template (see templates/email/*.ts) */
  data:       Record<string, unknown>;
  /** ISO timestamp the event was created — used for staleness check */
  createdAt?: string;
}

/** Delivery result returned from a channel handler */
export interface DeliveryResult {
  success:  boolean;
  channel:  NotificationChannel;
  recipient: string;
  error?:   string;
}

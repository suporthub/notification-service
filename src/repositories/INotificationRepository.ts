import {
  DeliveryStatus,
  NotificationChannel,
  NotificationPriority,
  NotificationPreference,
  TemplateGroup,
  UserType,
} from '@prisma/client';

// ── Repository input types (DTOs, not Prisma models) ─────────────────────────

export interface CreateLogInput {
  eventId:   string;
  channel:   NotificationChannel;
  template:  string;
  group:     TemplateGroup;
  priority:  NotificationPriority;
  recipient: string;
  userId?:   string;
  userType?: UserType;
  metadata?: Record<string, unknown>;
}

export interface UpdateLogInput {
  status:    DeliveryStatus;
  lastError?: string;
  sentAt?:   Date;
  attempts?: number;
}

// ── Interface (Dependency Inversion Principle) ────────────────────────────────

export interface INotificationRepository {
  /**
   * Returns true if a log with this eventId already exists.
   * Used for deduplication — if true, caller must skip dispatch.
   */
  existsByEventId(eventId: string): Promise<boolean>;

  /** Write a pending log entry before attempting delivery. */
  createLog(input: CreateLogInput): Promise<string>; // returns log id

  /** Update the log after delivery attempt (sent / failed / skipped). */
  updateLog(id: string, input: UpdateLogInput): Promise<void>;

  /**
   * Find the user's preference for a specific channel + group combination.
   * Returns null if no preference row exists (treat as enabled=true).
   */
  findPreference(
    userId:   string,
    userType: UserType,
    channel:  NotificationChannel,
    group:    TemplateGroup,
  ): Promise<Pick<NotificationPreference, 'enabled'> | null>;

  /** Create or update a user's notification preference. */
  upsertPreference(
    userId:   string,
    userType: UserType,
    channel:  NotificationChannel,
    group:    TemplateGroup,
    enabled:  boolean,
  ): Promise<void>;
}

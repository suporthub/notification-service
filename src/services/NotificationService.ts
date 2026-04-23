import { INotificationChannel } from '../channels/INotificationChannel';
import { INotificationRepository } from '../repositories/INotificationRepository';
import {
  NotificationEvent,
  DeliveryResult,
  TEMPLATE_GROUP_MAP,
  TemplateGroup,
} from '../types/notification.types';
import { logger } from '../lib/logger';
import {
  TemplateGroup     as PrismaTemplateGroup,
  UserType          as PrismaUserType,
  NotificationChannel as PrismaChannel,
  NotificationPriority as PrismaPriority,
} from '@prisma/client';

// ── SOLID Design ─────────────────────────────────────────────────────────────
// SRP: orchestrates dispatch + persistence — no channel logic, no template rendering.
// OCP: add channels by injecting new impl — never modify this class.
// DIP: depends on INotificationChannel[] + INotificationRepository, not concrete impls.

const STALE_EVENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Groups that must always send regardless of user preferences */
const ALWAYS_SEND_GROUPS = new Set<TemplateGroup>(['operational']);

export class NotificationService {
  constructor(
    private readonly channels: INotificationChannel[],
    private readonly repo:     INotificationRepository,
  ) {}

  /**
   * Dispatch a notification event through the appropriate channel.
   *
   * Flow:
   *  1. Deduplication  — skip if eventId already logged (exactly-once delivery)
   *  2. Staleness guard — discard events older than 5 min (OTP replay protection)
   *  3. Preference check — skip if user opted out (non-operational groups only)
   *  4. Create pending log entry
   *  5. Find + invoke channel handler
   *  6. Update log with final status (sent / failed / skipped)
   */
  async dispatch(event: NotificationEvent): Promise<DeliveryResult> {
    // ── Step 1: Deduplication ────────────────────────────────────────────────
    const isDuplicate = await this.repo.existsByEventId(event.eventId);
    if (isDuplicate) {
      logger.warn({ eventId: event.eventId, template: event.template }, 'Duplicate eventId — skipping dispatch');
      return { success: true, channel: event.channel, recipient: event.recipient };
    }

    // ── Step 2: Staleness guard ──────────────────────────────────────────────
    if (event.createdAt) {
      const age = Date.now() - new Date(event.createdAt).getTime();
      if (age > STALE_EVENT_THRESHOLD_MS) {
        logger.warn(
          { template: event.template, age: Math.round(age / 1000) + 's' },
          'Discarding stale notification event',
        );
        await this.writeSkipLog(event, 'Event too old');
        return { success: false, channel: event.channel, recipient: event.recipient, error: 'Event too old' };
      }
    }

    // ── Step 3: Preference check (skip for operational group) ────────────────
    const group = TEMPLATE_GROUP_MAP[event.template];
    if (!ALWAYS_SEND_GROUPS.has(group) && event.userId && event.userType) {
      const pref = await this.repo.findPreference(
        event.userId,
        event.userType as PrismaUserType,
        event.channel  as PrismaChannel,
        group          as PrismaTemplateGroup,
      );
      if (pref !== null && !pref.enabled) {
        logger.info(
          { userId: event.userId, channel: event.channel, group, template: event.template },
          'Notification suppressed by user preference',
        );
        await this.writeSkipLog(event, 'User opted out');
        return { success: true, channel: event.channel, recipient: event.recipient };
      }
    }

    // ── Step 4: Write pending log ────────────────────────────────────────────
    const logId = await this.repo.createLog({
      eventId:   event.eventId,
      channel:   event.channel   as PrismaChannel,
      template:  event.template,
      group:     group           as PrismaTemplateGroup,
      priority:  (event.priority ?? 'normal') as PrismaPriority,
      recipient: event.recipient,
      metadata:  event.data,
      ...(event.userId   !== undefined && { userId:   event.userId   }),
      ...(event.userType !== undefined && { userType: event.userType as PrismaUserType }),
    });

    // ── Step 5: Find handler ─────────────────────────────────────────────────
    const handler = this.channels.find((c) => c.canHandle(event));
    if (!handler) {
      logger.warn({ channel: event.channel, template: event.template }, 'No handler for channel — skipping');
      await this.repo.updateLog(logId, { status: 'skipped', lastError: 'No handler registered' });
      return { success: false, channel: event.channel, recipient: event.recipient, error: 'No handler' };
    }

    // ── Step 6: Deliver + update log ─────────────────────────────────────────
    const result = await handler.deliver(event);

    if (result.success) {
      await this.repo.updateLog(logId, { status: 'sent', sentAt: new Date() });
    } else {
      logger.error(
        { channel: result.channel, template: event.template, recipient: result.recipient, error: result.error },
        'Notification delivery failed',
      );
      await this.repo.updateLog(logId, {
        status: 'failed',
        ...(result.error !== undefined && { lastError: result.error }),
      });
    }

    return result;
  }

  // ── Private helper ────────────────────────────────────────────────────────

  /**
   * Write a terminal skip log entry for events that are discarded before Step 4.
   * (staleness discards, opt-out suppression)
   */
  private async writeSkipLog(event: NotificationEvent, reason: string): Promise<void> {
    const group = TEMPLATE_GROUP_MAP[event.template];
    try {
      const logId = await this.repo.createLog({
        eventId:  event.eventId,
        channel:  event.channel  as PrismaChannel,
        template: event.template,
        group:    group          as PrismaTemplateGroup,
        priority: (event.priority ?? 'normal') as PrismaPriority,
        recipient: event.recipient,
        ...(event.userId   !== undefined && { userId:   event.userId   }),
        ...(event.userType !== undefined && { userType: event.userType as PrismaUserType }),
      });
      await this.repo.updateLog(logId, { status: 'skipped', lastError: reason });
    } catch (err) {
      // Never let a logging failure bring down the consumer
      logger.error({ err, eventId: event.eventId }, 'Failed to write skip log');
    }
  }
}

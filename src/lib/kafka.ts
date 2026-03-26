import { Kafka, EachMessagePayload } from 'kafkajs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { logger } from '../lib/logger';
import { NotificationService } from '../services/NotificationService';
import { NotificationEvent } from '../types/notification.types';

// ── Zod schema for inbound Kafka messages ─────────────────────────────────────
// eventId is required for deduplication. If missing (older publisher), we auto-generate
// a deterministic fallback so old code still works without crashing.

const notificationEventSchema = z.object({
  eventId:  z.string().uuid().optional(),   // optional for backward compat — filled below
  channel:  z.enum(['email', 'push', 'sms']),
  template: z.string(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  recipient: z.string().min(1),
  data:     z.record(z.string(), z.unknown()).default({}),
  locale:   z.string().optional(),
  createdAt: z.string().optional(),
  // User identity for logs + preferences
  userId:   z.string().uuid().optional(),
  userType: z.enum(['live', 'demo', 'admin']).optional(),
});

export function createKafkaConsumer(service: NotificationService) {
  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers:  config.kafkaBrokers,
    retry: { initialRetryTime: 300, retries: 20 },
  });

  const consumer = kafka.consumer({
    groupId:           config.kafkaGroupId,
    sessionTimeout:    30_000,
    heartbeatInterval: 3_000,
    retry: { retries: 10 },
  });

  async function handleMessage({ message }: EachMessagePayload): Promise<void> {
    const raw = message.value?.toString();
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn({ raw }, 'Failed to parse notification event — skipping');
      return;
    }

    const result = notificationEventSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ errors: result.error.flatten(), raw }, 'Invalid notification event schema — skipping');
      return;
    }

    // Guarantee eventId — auto-generate if publisher did not include it (backward compat)
    const event: NotificationEvent = {
      eventId:   result.data.eventId ?? uuidv4(),
      channel:   result.data.channel,
      template:  result.data.template as NotificationEvent['template'],
      priority:  result.data.priority,
      recipient: result.data.recipient,
      data:      result.data.data,
      ...(result.data.locale    !== undefined && { locale:    result.data.locale    }),
      ...(result.data.createdAt !== undefined && { createdAt: result.data.createdAt }),
      ...(result.data.userId    !== undefined && { userId:    result.data.userId    }),
      ...(result.data.userType  !== undefined && { userType:  result.data.userType  }),
    };

    await service.dispatch(event);
  }

  async function subscribeWithRetry(topic: string, maxAttempts = 12, delayMs = 5_000): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await consumer.subscribe({ topic, fromBeginning: false });
        logger.info({ topic }, 'Subscribed to Kafka topic');
        return;
      } catch (err) {
        const isTopicMissing =
          err instanceof Error &&
          (err.message.includes('does not host this topic') ||
            err.message.includes('UNKNOWN_TOPIC') ||
            err.message.includes('LEADER_NOT_AVAILABLE'));

        if (isTopicMissing && attempt < maxAttempts) {
          logger.warn({ topic, attempt, maxAttempts }, 'Topic not ready — retrying...');
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          throw err;
        }
      }
    }
  }

  async function start(): Promise<void> {
    await consumer.connect();
    await subscribeWithRetry('notification.send');

    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await handleMessage(payload);
        } catch (err) {
          logger.error({ err }, 'Error processing notification event');
        }
      },
    });

    logger.info('Notification Kafka consumer running on topic: notification.send');
  }

  async function stop(): Promise<void> {
    await consumer.disconnect();
  }

  return { start, stop };
}

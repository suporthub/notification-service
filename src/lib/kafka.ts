import { Kafka, EachMessagePayload } from 'kafkajs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import { logger } from '../lib/logger';
import { NotificationService } from '../services/NotificationService';
import { NotificationEvent } from '../types/notification.types';

// ── Per-template data schemas ─────────────────────────────────────────────────
// Each schema enforces the exact fields each template renderer needs.
// This catches missing fields at the consumer boundary, not silently at render time.

const otpDataSchema = z.object({
  otp:           z.string().min(1),
  expiryMinutes: z.string().optional(),
  accountEmail:  z.string().email(),        // ← REQUIRED: fixes blank Account field
  timestamp:     z.string().optional(),
});

const loginDataSchema = z.object({
  ipAddress:    z.string(),
  location:     z.string().optional(),
  timestamp:    z.string().optional(),
  deviceInfo:   z.string().optional(),
  accountEmail: z.string().email(),         // ← REQUIRED: fixes blank Account field
});

const welcomeDataSchema = z.object({
  accountNumber:    z.string().min(1),
  email:            z.string().email(),
  accountType:      z.string().optional(),
  accountCategory:  z.string().optional(),
  phone:            z.string().optional(),
  registrationDate: z.string().optional(),
});

// ── Template → data schema map ────────────────────────────────────────────────
const TEMPLATE_DATA_SCHEMAS: Record<string, z.ZodTypeAny> = {
  otp:              otpDataSchema,
  new_device_login: loginDataSchema,
  welcome_live:     welcomeDataSchema,
  welcome_demo:     welcomeDataSchema,
};

// ── Top-level Kafka message schema ────────────────────────────────────────────
const notificationEventSchema = z.object({
  eventId:   z.string().uuid().optional(),  // optional for backward compat — filled below
  channel:   z.enum(['email', 'push', 'sms']),
  template:  z.string(),
  priority:  z.enum(['high', 'normal', 'low']).default('normal'),
  recipient: z.string().min(1),
  data:      z.record(z.string(), z.unknown()).default({}),
  locale:    z.string().optional(),
  createdAt: z.string().optional(),
  userId:    z.string().uuid().optional(),
  // ↓ REQUIRED for welcome_live / welcome_demo routing
  userType:  z.enum(['live', 'demo', 'admin']).optional(),
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

    let template = result.data.template;

    // ── Auto-route welcome email based on userType ────────────────────────────
    // If publisher sends template: 'welcome', derive the correct variant here
    // so the publisher doesn't have to know the internal template names.
    if (template === 'welcome') {
      const userType = result.data.userType;
      if (!userType || userType === 'admin') {
        logger.warn(
          { userId: result.data.userId, userType },
          'Welcome event received but userType is missing or admin — skipping',
        );
        return;
      }
      template = userType === 'live' ? 'welcome_live' : 'welcome_demo';
      logger.info({ userId: result.data.userId, userType, resolvedTemplate: template }, 'Resolved welcome template');
    }

    // ── Per-template data validation ──────────────────────────────────────────
    const dataSchema = TEMPLATE_DATA_SCHEMAS[template];
    if (dataSchema) {
      const dataResult = dataSchema.safeParse(result.data.data);
      if (!dataResult.success) {
        logger.warn(
          { template, errors: dataResult.error.flatten(), data: result.data.data },
          'Template data validation failed — skipping',
        );
        return;
      }
    }

    // ── Build event ───────────────────────────────────────────────────────────
    const event: NotificationEvent = {
      eventId:   result.data.eventId ?? uuidv4(),
      channel:   result.data.channel,
      template:  template as NotificationEvent['template'],
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
import { Kafka, EachMessagePayload } from 'kafkajs';
import { z } from 'zod';
import { config } from '../config/env';
import { logger } from '../lib/logger';
import { NotificationService } from '../services/NotificationService';
import { NotificationEvent } from '../types/notification.types';

const notificationEventSchema = z.object({
  channel:   z.enum(['email', 'push', 'sms']),
  template:  z.string(),
  priority:  z.enum(['high', 'normal', 'low']).default('normal'),
  recipient: z.string().min(1),
  data:      z.record(z.string(), z.unknown()).default({}),
  locale:    z.string().optional(),
  createdAt: z.string().optional(),
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

    const event = result.data as NotificationEvent;
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

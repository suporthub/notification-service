import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';

import { config } from './config/env';
import { logger } from './lib/logger';

// ── DI wiring — compose the object graph here ─────────────────────────────────
import { EmailChannel } from './channels/EmailChannel';
import { PushChannel }  from './channels/PushChannel';
import { NotificationService } from './services/NotificationService';
import { createKafkaConsumer } from './lib/kafka';

const notificationService = new NotificationService([
  new EmailChannel(),
  new PushChannel(),
  // new SmsChannel() — add when Twilio is ready
]);

const kafkaConsumer = createKafkaConsumer(notificationService);

// ── Express (health check only — no public API surface) ───────────────────────
const app = express();
app.use(helmet());
app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json({ limit: '64kb' }));
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service', ts: new Date().toISOString() });
});

app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ── Bootstrap ──────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await kafkaConsumer.start();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, `🚀 notification-service started on :${config.port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down notification-service…');
    server.close(async () => {
      await kafkaConsumer.stop();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, '❌ Failed to start notification-service');
  process.exit(1);
});

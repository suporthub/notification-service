import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { logger } from './logger';

// ── Singleton pattern — one PrismaClient per process ─────────────────────────
// notification-service is a single-DB worker; no read replica needed.

export const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDB(): Promise<void> {
  await prisma.$connect();
  logger.info('notification_db connected');
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  logger.info('notification_db disconnected');
}

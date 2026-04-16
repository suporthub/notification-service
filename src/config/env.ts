import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const schema = z.object({
  port:    z.coerce.number().default(3004),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Logging
  serviceName: z.string().default('notification-service'),
  logLevel:    z.enum(['trace','debug','info','warn','error','fatal']).default('debug'),
  logToFile:   z.string().transform(v => v !== 'false').default('true'),

  // Database (notification_db via WireGuard)
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),

  // Kafka
  kafkaBrokers:  z.string().transform((v) => v.split(',')),
  kafkaClientId: z.string().default('notification-service'),
  kafkaGroupId:  z.string().default('notification-service-group'),

  // Email
  emailHost:   z.string(),
  emailPort:   z.coerce.number().default(465),
  emailSecure: z.string().transform((v) => v !== 'false').default('true'),
  emailUser:   z.string(),
  emailPass:   z.string(),
  emailFrom:   z.string().email(),

  // Internal
  internalSecret: z.string().min(16),
  allowedOrigins: z.string().default('http://localhost:3000').transform((v) => v.split(',')),
});

const parsed = schema.safeParse({
  port:    process.env['PORT'],
  nodeEnv: process.env['NODE_ENV'],
  serviceName: process.env['SERVICE_NAME'],
  logLevel:    process.env['LOG_LEVEL'],
  logToFile:   process.env['LOG_TO_FILE'],

  databaseUrl: process.env['DATABASE_URL'],

  kafkaBrokers:  process.env['KAFKA_BROKERS'],
  kafkaClientId: process.env['KAFKA_CLIENT_ID'],
  kafkaGroupId:  process.env['KAFKA_GROUP_ID'],

  emailHost:   process.env['EMAIL_HOST'],
  emailPort:   process.env['EMAIL_PORT'],
  emailSecure: process.env['EMAIL_SECURE'],
  emailUser:   process.env['EMAIL_USER'],
  emailPass:   process.env['EMAIL_PASS'],
  emailFrom:   process.env['EMAIL_FROM'],

  internalSecret: process.env['INTERNAL_SERVICE_SECRET'],
  allowedOrigins: process.env['ALLOWED_ORIGINS'],
});

if (!parsed.success) {
  console.error('❌ notification-service: Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

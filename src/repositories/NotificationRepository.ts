import { PrismaClient, NotificationChannel, NotificationPriority, TemplateGroup, UserType, DeliveryStatus, NotificationPreference } from '@prisma/client';
import { INotificationRepository, CreateLogInput, UpdateLogInput } from './INotificationRepository';

// ── Concrete Prisma implementation ────────────────────────────────────────────
// SRP: only responsible for persistence — no business logic.

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async existsByEventId(eventId: string): Promise<boolean> {
    const count = await this.db.notificationLog.count({ where: { eventId } });
    return count > 0;
  }

  async createLog(input: CreateLogInput): Promise<string> {
    const log = await this.db.notificationLog.create({
      data: {
        eventId:   input.eventId,
        channel:   input.channel,
        template:  input.template,
        group:     input.group,
        priority:  input.priority,
        recipient: input.recipient,
        ...(input.userId   !== undefined && { userId:   input.userId   }),
        ...(input.userType !== undefined && { userType: input.userType }),
        ...(input.metadata !== undefined && { metadata: input.metadata as object }),
        status: 'pending',
      },
      select: { id: true },
    });
    return log.id;
  }

  async updateLog(id: string, input: UpdateLogInput): Promise<void> {
    await this.db.notificationLog.update({
      where: { id },
      data: {
        status:    input.status,
        ...(input.lastError !== undefined && { lastError: input.lastError }),
        ...(input.sentAt    !== undefined && { sentAt:    input.sentAt    }),
        ...(input.attempts  !== undefined && { attempts:  input.attempts  }),
      },
    });
  }

  async findPreference(
    userId:   string,
    userType: UserType,
    channel:  NotificationChannel,
    group:    TemplateGroup,
  ): Promise<Pick<NotificationPreference, 'enabled'> | null> {
    return this.db.notificationPreference.findUnique({
      where: { userId_userType_channel_group: { userId, userType, channel, group } },
      select: { enabled: true },
    });
  }

  async upsertPreference(
    userId:   string,
    userType: UserType,
    channel:  NotificationChannel,
    group:    TemplateGroup,
    enabled:  boolean,
  ): Promise<void> {
    await this.db.notificationPreference.upsert({
      where:  { userId_userType_channel_group: { userId, userType, channel, group } },
      create: { userId, userType, channel, group, enabled },
      update: { enabled },
    });
  }
}

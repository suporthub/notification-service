-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'push', 'sms');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('live', 'demo', 'admin');

-- CreateEnum
CREATE TYPE "TemplateGroup" AS ENUM ('operational', 'alerts', 'marketing');

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "group" "TemplateGroup" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'normal',
    "recipient" TEXT NOT NULL,
    "userId" TEXT,
    "userType" "UserType",
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" "UserType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "group" "TemplateGroup" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_eventId_key" ON "notification_logs"("eventId");

-- CreateIndex
CREATE INDEX "notification_logs_userId_userType_idx" ON "notification_logs"("userId", "userType");

-- CreateIndex
CREATE INDEX "notification_logs_status_createdAt_idx" ON "notification_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_template_createdAt_idx" ON "notification_logs"("template", "createdAt");

-- CreateIndex
CREATE INDEX "notification_preferences_userId_userType_idx" ON "notification_preferences"("userId", "userType");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_userType_channel_group_key" ON "notification_preferences"("userId", "userType", "channel", "group");

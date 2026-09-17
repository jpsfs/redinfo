-- New system-triggered notification types: 24h shift reminders and birthdays.
ALTER TYPE "NotificationType" ADD VALUE 'SHIFT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_GREETING';
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_ANNOUNCEMENT';

-- NotificationDelivery becomes generic across producers instead of coupled to
-- Notice: noticeId is now optional, and the content actually sent is captured
-- on the row itself rather than joined from Notice, which the new producers
-- have none of.
ALTER TABLE "NotificationDelivery" ALTER COLUMN "noticeId" DROP NOT NULL;
ALTER TABLE "NotificationDelivery" ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'NOTICE';
ALTER TABLE "NotificationDelivery" ADD COLUMN "emailSubject" TEXT;
ALTER TABLE "NotificationDelivery" ADD COLUMN "emailBody" TEXT;
ALTER TABLE "NotificationDelivery" ADD COLUMN "pushTitle" TEXT;
ALTER TABLE "NotificationDelivery" ADD COLUMN "pushBody" TEXT;

-- Backfill every existing (NOTICE-only, so far) delivery from its notice.
UPDATE "NotificationDelivery" d
SET "emailSubject" = n."title",
    "emailBody" = n."body",
    "pushTitle" = n."title",
    "pushBody" = n."body"
FROM "Notice" n
WHERE d."noticeId" = n."id";

ALTER TABLE "NotificationDelivery" ALTER COLUMN "emailSubject" SET NOT NULL;
ALTER TABLE "NotificationDelivery" ALTER COLUMN "emailBody" SET NOT NULL;
ALTER TABLE "NotificationDelivery" ALTER COLUMN "pushTitle" SET NOT NULL;
ALTER TABLE "NotificationDelivery" ALTER COLUMN "pushBody" SET NOT NULL;

CREATE INDEX "NotificationDelivery_userId_type_idx" ON "NotificationDelivery"("userId", "type");

-- A member's own on/off switch for one system-triggered notification type —
-- coarser than UserNotificationPreference, which is per-channel.
CREATE TABLE "UserNotificationTypeSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "UserNotificationTypeSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotificationTypeSetting_userId_type_key" ON "UserNotificationTypeSetting"("userId", "type");

ALTER TABLE "UserNotificationTypeSetting" ADD CONSTRAINT "UserNotificationTypeSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One reminder per shift assignment, ever — the scan's dedupe marker.
ALTER TABLE "ScheduleAssignment" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
CREATE INDEX "ScheduleAssignment_reminderSentAt_idx" ON "ScheduleAssignment"("reminderSentAt");

-- Portuguese becomes the delegation-wide default locale rather than just the
-- browser-detection fallback: pin every existing NULL row explicitly, and
-- default new rows the same way going forward.
ALTER TABLE "User" ALTER COLUMN "locale" SET DEFAULT 'pt';
UPDATE "User" SET "locale" = 'pt' WHERE "locale" IS NULL;

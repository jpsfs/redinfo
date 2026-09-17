-- CreateEnum
CREATE TYPE "VolunteerHoursSource" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "VolunteerActivityType" AS ENUM ('EMERGENCY', 'LOCAL_SUPPORT', 'SALOP_SUPPORT', 'MEETING', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "VolunteerHoursStatus" AS ENUM ('PENDING', 'APPROVED');

-- AlterTable
ALTER TABLE "AvailabilityWindowRole" ADD COLUMN     "mandatoryCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: every role that already exists was, until now, implicitly "must
-- be filled" — shiftGaps() has always flagged any finite role short of its
-- maxPeople. Preserve that reading for existing windows rather than silently
-- making every pre-existing role optional; only newly-created roles (and the
-- updated Emergency defaults, applied by the application layer) get a
-- deliberately-chosen mandatoryCount below their maxPeople.
UPDATE "AvailabilityWindowRole" SET "mandatoryCount" = "maxPeople";

-- CreateTable
CREATE TABLE "VolunteerHoursEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "VolunteerHoursSource" NOT NULL,
    "activityType" "VolunteerActivityType" NOT NULL,
    "assignmentId" TEXT,
    "scheduleId" TEXT,
    "date" DATE NOT NULL,
    "description" TEXT,
    "baselineMinutes" INTEGER,
    "proposedMinutes" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flagDetails" JSONB,
    "status" "VolunteerHoursStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "correctionReason" TEXT,
    "loggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerHoursEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerHoursEntry_assignmentId_key" ON "VolunteerHoursEntry"("assignmentId");

-- CreateIndex
CREATE INDEX "VolunteerHoursEntry_userId_date_idx" ON "VolunteerHoursEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "VolunteerHoursEntry_status_idx" ON "VolunteerHoursEntry"("status");

-- CreateIndex
CREATE INDEX "VolunteerHoursEntry_scheduleId_idx" ON "VolunteerHoursEntry"("scheduleId");

-- CreateIndex
CREATE INDEX "VolunteerHoursEntry_date_idx" ON "VolunteerHoursEntry"("date");

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

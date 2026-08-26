-- A coordinator building a schedule may find a day's shift genuinely needs
-- different hours than the availability window's own grid — that grid is
-- never edited after the window opens, since submissions were made against
-- it. This table holds the correction, one schedule at a time, without
-- touching the window's record of what people were actually asked about.

-- CreateTable
CREATE TABLE "ScheduleShiftOverride" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "adjustedById" TEXT NOT NULL,
    "adjustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleShiftOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleShiftOverride_scheduleId_date_slot_key" ON "ScheduleShiftOverride"("scheduleId", "date", "slot");

-- CreateIndex
CREATE INDEX "ScheduleShiftOverride_scheduleId_idx" ON "ScheduleShiftOverride"("scheduleId");

-- AddForeignKey
ALTER TABLE "ScheduleShiftOverride" ADD CONSTRAINT "ScheduleShiftOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, matching ScheduleAssignment_assignedById_fkey: who moved a shift
-- is part of the schedule's history and must not silently disappear.
ALTER TABLE "ScheduleShiftOverride" ADD CONSTRAINT "ScheduleShiftOverride_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

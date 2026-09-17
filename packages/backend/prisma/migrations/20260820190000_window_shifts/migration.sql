-- Windows carry their own shift grid, one row per day and shift.
-- CreateTable
CREATE TABLE "AvailabilityWindowShift" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,

    CONSTRAINT "AvailabilityWindowShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityWindowShift_windowId_date_slot_key" ON "AvailabilityWindowShift"("windowId", "date", "slot");

-- CreateIndex
CREATE INDEX "AvailabilityWindowShift_windowId_idx" ON "AvailabilityWindowShift"("windowId");

-- AddForeignKey
ALTER TABLE "AvailabilityWindowShift" ADD CONSTRAINT "AvailabilityWindowShift_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "AvailabilityWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill windows opened before this migration with the grid that used to be
-- hardcoded, so every window reads its shifts from the same place.
-- Workdays (Mon–Fri, non-holiday): one shift, 20:00–24:00.
INSERT INTO "AvailabilityWindowShift" ("id", "windowId", "date", "slot", "startHour", "endHour")
SELECT gen_random_uuid()::text, w."id", d::date, 1, 20, 24
FROM "AvailabilityWindow" w
CROSS JOIN generate_series(w."startDate"::timestamp, w."endDate"::timestamp, interval '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) < 6
  AND NOT EXISTS (SELECT 1 FROM "Holiday" h WHERE h."date" = d::date);

-- Weekends and holidays: two shifts, 08:00–16:00 and 16:00–24:00.
INSERT INTO "AvailabilityWindowShift" ("id", "windowId", "date", "slot", "startHour", "endHour")
SELECT gen_random_uuid()::text, w."id", d::date, s."slot", s."startHour", s."endHour"
FROM "AvailabilityWindow" w
CROSS JOIN generate_series(w."startDate"::timestamp, w."endDate"::timestamp, interval '1 day') AS d
CROSS JOIN (VALUES (1, 8, 16), (2, 16, 24)) AS s("slot", "startHour", "endHour")
WHERE EXTRACT(ISODOW FROM d) >= 6
   OR EXISTS (SELECT 1 FROM "Holiday" h WHERE h."date" = d::date);

-- Submissions point at a slot of the window's own grid instead of a shift code.
-- AlterTable
ALTER TABLE "AvailabilitySubmission" ADD COLUMN "slot" INTEGER;

UPDATE "AvailabilitySubmission" SET "slot" = CASE "shiftCode"
    -- AFTERNOON was always the second shift of a weekend/holiday; MORNING the
    -- first, and EVENING the only shift a workday had.
    WHEN 'AFTERNOON' THEN 2
    ELSE 1
END;

ALTER TABLE "AvailabilitySubmission" ALTER COLUMN "slot" SET NOT NULL;

-- DropIndex
DROP INDEX "AvailabilitySubmission_windowId_userId_date_shiftCode_key";

-- AlterTable
ALTER TABLE "AvailabilitySubmission" DROP COLUMN "shiftCode";

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySubmission_windowId_userId_date_slot_key" ON "AvailabilitySubmission"("windowId", "userId", "date", "slot");

-- DropEnum
DROP TYPE "ShiftCode";

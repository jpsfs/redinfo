-- Each shift records how many vehicles it needs crewed; the coverage colours
-- judge drivers against it (one driver per vehicle).
-- AlterTable
-- Existing shifts land on 1, which is the rule they were written under: every
-- shift needed a vehicle and at least one driver. The default is then dropped,
-- so from here on every caller states it.
ALTER TABLE "AvailabilityWindowShift" ADD COLUMN "vehiclesNeeded" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AvailabilityWindowShift" ALTER COLUMN "vehiclesNeeded" DROP DEFAULT;

-- Shift times move from whole hours to minutes from midnight, so a coordinator
-- can set a real handover time (08:30) rather than only the top of an hour.
-- Existing rows convert exactly: hour * 60.
-- AlterTable
ALTER TABLE "AvailabilityWindowShift" ADD COLUMN "startMinute" INTEGER;
ALTER TABLE "AvailabilityWindowShift" ADD COLUMN "endMinute" INTEGER;

UPDATE "AvailabilityWindowShift" SET "startMinute" = "startHour" * 60, "endMinute" = "endHour" * 60;

ALTER TABLE "AvailabilityWindowShift" ALTER COLUMN "startMinute" SET NOT NULL;
ALTER TABLE "AvailabilityWindowShift" ALTER COLUMN "endMinute" SET NOT NULL;

ALTER TABLE "AvailabilityWindowShift" DROP COLUMN "startHour";
ALTER TABLE "AvailabilityWindowShift" DROP COLUMN "endHour";

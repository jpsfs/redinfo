-- Stage 1 of the paid-staff rework: `reconcileEntryForCompensation` needs a
-- discriminator between "the system soft-deleted this entry because the
-- assignment was reclassified off VOLUNTEER" and "a coordinator dismissed it
-- by hand" — reason-string matching would be too fragile for money. Default
-- false backfills every existing soft-deleted row as a manual dismissal,
-- which is exactly what they all are: this column did not exist before, so
-- nothing could have set it.

-- AlterTable
ALTER TABLE "VolunteerHoursEntry" ADD COLUMN "deletedBySystem" BOOLEAN NOT NULL DEFAULT false;

-- Rename the SALOP_SUPPORT enum value to CNE_SUPPORT everywhere it's used.
-- ALTER TYPE ... RENAME VALUE keeps existing rows pointing at the same value,
-- unlike drop-and-add which would orphan any row still on the old label.
ALTER TYPE "AvailabilityWindowCategory" RENAME VALUE 'SALOP_SUPPORT' TO 'CNE_SUPPORT';
ALTER TYPE "VolunteerActivityType" RENAME VALUE 'SALOP_SUPPORT' TO 'CNE_SUPPORT';
ALTER TYPE "EventReportType" RENAME VALUE 'SALOP_SUPPORT' TO 'CNE_SUPPORT';

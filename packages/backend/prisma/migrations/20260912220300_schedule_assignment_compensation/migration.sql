-- Stage 1 of the paid-staff rework: `ScheduleAssignment.compensationOverride`
-- (nullable, #245) becomes `compensation` (non-null, always resolved and
-- stored at write time — D3). Safe to backfill with 'SALARY' in this
-- migration, unlike the enum-add migration before it: 'SALARY' was added and
-- committed there, in an earlier transaction.

-- AlterTable (rename column)
ALTER TABLE "ScheduleAssignment" RENAME COLUMN "compensationOverride" TO "compensation";

-- Backfill: an existing non-null value was already an explicit call
-- (PAID_EXTRA, renamed to PAID by the earlier migration) and needs no
-- further change. A null becomes 'SALARY' when the assignee had a matching
-- recurring on-clock pattern for that exact weekday under a contract
-- covering the shift's date, else the safe default 'VOLUNTEER'.
--
-- This is an approximation of `isOnPaidClock`'s minute-overlap rule: a
-- `ScheduleAssignment` does not store the shift's own clock minutes (those
-- come from the availability window's shift pattern, resolved in
-- application code), so a raw-SQL backfill can only match on day-of-week and
-- date coverage, not minute overlap. In every environment this migration is
-- known to run against, "PaidStaffSchedule" has zero rows as of this change
-- (#245 and the schedule it introduced are both only hours old), so this
-- branch is not expected to match anything today — it is here so a
-- differently-seeded environment still gets a reasoned answer instead of a
-- blanket 'VOLUNTEER'.
UPDATE "ScheduleAssignment" sa
SET "compensation" = 'SALARY'
WHERE sa."compensation" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "PaidStaffSchedule" ps
    JOIN "EmploymentContract" ec ON ec.id = ps."contractId"
    WHERE ps."userId" = sa."userId"
      AND ps."dayOfWeek" = EXTRACT(DOW FROM sa."date")::int
      AND ps."effectiveFrom" <= sa."date"
      AND (ps."effectiveTo" IS NULL OR sa."date" <= ps."effectiveTo")
      AND ec."startDate" <= sa."date"
      AND (ec."endDate" IS NULL OR sa."date" <= ec."endDate")
  );

UPDATE "ScheduleAssignment" SET "compensation" = 'VOLUNTEER' WHERE "compensation" IS NULL;

-- AlterTable (now safe to require, and to default new rows to VOLUNTEER)
ALTER TABLE "ScheduleAssignment" ALTER COLUMN "compensation" SET NOT NULL;
ALTER TABLE "ScheduleAssignment" ALTER COLUMN "compensation" SET DEFAULT 'VOLUNTEER';

-- AlterTable (new columns: who set compensation explicitly, and when)
ALTER TABLE "ScheduleAssignment" ADD COLUMN "compensationSetById" TEXT;
ALTER TABLE "ScheduleAssignment" ADD COLUMN "compensationSetAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_compensationSetById_fkey" FOREIGN KEY ("compensationSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

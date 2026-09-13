-- Stage 1 of the paid-staff rework: every `PaidStaffSchedule` block now
-- belongs to one `EmploymentContract`. Three steps, not one, so the NOT NULL
-- below never runs against a row it can't yet satisfy: add nullable → UPDATE
-- from the contract the previous migration just backfilled (one per user,
-- so this join is unambiguous) → SET NOT NULL + FK.

-- AlterTable (nullable first)
ALTER TABLE "PaidStaffSchedule" ADD COLUMN "contractId" TEXT;

-- Backfill: the previous migration created exactly one EmploymentContract
-- per user who had any PaidStaffSchedule row (isPaidStaff=true OR orphan
-- blocks), so this join assigns every existing block to that same contract.
UPDATE "PaidStaffSchedule" ps
SET "contractId" = ec.id
FROM "EmploymentContract" ec
WHERE ec."userId" = ps."userId";

-- AlterTable (now safe to require)
ALTER TABLE "PaidStaffSchedule" ALTER COLUMN "contractId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "PaidStaffSchedule" ADD CONSTRAINT "PaidStaffSchedule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EmploymentContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PaidStaffSchedule_contractId_idx" ON "PaidStaffSchedule"("contractId");

-- Also fix a #245 oversight while in this table: `setOverride` upserts, but
-- `PaidStaffScheduleOverride` had no `updatedAt` to show it. Added nullable
-- first, backfilled from `createdAt` (an untouched row's true "last
-- modified" instant), then required — never `now()`, which would fabricate
-- an edit that never happened.
ALTER TABLE "PaidStaffScheduleOverride" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "PaidStaffScheduleOverride" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "PaidStaffScheduleOverride" ALTER COLUMN "updatedAt" SET NOT NULL;

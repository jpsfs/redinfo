-- Stage 1 of the paid-staff rework: `EmploymentContract` replaces #223's
-- timeless `User.isPaidStaff` flag with a dated fact.

-- CreateEnum
CREATE TYPE "EmploymentContractKind" AS ENUM ('FULL_TIME', 'PART_TIME');

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EmploymentContractKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmploymentContract_userId_startDate_idx" ON "EmploymentContract"("userId", "startDate");

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: nullable, unlike every other actor FK in this schema — a
-- migration-backfilled contract has no real actor (there is no system
-- user), so this stays SET NULL rather than RESTRICT/CASCADE.
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one contract per user who was either marked isPaidStaff, or has
-- PaidStaffSchedule blocks despite not being marked (the flag was
-- independently editable at users.service.ts, so orphan blocks were
-- possible and would otherwise break the next migration's NOT NULL on
-- "PaidStaffSchedule"."contractId"). `startDate` has no real source: the
-- earliest block's own "effectiveFrom" where one exists, else today — never
-- "User"."joinedOn", which is delegation membership, not employment.
INSERT INTO "EmploymentContract" ("id", "userId", "kind", "startDate", "endDate", "createdById", "createdAt", "updatedAt")
SELECT
    'ecbf' || substr(md5(random()::text || u.id), 1, 21),
    u.id,
    'FULL_TIME',
    LEAST(COALESCE(blocks.min_effective_from, CURRENT_DATE), CURRENT_DATE),
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN (
    SELECT "userId", MIN("effectiveFrom") AS min_effective_from
    FROM "PaidStaffSchedule"
    GROUP BY "userId"
) blocks ON blocks."userId" = u.id
WHERE u."isPaidStaff" = true OR blocks."userId" IS NOT NULL;

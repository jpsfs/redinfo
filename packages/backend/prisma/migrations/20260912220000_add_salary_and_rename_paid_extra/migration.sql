-- Stage 1 of the paid-staff rework (supersedes #223/#245).
--
-- Alone in its own migration on purpose: a newly added enum value cannot be
-- used in DML in the same transaction that adds it (Prisma wraps every
-- migration in one transaction), so the DML that backfills
-- "ScheduleAssignment"."compensation" with 'SALARY' has to live in a later
-- migration. The rename below is safe alongside the add — it does not touch
-- the freshly added value at all.

-- AlterEnum
ALTER TYPE "AssignmentCompensationKind" ADD VALUE 'SALARY';

-- AlterEnum
ALTER TYPE "AssignmentCompensationKind" RENAME VALUE 'PAID_EXTRA' TO 'PAID';

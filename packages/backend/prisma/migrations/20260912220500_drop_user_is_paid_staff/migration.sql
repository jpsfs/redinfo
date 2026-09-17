-- Stage 1 of the paid-staff rework: `User.isPaidStaff` (#223) is fully
-- superseded by `EmploymentContract` — every user it was set true for
-- already got a backfilled contract in
-- `20260912220100_add_employment_contract`. Dropped last, and in its own
-- migration, because it was that backfill's only source: keeping it around
-- until every other migration in this change has run leaves a rollback
-- window right up to this point.

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isPaidStaff";

-- CreateEnum
CREATE TYPE "EstimatedEndSource" AS ENUM ('FACILITY_SUPPLIED', 'COORDINATOR_JUDGED');

-- AlterTable
ALTER TABLE "DelegationSettings" ADD COLUMN     "arrivalToleranceMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "arrivalWindowEarliestMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "arrivalWindowLatestMinutes" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "arrivalToleranceMinutesOverride" INTEGER,
ADD COLUMN     "arrivalWindowEarliestMinutesOverride" INTEGER,
ADD COLUMN     "arrivalWindowLatestMinutesOverride" INTEGER;

-- AlterTable
ALTER TABLE "TransportLeg" ADD COLUMN     "estimatedEndAt" TIMESTAMP(3),
ADD COLUMN     "estimatedEndSource" "EstimatedEndSource";

-- CreateTable
CREATE TABLE "OccurrenceTypePolicy" (
    "occurrenceType" "TransportRequestOccurrenceType" NOT NULL,
    "minimumDurationMinutes" INTEGER NOT NULL,
    "defaultDurationMinutes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OccurrenceTypePolicy_pkey" PRIMARY KEY ("occurrenceType")
);

-- Seed values (#233) — every occurrence type gets a row here so a leg's
-- estimated end is never blank; matches `DEFAULT_OCCURRENCE_TYPE_POLICIES`
-- in shared, which is only the fallback for a `db push` test database this
-- migration never touches.
INSERT INTO "OccurrenceTypePolicy" ("occurrenceType", "minimumDurationMinutes", "defaultDurationMinutes", "updatedAt")
VALUES
  ('CONSULTA', 30, 30, CURRENT_TIMESTAMP),
  ('TRATAMENTO', 30, 60, CURRENT_TIMESTAMP),
  ('ALTA', 15, 20, CURRENT_TIMESTAMP),
  ('EXAME', 30, 45, CURRENT_TIMESTAMP),
  ('OUTRO', 30, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("occurrenceType") DO NOTHING;

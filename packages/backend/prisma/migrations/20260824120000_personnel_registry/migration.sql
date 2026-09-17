-- Personnel registry and operational role readiness (ADO #163).
--
-- Adds a real certification model — Driver, SBV, TAT, TAS — replacing the
-- single `User.isDriver` boolean, and the profile fields a registry needs
-- (contact, identity numbers, photo, blood type, emergency contact). Column
-- order matters here: the backfill below reads `User.isDriver` before it is
-- dropped, and `AvailabilityWindowRole.requiresDriverCertification` before
-- it is dropped.

-- CreateEnum
CREATE TYPE "CertificationType" AS ENUM ('DRIVER', 'SBV', 'TAT', 'TAS');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- AlterTable: personnel profile fields. All nullable — this lands on live rows.
ALTER TABLE "User"
    ADD COLUMN     "addressLine" TEXT,
    ADD COLUMN     "birthDate" DATE,
    ADD COLUMN     "bloodType" "BloodType",
    ADD COLUMN     "citizenCardNumber" TEXT,
    ADD COLUMN     "emergencyContactName" TEXT,
    ADD COLUMN     "emergencyContactPhone" TEXT,
    ADD COLUMN     "joinedOn" DATE,
    ADD COLUMN     "localityId" TEXT,
    ADD COLUMN     "nif" TEXT,
    ADD COLUMN     "phone" TEXT,
    ADD COLUMN     "photoByteSize" INTEGER,
    ADD COLUMN     "photoFilename" TEXT,
    ADD COLUMN     "photoMimeType" TEXT,
    ADD COLUMN     "photoStorageKey" TEXT,
    ADD COLUMN     "postalCode" TEXT,
    ADD COLUMN     "redCrossNumber" TEXT,
    ADD COLUMN     "volunteerNumber" TEXT;

-- CreateTable
CREATE TABLE "UserCertification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CertificationType" NOT NULL,
    "validUntil" DATE,
    "issuedOn" DATE,
    "notes" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "storageKey" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfileAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfileAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCertification_storageKey_key" ON "UserCertification"("storageKey");

-- CreateIndex
CREATE INDEX "UserCertification_userId_idx" ON "UserCertification"("userId");

-- CreateIndex: drives the expiring-soon query.
CREATE INDEX "UserCertification_type_validUntil_idx" ON "UserCertification"("type", "validUntil");

-- CreateIndex: one record per certification per person.
CREATE UNIQUE INDEX "UserCertification_userId_type_key" ON "UserCertification"("userId", "type");

-- CreateIndex
CREATE INDEX "UserProfileAudit_userId_idx" ON "UserProfileAudit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_redCrossNumber_key" ON "User"("redCrossNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_volunteerNumber_key" ON "User"("volunteerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_nif_key" ON "User"("nif");

-- CreateIndex
CREATE UNIQUE INDEX "User_photoStorageKey_key" ON "User"("photoStorageKey");

-- CreateIndex
CREATE INDEX "User_localityId_idx" ON "User"("localityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCertification" ADD CONSTRAINT "UserCertification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCertification" ADD CONSTRAINT "UserCertification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfileAudit" ADD CONSTRAINT "UserProfileAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfileAudit" ADD CONSTRAINT "UserProfileAudit_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing certified driver becomes a DRIVER certification
-- with no known expiry ("no known expiry — counts as valid"), so scheduling
-- behaviour is unchanged the moment this migration runs. `createdById` is the
-- person themselves — there is no human actor to attribute a migration to.
-- Deliberately NOT backfilled: TAT/TAS. Fabricating those would claim an
-- award nobody confirmed; a coordinator adds them as the real records arrive.
INSERT INTO "UserCertification" ("id", "userId", "type", "validUntil", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", 'DRIVER', NULL, u."id", now(), now()
FROM "User" u
WHERE u."isDriver" = true;

-- AlterTable: isDriver is now computed from holding a valid DRIVER
-- certification (see `holdsCertification` in @redinfo/shared) — the column
-- itself is retired now that the backfill above has read it.
ALTER TABLE "User" DROP COLUMN "isDriver";

-- AlterTable: requiresDriverCertification generalises to a configurable
-- requiredCertification. Existing roles named "Driver" keep exactly the rule
-- they already enforced; every other existing role is left with no
-- requirement — the new EMERGENCY defaults (Condutor→DRIVER, Chefe de
-- Equipa→TAS, Socorrista→TAT) apply only to windows opened from now on, so no
-- published schedule starts warning about a requirement it was never built
-- against.
ALTER TABLE "AvailabilityWindowRole" ADD COLUMN "requiredCertification" "CertificationType";

UPDATE "AvailabilityWindowRole"
SET "requiredCertification" = 'DRIVER'
WHERE "requiresDriverCertification" = true;

ALTER TABLE "AvailabilityWindowRole" DROP COLUMN "requiresDriverCertification";

-- AlterTable
ALTER TABLE "ScheduleAssignment" ADD COLUMN "certificationOverrideReason" TEXT;

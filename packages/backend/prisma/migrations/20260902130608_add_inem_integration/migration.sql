-- CreateEnum
CREATE TYPE "INEMSessionStatus" AS ENUM ('UNKNOWN', 'LOGGING_IN', 'ACTIVE', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "OWASessionStatus" AS ENUM ('UNSET', 'ACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "INEMSession" (
    "id" TEXT NOT NULL DEFAULT 'inem',
    "status" "INEMSessionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "cookies" BYTEA,
    "expiresAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "INEMSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OWASession" (
    "id" TEXT NOT NULL DEFAULT 'owa',
    "status" "OWASessionStatus" NOT NULL DEFAULT 'UNSET',
    "storageState" BYTEA,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OWASession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "INEMUnit" (
    "unitId" TEXT NOT NULL,
    "station" TEXT,
    "carId" TEXT,
    "unitType" TEXT,
    "desiredInopCode" TEXT,
    "reportedInopCode" TEXT,
    "reportedActive" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "vehicleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "INEMUnit_pkey" PRIMARY KEY ("unitId")
);

-- CreateTable
CREATE TABLE "INEMStatusAudit" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inopCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "INEMStatusAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "INEMUnit_vehicleId_idx" ON "INEMUnit"("vehicleId");

-- CreateIndex
CREATE INDEX "INEMStatusAudit_unitId_idx" ON "INEMStatusAudit"("unitId");

-- CreateIndex
CREATE INDEX "INEMStatusAudit_userId_idx" ON "INEMStatusAudit"("userId");

-- AddForeignKey
ALTER TABLE "INEMUnit" ADD CONSTRAINT "INEMUnit_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "INEMStatusAudit" ADD CONSTRAINT "INEMStatusAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one row each of INEMSession/OWASession — the id is fixed, so an
-- accidental second row is impossible rather than merely unlikely. Same
-- pattern as DelegationSettings.
ALTER TABLE "INEMSession"
  ADD CONSTRAINT "INEMSession_single_row" CHECK ("id" = 'inem');

ALTER TABLE "OWASession"
  ADD CONSTRAINT "OWASession_single_row" CHECK ("id" = 'owa');

-- Seed both singleton rows so the app can always assume they exist rather
-- than lazily upserting on first use.
INSERT INTO "INEMSession" ("id", "status", "failureCount", "updatedAt")
VALUES ('inem', 'UNKNOWN', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "OWASession" ("id", "status", "updatedAt")
VALUES ('owa', 'UNSET', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

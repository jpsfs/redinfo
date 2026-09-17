-- CreateEnum
CREATE TYPE "PatientMobility" AS ENUM ('AMBULATORY', 'WHEELCHAIR', 'STRETCHER');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "identity" BYTEA,
    "identityPurgedAt" TIMESTAMP(3),
    "mobility" "PatientMobility" NOT NULL DEFAULT 'AMBULATORY',
    "needsOxygen" BOOLEAN NOT NULL DEFAULT false,
    "escortRequired" BOOLEAN NOT NULL DEFAULT false,
    "isBariatric" BOOLEAN NOT NULL DEFAULT false,
    "defaultLatitude" DOUBLE PRECISION,
    "defaultLongitude" DOUBLE PRECISION,
    "localityId" TEXT,
    "referenceContactIsOrganisation" BOOLEAN NOT NULL DEFAULT false,
    "contactAuthorisationRecorded" BOOLEAN NOT NULL DEFAULT false,
    "contactAuthorisationNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_localityId_idx" ON "Patient"("localityId");

-- CreateIndex
CREATE INDEX "Patient_isActive_idx" ON "Patient"("isActive");

-- CreateIndex
CREATE INDEX "Patient_updatedAt_idx" ON "Patient"("updatedAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

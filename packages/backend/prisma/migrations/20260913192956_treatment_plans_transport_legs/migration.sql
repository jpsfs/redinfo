-- CreateEnum
CREATE TYPE "LegDirection" AS ENUM ('OUTBOUND', 'RETURN');

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "LegCancellationSource" AS ENUM ('PATIENT', 'FACILITY', 'DELEGATION');

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "transportRequestId" TEXT NOT NULL,
    "destinationFacilityId" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "treatmentStartTime" TEXT NOT NULL,
    "treatmentEndTime" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportLeg" (
    "id" TEXT NOT NULL,
    "transportRequestId" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "date" DATE NOT NULL,
    "generatedForDate" DATE NOT NULL,
    "direction" "LegDirection" NOT NULL,
    "originAddress" TEXT,
    "originLatitude" DOUBLE PRECISION,
    "originLongitude" DOUBLE PRECISION,
    "originFacilityId" TEXT,
    "destinationAddress" TEXT,
    "destinationLatitude" DOUBLE PRECISION,
    "destinationLongitude" DOUBLE PRECISION,
    "destinationFacilityId" TEXT,
    "plannedPickupAt" TIMESTAMP(3),
    "plannedDropoffAt" TIMESTAMP(3),
    "actualPickupAt" TIMESTAMP(3),
    "actualDropoffAt" TIMESTAMP(3),
    "status" "LegStatus" NOT NULL DEFAULT 'PLANNED',
    "cancellationReason" TEXT,
    "cancellationSource" "LegCancellationSource",
    "tripStopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentPlan_transportRequestId_idx" ON "TreatmentPlan"("transportRequestId");

-- CreateIndex
CREATE INDEX "TreatmentPlan_destinationFacilityId_idx" ON "TreatmentPlan"("destinationFacilityId");

-- CreateIndex
CREATE INDEX "TransportLeg_transportRequestId_idx" ON "TransportLeg"("transportRequestId");

-- CreateIndex
CREATE INDEX "TransportLeg_treatmentPlanId_idx" ON "TransportLeg"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "TransportLeg_date_idx" ON "TransportLeg"("date");

-- CreateIndex
CREATE INDEX "TransportLeg_status_idx" ON "TransportLeg"("status");

-- CreateIndex
CREATE INDEX "TransportLeg_treatmentPlanId_generatedForDate_direction_idx" ON "TransportLeg"("treatmentPlanId", "generatedForDate", "direction");

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_transportRequestId_fkey" FOREIGN KEY ("transportRequestId") REFERENCES "TransportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_destinationFacilityId_fkey" FOREIGN KEY ("destinationFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLeg" ADD CONSTRAINT "TransportLeg_transportRequestId_fkey" FOREIGN KEY ("transportRequestId") REFERENCES "TransportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLeg" ADD CONSTRAINT "TransportLeg_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLeg" ADD CONSTRAINT "TransportLeg_originFacilityId_fkey" FOREIGN KEY ("originFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLeg" ADD CONSTRAINT "TransportLeg_destinationFacilityId_fkey" FOREIGN KEY ("destinationFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

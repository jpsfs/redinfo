-- CreateEnum
CREATE TYPE "TransportRequestOccurrenceType" AS ENUM ('CONSULTA', 'TRATAMENTO', 'ALTA', 'EXAME', 'OUTRO');

-- CreateEnum
CREATE TYPE "TransportRequestVehicleType" AS ENUM ('AMBULANCIA', 'TRANSPORTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "TransportRequestDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "communicatedAt" TIMESTAMP(3) NOT NULL,
    "requesterAccountCode" TEXT NOT NULL,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "externalServiceNumber" TEXT NOT NULL,
    "appointmentAt" TIMESTAMP(3) NOT NULL,
    "requestingOrganisationId" TEXT NOT NULL,
    "payingOrganisationId" TEXT NOT NULL,
    "agreementId" TEXT,
    "patientId" TEXT NOT NULL,
    "occurrenceType" "TransportRequestOccurrenceType" NOT NULL,
    "requestedVehicleType" "TransportRequestVehicleType" NOT NULL,
    "escortTravels" BOOLEAN NOT NULL DEFAULT false,
    "isRoundTrip" BOOLEAN NOT NULL DEFAULT false,
    "originAddress" TEXT NOT NULL,
    "originLatitude" DOUBLE PRECISION,
    "originLongitude" DOUBLE PRECISION,
    "destinationFacilityId" TEXT NOT NULL,
    "freeTextMessage" TEXT,
    "coordColumnValue" TEXT,
    "decision" "TransportRequestDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "externallyRegisteredAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportRequest_decision_idx" ON "TransportRequest"("decision");

-- CreateIndex
CREATE INDEX "TransportRequest_responseDueAt_idx" ON "TransportRequest"("responseDueAt");

-- CreateIndex
CREATE INDEX "TransportRequest_payingOrganisationId_idx" ON "TransportRequest"("payingOrganisationId");

-- CreateIndex
CREATE INDEX "TransportRequest_agreementId_idx" ON "TransportRequest"("agreementId");

-- CreateIndex
CREATE INDEX "TransportRequest_patientId_idx" ON "TransportRequest"("patientId");

-- CreateIndex
CREATE INDEX "TransportRequest_destinationFacilityId_idx" ON "TransportRequest"("destinationFacilityId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRequest_requestingOrganisationId_externalServiceNu_key" ON "TransportRequest"("requestingOrganisationId", "externalServiceNumber");

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_requestingOrganisationId_fkey" FOREIGN KEY ("requestingOrganisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_payingOrganisationId_fkey" FOREIGN KEY ("payingOrganisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_destinationFacilityId_fkey" FOREIGN KEY ("destinationFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "VehicleOccupancySource" AS ENUM ('SCHEDULE_SHIFT', 'TRANSPORT_TRIP', 'MAINTENANCE', 'SUPPORT_EVENT');

-- CreateTable
CREATE TABLE "VehicleOccupancy" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "source" "VehicleOccupancySource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "overrideReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleOccupancy_vehicleId_startsAt_endsAt_idx" ON "VehicleOccupancy"("vehicleId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "VehicleOccupancy_source_sourceId_idx" ON "VehicleOccupancy"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "VehicleOccupancy" ADD CONSTRAINT "VehicleOccupancy_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

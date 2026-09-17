-- CreateEnum
CREATE TYPE "TrafficFactorSource" AS ENUM ('PURCHASED', 'MEASURED');

-- CreateEnum
CREATE TYPE "TrafficDayType" AS ENUM ('WEEKDAY', 'SATURDAY', 'SUNDAY_HOLIDAY');

-- CreateTable
CREATE TABLE "TrafficCorridorFactor" (
    "id" TEXT NOT NULL,
    "originLocalityId" TEXT,
    "originFacilityId" TEXT,
    "destinationLocalityId" TEXT,
    "destinationFacilityId" TEXT,
    "corridorKey" TEXT NOT NULL,
    "departureBucket" INTEGER NOT NULL,
    "dayType" "TrafficDayType" NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "source" "TrafficFactorSource" NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficCorridorFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrafficCorridorFactor_departureBucket_dayType_idx" ON "TrafficCorridorFactor"("departureBucket", "dayType");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficCorridorFactor_corridorKey_departureBucket_dayType_key" ON "TrafficCorridorFactor"("corridorKey", "departureBucket", "dayType");

-- AddForeignKey
ALTER TABLE "TrafficCorridorFactor" ADD CONSTRAINT "TrafficCorridorFactor_originLocalityId_fkey" FOREIGN KEY ("originLocalityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficCorridorFactor" ADD CONSTRAINT "TrafficCorridorFactor_originFacilityId_fkey" FOREIGN KEY ("originFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficCorridorFactor" ADD CONSTRAINT "TrafficCorridorFactor_destinationLocalityId_fkey" FOREIGN KEY ("destinationLocalityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficCorridorFactor" ADD CONSTRAINT "TrafficCorridorFactor_destinationFacilityId_fkey" FOREIGN KEY ("destinationFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

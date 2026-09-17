-- CreateTable
CREATE TABLE "INEMUnitStatusPeriod" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "inopCode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "INEMUnitStatusPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "INEMUnitStatusPeriod_unitId_startedAt_idx" ON "INEMUnitStatusPeriod"("unitId", "startedAt");

-- CreateIndex
CREATE INDEX "INEMUnitStatusPeriod_vehicleId_startedAt_idx" ON "INEMUnitStatusPeriod"("vehicleId", "startedAt");

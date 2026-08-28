-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('CONSUMPTION', 'MANUAL_ADJUSTMENT', 'IMPORT', 'CORRECTION');

-- AlterTable
ALTER TABLE "VehicleInventoryItem" ADD COLUMN     "needsRecount" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "materialItemId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "reportId" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_vehicleId_occurredAt_idx" ON "StockMovement"("vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_reportId_idx" ON "StockMovement"("reportId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "MaterialItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

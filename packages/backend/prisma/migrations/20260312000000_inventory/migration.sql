-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('COUNTABLE', 'UNLIMITED');

-- CreateTable
CREATE TABLE "InventoryTemplate" (
    "id" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InventoryItemType" NOT NULL DEFAULT 'COUNTABLE',
    "recommendedQuantity" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleInventoryItem" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "actualQuantity" INTEGER,
    "templateVersion" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleInventoryAudit" (
    "id" TEXT NOT NULL,
    "vehicleInventoryItemId" TEXT NOT NULL,
    "changedById" TEXT,
    "oldQuantity" INTEGER,
    "newQuantity" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleInventoryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTemplate_vehicleType_key" ON "InventoryTemplate"("vehicleType");

-- CreateIndex
CREATE INDEX "InventoryTemplate_vehicleType_idx" ON "InventoryTemplate"("vehicleType");

-- CreateIndex
CREATE INDEX "InventoryTemplateItem_templateId_idx" ON "InventoryTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "InventoryTemplateItem_isDeleted_idx" ON "InventoryTemplateItem"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleInventoryItem_vehicleId_templateItemId_key" ON "VehicleInventoryItem"("vehicleId", "templateItemId");

-- CreateIndex
CREATE INDEX "VehicleInventoryItem_vehicleId_idx" ON "VehicleInventoryItem"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleInventoryItem_templateItemId_idx" ON "VehicleInventoryItem"("templateItemId");

-- CreateIndex
CREATE INDEX "VehicleInventoryAudit_vehicleInventoryItemId_idx" ON "VehicleInventoryAudit"("vehicleInventoryItemId");

-- AddForeignKey
ALTER TABLE "InventoryTemplateItem" ADD CONSTRAINT "InventoryTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InventoryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInventoryItem" ADD CONSTRAINT "VehicleInventoryItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInventoryItem" ADD CONSTRAINT "VehicleInventoryItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "InventoryTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInventoryAudit" ADD CONSTRAINT "VehicleInventoryAudit_vehicleInventoryItemId_fkey" FOREIGN KEY ("vehicleInventoryItemId") REFERENCES "VehicleInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

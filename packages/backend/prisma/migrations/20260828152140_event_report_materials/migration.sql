-- CreateTable
CREATE TABLE "EventReportMaterial" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "materialItemId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "quantity" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "EventReportMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventReportMaterial_reportId_idx" ON "EventReportMaterial"("reportId");

-- CreateIndex
CREATE INDEX "EventReportMaterial_materialItemId_idx" ON "EventReportMaterial"("materialItemId");

-- CreateIndex
CREATE INDEX "EventReportMaterial_vehicleId_idx" ON "EventReportMaterial"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportMaterial_reportId_materialItemId_vehicleId_key" ON "EventReportMaterial"("reportId", "materialItemId", "vehicleId");

-- AddForeignKey
ALTER TABLE "EventReportMaterial" ADD CONSTRAINT "EventReportMaterial_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportMaterial" ADD CONSTRAINT "EventReportMaterial_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "MaterialItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportMaterial" ADD CONSTRAINT "EventReportMaterial_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

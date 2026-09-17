-- CreateEnum
CREATE TYPE "InemSupportUnitType" AS ENUM ('VMER', 'SIV', 'UMIP');

-- CreateTable
CREATE TABLE "EventReportInemSupportUnit" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "unitType" "InemSupportUnitType" NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "EventReportInemSupportUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventReportInemSupportUnit_reportId_idx" ON "EventReportInemSupportUnit"("reportId");

-- CreateIndex
CREATE INDEX "EventReportInemSupportUnit_hospitalId_idx" ON "EventReportInemSupportUnit"("hospitalId");

-- CreateIndex
CREATE INDEX "EventReportInemSupportUnit_unitType_idx" ON "EventReportInemSupportUnit"("unitType");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportInemSupportUnit_reportId_position_key" ON "EventReportInemSupportUnit"("reportId", "position");

-- AddForeignKey
ALTER TABLE "EventReportInemSupportUnit" ADD CONSTRAINT "EventReportInemSupportUnit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportInemSupportUnit" ADD CONSTRAINT "EventReportInemSupportUnit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

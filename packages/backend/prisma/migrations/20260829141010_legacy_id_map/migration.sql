-- CreateTable
CREATE TABLE "LegacyIdMap" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "newId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "firstRunId" TEXT NOT NULL,
    "lastRunId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyIdMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyIdMap_entity_idx" ON "LegacyIdMap"("entity");

-- CreateIndex
CREATE INDEX "LegacyIdMap_lastRunId_idx" ON "LegacyIdMap"("lastRunId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyIdMap_entity_legacyId_key" ON "LegacyIdMap"("entity", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyIdMap_entity_newId_key" ON "LegacyIdMap"("entity", "newId");

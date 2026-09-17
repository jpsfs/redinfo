-- AlterTable
ALTER TABLE "InventoryTemplateItem" ADD COLUMN     "materialItemId" TEXT;

-- CreateTable
CREATE TABLE "MaterialItem" (
    "id" TEXT NOT NULL,
    "namePt" TEXT NOT NULL,
    "nameEn" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "type" "InventoryItemType" NOT NULL DEFAULT 'COUNTABLE',
    "notes" TEXT,
    "isFrequent" BOOLEAN NOT NULL DEFAULT false,
    "frequentOrder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialItemBarcode" (
    "id" TEXT NOT NULL,
    "materialItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "MaterialItemBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialItem_isFrequent_idx" ON "MaterialItem"("isFrequent");

-- CreateIndex
CREATE INDEX "MaterialItem_isDeleted_idx" ON "MaterialItem"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialItemBarcode_code_key" ON "MaterialItemBarcode"("code");

-- CreateIndex
CREATE INDEX "MaterialItemBarcode_materialItemId_idx" ON "MaterialItemBarcode"("materialItemId");

-- CreateIndex
CREATE INDEX "InventoryTemplateItem_materialItemId_idx" ON "InventoryTemplateItem"("materialItemId");

-- AddForeignKey
ALTER TABLE "MaterialItemBarcode" ADD CONSTRAINT "MaterialItemBarcode_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "MaterialItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTemplateItem" ADD CONSTRAINT "InventoryTemplateItem_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "MaterialItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: one MaterialItem per distinct lower(trim(name)) among
-- existing template items (namePt = the existing name, nameEn left null,
-- unit/type taken from the first row created in each group), then repoint
-- every InventoryTemplateItem at it. Deterministic and re-runnable — the
-- WHERE "materialItemId" IS NULL guards both statements against a re-run.
INSERT INTO "MaterialItem" ("id", "namePt", "nameEn", "unit", "type", "isDeleted", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  grouped."namePt",
  NULL,
  grouped."unit",
  grouped."type",
  false,
  now(),
  now()
FROM (
  SELECT DISTINCT ON (lower(trim(iti."name")))
    iti."name"   AS "namePt",
    iti."unit"   AS "unit",
    iti."type"   AS "type"
  FROM "InventoryTemplateItem" iti
  WHERE iti."materialItemId" IS NULL
  ORDER BY lower(trim(iti."name")), iti."createdAt" ASC
) grouped;

UPDATE "InventoryTemplateItem" iti
SET "materialItemId" = mi."id"
FROM "MaterialItem" mi
WHERE iti."materialItemId" IS NULL
  AND lower(trim(iti."name")) = lower(trim(mi."namePt"));

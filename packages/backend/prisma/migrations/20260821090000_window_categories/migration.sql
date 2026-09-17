-- Windows belong to a category (an independent rota) and may carry a name.
-- CreateEnum
CREATE TYPE "AvailabilityWindowCategory" AS ENUM ('EMERGENCY', 'LOCAL_SUPPORT', 'SALOP_SUPPORT');

-- AlterTable
-- Added with a default so existing windows land on EMERGENCY (every window
-- opened before categories existed was emergency cover), then the default is
-- dropped: from here on every caller states the category explicitly.
ALTER TABLE "AvailabilityWindow" ADD COLUMN "category" "AvailabilityWindowCategory" NOT NULL DEFAULT 'EMERGENCY';
ALTER TABLE "AvailabilityWindow" ALTER COLUMN "category" DROP DEFAULT;

-- Free text, deliberately not unique: two "Emergency - October" windows a year
-- apart are ordinary.
ALTER TABLE "AvailabilityWindow" ADD COLUMN "name" TEXT;

-- CreateIndex
CREATE INDEX "AvailabilityWindow_category_status_idx" ON "AvailabilityWindow"("category", "status");

-- AlterTable
ALTER TABLE "VolunteerHoursEntry" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedById" TEXT;

-- CreateIndex
CREATE INDEX "VolunteerHoursEntry_status_date_idx" ON "VolunteerHoursEntry"("status", "date");

-- CreateIndex
CREATE INDEX "VolunteerHoursEntry_deletedAt_idx" ON "VolunteerHoursEntry"("deletedAt");

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerHoursEntry" ADD CONSTRAINT "VolunteerHoursEntry_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

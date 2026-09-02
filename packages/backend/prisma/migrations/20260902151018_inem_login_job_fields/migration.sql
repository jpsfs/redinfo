-- AlterTable
ALTER TABLE "INEMSession" ADD COLUMN     "pendingLoginId" TEXT,
ADD COLUMN     "pendingLoginStartedAt" TIMESTAMP(3);

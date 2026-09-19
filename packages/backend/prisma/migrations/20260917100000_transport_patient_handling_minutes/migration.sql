-- AlterTable
ALTER TABLE "DelegationSettings" ADD COLUMN     "dropoffHandlingMinutes" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pickupHandlingMinutes" INTEGER NOT NULL DEFAULT 3;

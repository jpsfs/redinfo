-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "hasRampOrLift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seatedCapacity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stretcherPositions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wheelchairPositions" INTEGER NOT NULL DEFAULT 0;

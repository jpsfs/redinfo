-- CreateEnum
CREATE TYPE "AssignmentCompensationKind" AS ENUM ('VOLUNTEER', 'PAID_EXTRA');

-- AlterTable
ALTER TABLE "ScheduleAssignment" ADD COLUMN     "compensationOverride" "AssignmentCompensationKind";

-- CreateTable
CREATE TABLE "PaidStaffSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaidStaffSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaidStaffScheduleOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isOff" BOOLEAN NOT NULL DEFAULT false,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaidStaffScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaidStaffSchedule_userId_dayOfWeek_idx" ON "PaidStaffSchedule"("userId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "PaidStaffScheduleOverride_userId_date_key" ON "PaidStaffScheduleOverride"("userId", "date");

-- AddForeignKey
ALTER TABLE "PaidStaffSchedule" ADD CONSTRAINT "PaidStaffSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidStaffSchedule" ADD CONSTRAINT "PaidStaffSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidStaffScheduleOverride" ADD CONSTRAINT "PaidStaffScheduleOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaidStaffScheduleOverride" ADD CONSTRAINT "PaidStaffScheduleOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

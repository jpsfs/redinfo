-- CreateEnum
CREATE TYPE "EventReportType" AS ENUM ('EMERGENCY', 'LOCAL_SUPPORT', 'SALOP_SUPPORT');

-- CreateEnum
CREATE TYPE "EventLocationType" AS ENUM ('HOME', 'ROAD', 'PUBLIC_SPACE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VictimDestinationKind" AS ENUM ('HOSPITAL', 'TREATED_ON_SCENE', 'REFUSED_TRANSPORT', 'DECEASED_ON_SCENE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "ineCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReport" (
    "id" TEXT NOT NULL,
    "type" "EventReportType" NOT NULL,
    "number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "occurredOn" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "locationType" "EventLocationType" NOT NULL,
    "localityId" TEXT NOT NULL,
    "activationAt" TIMESTAMP(3),
    "sceneArrivalAt" TIMESTAMP(3),
    "sceneDepartureAt" TIMESTAMP(3),
    "hospitalArrivalAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "scheduleId" TEXT,
    "shiftDate" DATE,
    "shiftSlot" INTEGER,
    "operationalReport" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReportCrewMember" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleName" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "EventReportCrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReportVehicle" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kilometres" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "EventReportVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReportVictim" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "age" INTEGER NOT NULL,
    "destinationKind" "VictimDestinationKind" NOT NULL,
    "destinationHospitalId" TEXT,

    CONSTRAINT "EventReportVictim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReportAttachment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReportCounter" (
    "type" "EventReportType" NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventReportCounter_pkey" PRIMARY KEY ("type","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_ineCode_key" ON "Municipality"("ineCode");

-- CreateIndex
CREATE INDEX "Municipality_district_idx" ON "Municipality"("district");

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_name_district_key" ON "Municipality"("name", "district");

-- CreateIndex
CREATE INDEX "Locality_searchName_idx" ON "Locality"("searchName");

-- CreateIndex
CREATE INDEX "Locality_municipalityId_idx" ON "Locality"("municipalityId");

-- CreateIndex
CREATE UNIQUE INDEX "Locality_municipalityId_name_key" ON "Locality"("municipalityId", "name");

-- CreateIndex
CREATE INDEX "Hospital_isActive_idx" ON "Hospital"("isActive");

-- CreateIndex
CREATE INDEX "Hospital_municipalityId_idx" ON "Hospital"("municipalityId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_name_municipalityId_key" ON "Hospital"("name", "municipalityId");

-- CreateIndex
CREATE INDEX "EventReport_occurredOn_idx" ON "EventReport"("occurredOn");

-- CreateIndex
CREATE INDEX "EventReport_type_occurredOn_idx" ON "EventReport"("type", "occurredOn");

-- CreateIndex
CREATE INDEX "EventReport_localityId_idx" ON "EventReport"("localityId");

-- CreateIndex
CREATE INDEX "EventReport_createdById_idx" ON "EventReport"("createdById");

-- CreateIndex
CREATE INDEX "EventReport_scheduleId_idx" ON "EventReport"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReport_type_year_number_key" ON "EventReport"("type", "year", "number");

-- CreateIndex
CREATE INDEX "EventReportCrewMember_reportId_idx" ON "EventReportCrewMember"("reportId");

-- CreateIndex
CREATE INDEX "EventReportCrewMember_userId_idx" ON "EventReportCrewMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportCrewMember_reportId_userId_key" ON "EventReportCrewMember"("reportId", "userId");

-- CreateIndex
CREATE INDEX "EventReportVehicle_reportId_idx" ON "EventReportVehicle"("reportId");

-- CreateIndex
CREATE INDEX "EventReportVehicle_vehicleId_idx" ON "EventReportVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportVehicle_reportId_vehicleId_key" ON "EventReportVehicle"("reportId", "vehicleId");

-- CreateIndex
CREATE INDEX "EventReportVictim_reportId_idx" ON "EventReportVictim"("reportId");

-- CreateIndex
CREATE INDEX "EventReportVictim_destinationHospitalId_idx" ON "EventReportVictim"("destinationHospitalId");

-- CreateIndex
CREATE INDEX "EventReportVictim_destinationKind_idx" ON "EventReportVictim"("destinationKind");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportVictim_reportId_position_key" ON "EventReportVictim"("reportId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportAttachment_storageKey_key" ON "EventReportAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "EventReportAttachment_reportId_idx" ON "EventReportAttachment"("reportId");

-- CreateIndex
CREATE INDEX "EventReportAttachment_uploadedById_idx" ON "EventReportAttachment"("uploadedById");

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportCrewMember" ADD CONSTRAINT "EventReportCrewMember_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportCrewMember" ADD CONSTRAINT "EventReportCrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportVehicle" ADD CONSTRAINT "EventReportVehicle_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportVehicle" ADD CONSTRAINT "EventReportVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportVictim" ADD CONSTRAINT "EventReportVictim_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportVictim" ADD CONSTRAINT "EventReportVictim_destinationHospitalId_fkey" FOREIGN KEY ("destinationHospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportAttachment" ADD CONSTRAINT "EventReportAttachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportAttachment" ADD CONSTRAINT "EventReportAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A victim is either transported to a hospital, or not transported at all.
-- Prisma cannot express this, and it is the one invariant that would otherwise
-- have to be re-checked by every query and every future report: a HOSPITAL
-- destination without a hospital, or a hospital hung off "refused transport",
-- are both nonsense the database should refuse.
ALTER TABLE "EventReportVictim"
  ADD CONSTRAINT "EventReportVictim_destination_pairing"
  CHECK (
    ("destinationKind" = 'HOSPITAL' AND "destinationHospitalId" IS NOT NULL)
    OR ("destinationKind" <> 'HOSPITAL' AND "destinationHospitalId" IS NULL)
  );

-- The shift a report's crew came from is a (schedule, date, slot) triple or
-- nothing: a slot with no schedule identifies no shift.
ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_shift_reference_complete"
  CHECK (
    ("scheduleId" IS NULL AND "shiftDate" IS NULL AND "shiftSlot" IS NULL)
    OR ("scheduleId" IS NOT NULL AND "shiftDate" IS NOT NULL AND "shiftSlot" IS NOT NULL)
  );

-- Kilometres and ages are quantities, not free integers. Cheap to state here,
-- and it keeps a fat-fingered negative out of every future sum.
ALTER TABLE "EventReportVehicle"
  ADD CONSTRAINT "EventReportVehicle_kilometres_non_negative" CHECK ("kilometres" >= 0);

ALTER TABLE "EventReportVictim"
  ADD CONSTRAINT "EventReportVictim_age_in_range" CHECK ("age" >= 0 AND "age" <= 130);

ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_number_positive" CHECK ("number" >= 1);

-- A service ends after it starts. Null end is "not said yet", which is fine.
ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_ends_after_start"
  CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

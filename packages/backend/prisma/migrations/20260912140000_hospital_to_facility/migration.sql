-- #220: "Hospital" becomes "Facility" — a hospital, clinic or private medical
-- facility. `isEmergencyDestination`/`isTransportDestination` replace the old
-- single-purpose table with two independent capability flags: reusing the
-- table is right (the geography, coordinates and distance logic already
-- exist), but a private clinic must never appear where a crew is choosing an
-- emergency destination.
--
-- Every pre-existing row backfills `isEmergencyDestination = true` — that is
-- all this table has ever been used for. `isTransportDestination` defaults
-- false for it and for every new row from here on: default-deny, explicit
-- opt-in.

ALTER TABLE "Hospital" RENAME TO "Facility";
ALTER TABLE "Facility" RENAME CONSTRAINT "Hospital_pkey" TO "Facility_pkey";
ALTER TABLE "Facility" RENAME CONSTRAINT "Hospital_municipalityId_fkey" TO "Facility_municipalityId_fkey";
ALTER INDEX "Hospital_isActive_idx" RENAME TO "Facility_isActive_idx";
ALTER INDEX "Hospital_municipalityId_idx" RENAME TO "Facility_municipalityId_idx";
ALTER INDEX "Hospital_name_municipalityId_key" RENAME TO "Facility_name_municipalityId_key";

-- Street address (only meaningful for a transport destination — see
-- `validateFacility` in @redinfo/shared) and the two destination flags.
ALTER TABLE "Facility" ADD COLUMN "addressLine" TEXT;
ALTER TABLE "Facility" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Facility" ADD COLUMN "isEmergencyDestination" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Facility" ADD COLUMN "isTransportDestination" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Facility" SET "isEmergencyDestination" = true;

CREATE INDEX "Facility_isEmergencyDestination_idx" ON "Facility"("isEmergencyDestination");
CREATE INDEX "Facility_isTransportDestination_idx" ON "Facility"("isTransportDestination");

-- ─── EventReportVictim.destinationHospitalId → destinationFacilityId ──────────
-- (`EventReportVictim_destination_pairing`'s CHECK expression follows the
-- column rename automatically — Postgres updates it in place.)

ALTER TABLE "EventReportVictim" RENAME COLUMN "destinationHospitalId" TO "destinationFacilityId";
ALTER TABLE "EventReportVictim" RENAME CONSTRAINT "EventReportVictim_destinationHospitalId_fkey" TO "EventReportVictim_destinationFacilityId_fkey";
ALTER INDEX "EventReportVictim_destinationHospitalId_idx" RENAME TO "EventReportVictim_destinationFacilityId_idx";

-- ─── EventReportInemSupportUnit.hospitalId → facilityId ───────────────────────

ALTER TABLE "EventReportInemSupportUnit" RENAME COLUMN "hospitalId" TO "facilityId";
ALTER TABLE "EventReportInemSupportUnit" RENAME CONSTRAINT "EventReportInemSupportUnit_hospitalId_fkey" TO "EventReportInemSupportUnit_facilityId_fkey";
ALTER INDEX "EventReportInemSupportUnit_hospitalId_idx" RENAME TO "EventReportInemSupportUnit_facilityId_idx";

-- ─── LiveRun.destinationHospitalId → destinationFacilityId ────────────────────
-- (`LiveRun_destination_coherent`'s CHECK expression follows along too.)

ALTER TABLE "LiveRun" RENAME COLUMN "destinationHospitalId" TO "destinationFacilityId";
ALTER TABLE "LiveRun" RENAME CONSTRAINT "LiveRun_destinationHospitalId_fkey" TO "LiveRun_destinationFacilityId_fkey";

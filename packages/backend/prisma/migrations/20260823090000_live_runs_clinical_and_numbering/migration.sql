-- Live emergency mode (ADO #154 / #162), extending the report of #151.
--
-- One migration rather than three, because the numbering switch is only coherent
-- applied whole: `submittedAt` must exist before the backfill, the backfill
-- before the constraint is redefined, and a half-applied numbering change is the
-- one state nobody can reason about.
--
-- Built the way `20260822112402_event_reports` was — the DDL from
-- `prisma migrate diff`, then hand-appended backfills and CHECKs with their
-- reasoning.

-- CreateEnum
CREATE TYPE "EventReportAttachmentKind" AS ENUM ('VERBETE', 'GENERAL');

-- CreateEnum
CREATE TYPE "LiveRunState" AS ENUM ('INTAKE', 'EN_ROUTE', 'ON_SCENE', 'EN_ROUTE_TO_HOSPITAL', 'AT_HOSPITAL', 'CLOSED');

-- AlterTable
ALTER TABLE "EventReport" ADD COLUMN     "abcde" JSONB,
ADD COLUMN     "chamuAllergies" TEXT,
ADD COLUMN     "chamuCircumstances" TEXT,
ADD COLUMN     "chamuHistory" TEXT,
ADD COLUMN     "chamuLastMeal" TEXT,
ADD COLUMN     "chamuMedication" TEXT,
ADD COLUMN     "legacyNumber" INTEGER,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT,
ALTER COLUMN "number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventReportAttachment" ADD COLUMN     "kind" "EventReportAttachmentKind" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "EventReportVehicle" ADD COLUMN     "isOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routeLegs" JSONB;

-- CreateTable
CREATE TABLE "EventReportAssessment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "bloodGlucose" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "temperature" DECIMAL(3,1),
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "spo2" INTEGER,
    "glasgow" INTEGER,
    "painScore" INTEGER,
    "bodyPosition" TEXT,

    CONSTRAINT "EventReportAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRun" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" "LiveRunState" NOT NULL DEFAULT 'INTAKE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "externalReference" TEXT,
    "chiefComplaint" TEXT,
    "locationType" "EventLocationType",
    "localityId" TEXT,
    "victimGender" "Gender",
    "victimAge" INTEGER,
    "vehicleId" TEXT,
    "scheduleId" TEXT,
    "shiftDate" DATE,
    "shiftSlot" INTEGER,
    "activationAt" TIMESTAMP(3),
    "sceneArrivalAt" TIMESTAMP(3),
    "sceneDepartureAt" TIMESTAMP(3),
    "hospitalArrivalAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "destinationKind" "VictimDestinationKind",
    "destinationHospitalId" TEXT,
    "capture" JSONB,
    "identity" BYTEA,
    "identityPurgedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reportId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRunCrewMember" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleName" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "LiveRunCrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationSettings" (
    "id" TEXT NOT NULL DEFAULT 'delegation',
    "baseName" TEXT NOT NULL,
    "baseLatitude" DOUBLE PRECISION NOT NULL,
    "baseLongitude" DOUBLE PRECISION NOT NULL,
    "coduDadosPhone" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventReportAssessment_reportId_idx" ON "EventReportAssessment"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReportAssessment_reportId_position_key" ON "EventReportAssessment"("reportId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRun_reportId_key" ON "LiveRun"("reportId");

-- CreateIndex
CREATE INDEX "LiveRun_state_idx" ON "LiveRun"("state");

-- CreateIndex
CREATE INDEX "LiveRun_closedAt_idx" ON "LiveRun"("closedAt");

-- CreateIndex
CREATE INDEX "LiveRun_createdById_idx" ON "LiveRun"("createdById");

-- CreateIndex
CREATE INDEX "LiveRun_updatedAt_idx" ON "LiveRun"("updatedAt");

-- CreateIndex
CREATE INDEX "LiveRun_localityId_idx" ON "LiveRun"("localityId");

-- CreateIndex
CREATE INDEX "LiveRunCrewMember_runId_idx" ON "LiveRunCrewMember"("runId");

-- CreateIndex
CREATE INDEX "LiveRunCrewMember_userId_idx" ON "LiveRunCrewMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRunCrewMember_runId_userId_key" ON "LiveRunCrewMember"("runId", "userId");

-- CreateIndex
CREATE INDEX "EventReport_type_year_activationAt_idx" ON "EventReport"("type", "year", "activationAt");

-- CreateIndex
CREATE INDEX "EventReport_submittedAt_idx" ON "EventReport"("submittedAt");

-- CreateIndex
CREATE INDEX "EventReport_type_year_legacyNumber_idx" ON "EventReport"("type", "year", "legacyNumber");

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReportAssessment" ADD CONSTRAINT "EventReportAssessment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRun" ADD CONSTRAINT "LiveRun_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRun" ADD CONSTRAINT "LiveRun_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRun" ADD CONSTRAINT "LiveRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRun" ADD CONSTRAINT "LiveRun_destinationHospitalId_fkey" FOREIGN KEY ("destinationHospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRun" ADD CONSTRAINT "LiveRun_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRun" ADD CONSTRAINT "LiveRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRunCrewMember" ADD CONSTRAINT "LiveRunCrewMember_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LiveRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRunCrewMember" ADD CONSTRAINT "LiveRunCrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Existing rows are all filed reports ──────────────────────────────────────
--
-- This table has never held drafts (the model's own comment said so until this
-- migration changed it), so every row that exists was filed. `submittedAt` is
-- the closest true value we have, and `legacyNumber` preserves what each report
-- was called before the resequence below.
UPDATE "EventReport"
   SET "submittedAt" = "createdAt",
       "submittedById" = "createdById",
       "legacyNumber" = "number"
 WHERE "submittedAt" IS NULL;

-- ─── The numbering rule becomes deferrable ────────────────────────────────────
--
-- Prisma writes `@@unique([type, year, number])` as a unique *index*. Shifting a
-- whole partition along by one transiently collides with itself, and an index's
-- row-by-row check would reject the UPDATE halfway through — so the index is
-- replaced by a same-named unique *constraint* that can be deferred to the end
-- of the transaction.
--
-- Postgres backs a unique constraint with a unique index of the same name, so
-- Prisma's diff engine still sees exactly what the schema declares:
-- deferrability is not something Prisma models, and schema and database agree.
DROP INDEX IF EXISTS "EventReport_type_year_number_key";

ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_type_year_number_key"
  UNIQUE ("type", "year", "number")
  DEFERRABLE INITIALLY IMMEDIATE;

-- ─── One-off resequence by activation order ───────────────────────────────────
--
-- Numbering is no longer an allocation, it is a projection of the filed reports
-- of one `(type, year)` in activation order. Doing this here rather than leaving
-- it is the point: resequencing is partition-scoped, so the next 2026 filing
-- would renumber these rows *anyway*, silently, on a Tuesday. Better once, in a
-- reviewable diff, with the old values already preserved above.
SET CONSTRAINTS ALL DEFERRED;

WITH ordered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "type", "year"
           ORDER BY COALESCE("activationAt", "startedAt"), "createdAt", "id"
         ) AS rn
    FROM "EventReport"
   WHERE "submittedAt" IS NOT NULL
)
UPDATE "EventReport" AS r
   SET "number" = ordered.rn
  FROM ordered
 WHERE r."id" = ordered."id"
   AND (r."number" IS DISTINCT FROM ordered.rn);

-- The counter row is a second truth waiting to disagree with the reports
-- themselves. Dropped only after the resequence above has replaced what it was
-- for.
DROP TABLE "EventReportCounter";

-- ─── CHECK constraints ───────────────────────────────────────────────────────

-- A report number is a position in a sequence. Null is "not filed yet".
ALTER TABLE "EventReport" DROP CONSTRAINT IF EXISTS "EventReport_number_positive";
ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_number_positive"
  CHECK ("number" IS NULL OR "number" >= 1);

ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_legacy_number_positive"
  CHECK ("legacyNumber" IS NULL OR "legacyNumber" >= 1);

-- A submitted report has a number, and a numbered report has been submitted.
-- Both directions, because either half alone is a state nothing can interpret:
-- a number with no filing is an identifier nobody assigned, and a filing with no
-- number is a report that cannot be referred to.
--
-- Half of it is a plain CHECK, because it is true at every instant: a number is
-- only ever written by the resequence, which only ever looks at filed rows, so a
-- number without a filing cannot arise even transiently.
ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_number_implies_submission"
  CHECK ("number" IS NULL OR "submittedAt" IS NOT NULL);

-- The other half cannot be a CHECK at all: Postgres does not defer CHECK
-- constraints, and filing a report is *insert as filed, then compute the
-- position* — the row is legitimately submitted-and-unnumbered for the few
-- statements in between. A deferrable constraint trigger is the only tool that
-- expresses "true when the transaction commits", which is exactly the promise
-- being made here, and it is the same reason the unique constraint above is
-- deferrable.
-- The row is re-read rather than judged from `NEW`, and that is the whole
-- subtlety of this trigger. A deferred AFTER trigger fires at commit but is
-- handed the tuple image from the moment its event was queued — so `NEW` here
-- would still say "no number", which is precisely the transient state the
-- deferral exists to tolerate. `EXISTS` against the table asks the only question
-- worth asking: is this *still* true now that the transaction is done?
--
-- The row having been deleted in the meantime is not a violation, which `EXISTS`
-- gives for free.
CREATE OR REPLACE FUNCTION "assert_filed_reports_are_numbered"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "EventReport"
     WHERE "id" = NEW."id"
       AND "submittedAt" IS NOT NULL
       AND "number" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Report % is filed but has no number', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "EventReport_filed_is_numbered"
  AFTER INSERT OR UPDATE ON "EventReport"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION "assert_filed_reports_are_numbered"();

-- Who filed it and when travel together, the same way `openedBy`/`openedAt` do.
ALTER TABLE "EventReport"
  ADD CONSTRAINT "EventReport_submitted_pair"
  CHECK (("submittedAt" IS NULL) = ("submittedById" IS NULL));

-- At most one Verbete de Socorro per report. A partial unique index, because the
-- rule applies to one value of `kind` and GENERAL attachments are many. The
-- service refuses the second one first, with a message worth reading; this is the
-- backstop that makes it true rather than merely usually true.
CREATE UNIQUE INDEX "EventReportAttachment_one_verbete_per_report"
    ON "EventReportAttachment" ("reportId")
 WHERE "kind" = 'VERBETE';

-- Every vital sign is bounded by what an instrument can produce, not by what a
-- healthy person shows: an SpO₂ of 71 has to be recordable, so these are wide.
-- The narrow "is this plausible" band is `VITALS_PLAUSIBLE` in @redinfo/shared
-- and shows as an advisory caption, never a block.
--
-- `heartRate >= 0` rather than `> 0` deliberately: asystole is a real, recordable
-- finding, not a missing value.
ALTER TABLE "EventReportAssessment"
  ADD CONSTRAINT "EventReportAssessment_ranges" CHECK (
    ("spo2"            IS NULL OR ("spo2"            BETWEEN 0  AND 100))
    AND ("respiratoryRate" IS NULL OR ("respiratoryRate" BETWEEN 0  AND 120))
    AND ("heartRate"       IS NULL OR ("heartRate"       BETWEEN 0  AND 300))
    AND ("systolic"        IS NULL OR ("systolic"        BETWEEN 0  AND 300))
    AND ("diastolic"       IS NULL OR ("diastolic"       BETWEEN 0  AND 300))
    AND ("bloodGlucose"    IS NULL OR ("bloodGlucose"    BETWEEN 0  AND 1000))
    AND ("temperature"     IS NULL OR ("temperature"     BETWEEN 20 AND 45))
    AND ("glasgow"         IS NULL OR ("glasgow"         BETWEEN 3  AND 15))
    AND ("painScore"       IS NULL OR ("painScore"       BETWEEN 0  AND 10))
  );

-- A diastolic above the systolic is a transcription error, not a reading.
ALTER TABLE "EventReportAssessment"
  ADD CONSTRAINT "EventReportAssessment_diastolic_below_systolic" CHECK (
    "systolic" IS NULL OR "diastolic" IS NULL OR "diastolic" <= "systolic"
  );

-- An assessment with nothing measured in it is not an assessment. `num_nonnulls`
-- rather than nine `IS NOT NULL`s: one expression, and adding a tenth vital is a
-- one-word change.
ALTER TABLE "EventReportAssessment"
  ADD CONSTRAINT "EventReportAssessment_not_empty" CHECK (
    num_nonnulls(
      "spo2", "respiratoryRate", "heartRate", "systolic", "diastolic",
      "bloodGlucose", "temperature", "glasgow", "painScore", "bodyPosition"
    ) >= 1
  );

ALTER TABLE "EventReportAssessment"
  ADD CONSTRAINT "EventReportAssessment_position_non_negative" CHECK ("position" >= 0);

-- The same shift rule the report carries: a (schedule, date, slot) triple or
-- nothing, because a slot with no schedule identifies no shift.
ALTER TABLE "LiveRun"
  ADD CONSTRAINT "LiveRun_shift_reference_complete" CHECK (
    ("scheduleId" IS NULL AND "shiftDate" IS NULL AND "shiftSlot" IS NULL)
    OR ("scheduleId" IS NOT NULL AND "shiftDate" IS NOT NULL AND "shiftSlot" IS NOT NULL)
  );

-- The same destination rule a victim carries: transported to a hospital, or not
-- transported at all.
ALTER TABLE "LiveRun"
  ADD CONSTRAINT "LiveRun_destination_coherent" CHECK (
    ("destinationKind" = 'HOSPITAL' AND "destinationHospitalId" IS NOT NULL)
    OR ("destinationKind" IS DISTINCT FROM 'HOSPITAL' AND "destinationHospitalId" IS NULL)
  );

ALTER TABLE "LiveRun"
  ADD CONSTRAINT "LiveRun_age_in_range"
  CHECK ("victimAge" IS NULL OR ("victimAge" BETWEEN 0 AND 130));

ALTER TABLE "LiveRun"
  ADD CONSTRAINT "LiveRun_revision_non_negative" CHECK ("revision" >= 0);

-- A closed run has a close time, and only a closed run has one. The state and
-- the timestamp are two spellings of the same fact, and the purge sweep reads
-- the timestamp — so they must not be able to disagree.
ALTER TABLE "LiveRun"
  ADD CONSTRAINT "LiveRun_closed_has_time"
  CHECK (("state" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- Purged means gone. A row cannot claim to have destroyed a blob it still holds.
ALTER TABLE "LiveRun"
  ADD CONSTRAINT "LiveRun_purged_means_empty"
  CHECK ("identityPurgedAt" IS NULL OR "identity" IS NULL);

ALTER TABLE "LiveRunCrewMember"
  ADD CONSTRAINT "LiveRunCrewMember_position_non_negative" CHECK ("position" >= 0);

-- Exactly one row of settings. The id is fixed, so an accidental second row is
-- impossible rather than merely unlikely.
ALTER TABLE "DelegationSettings"
  ADD CONSTRAINT "DelegationSettings_single_row" CHECK ("id" = 'delegation');

ALTER TABLE "DelegationSettings"
  ADD CONSTRAINT "DelegationSettings_base_coordinates" CHECK (
    "baseLatitude" BETWEEN -90 AND 90 AND "baseLongitude" BETWEEN -180 AND 180
  );

-- The delegation's own values, as supplied by the product owner. Coordinates
-- rather than the shared `maps.app.goo.gl` link, which can rot — and the Routes
-- API takes lat/lng waypoints directly, so there is no geocoding step.
INSERT INTO "DelegationSettings"
  ("id", "baseName", "baseLatitude", "baseLongitude", "coduDadosPhone", "updatedAt")
VALUES
  ('delegation', 'Cruz Vermelha Portuguesa — Delegação de Campo',
   41.5923783, -8.6117829, '+351800203264', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Glasgow Coma Scale → AVDS. The GCS is a number (`VITALS_RANGES.glasgow`,
-- CHECKed 3–15); AVDS is a four-value Portuguese enum, so it cannot stay a
-- vital sign column. Data loss on the dropped column is approved.
CREATE TYPE "AvdsLevel" AS ENUM ('A', 'V', 'D', 'S');

-- Both CHECKs below name "glasgow" and must be dropped before the column that
-- backs them can go.
ALTER TABLE "EventReportAssessment" DROP CONSTRAINT "EventReportAssessment_ranges";
ALTER TABLE "EventReportAssessment" DROP CONSTRAINT "EventReportAssessment_not_empty";

ALTER TABLE "EventReportAssessment" ADD COLUMN "avds" "AvdsLevel";
ALTER TABLE "EventReportAssessment" DROP COLUMN "glasgow";

-- Same as the original `EventReportAssessment_ranges`, minus the glasgow term
-- — AVDS is an enum with no numeric range to bound.
ALTER TABLE "EventReportAssessment"
  ADD CONSTRAINT "EventReportAssessment_ranges" CHECK (
    ("spo2"            IS NULL OR ("spo2"            BETWEEN 0  AND 100))
    AND ("respiratoryRate" IS NULL OR ("respiratoryRate" BETWEEN 0  AND 120))
    AND ("heartRate"       IS NULL OR ("heartRate"       BETWEEN 0  AND 300))
    AND ("systolic"        IS NULL OR ("systolic"        BETWEEN 0  AND 300))
    AND ("diastolic"       IS NULL OR ("diastolic"       BETWEEN 0  AND 300))
    AND ("bloodGlucose"    IS NULL OR ("bloodGlucose"    BETWEEN 0  AND 1000))
    AND ("temperature"     IS NULL OR ("temperature"     BETWEEN 20 AND 45))
    AND ("painScore"       IS NULL OR ("painScore"       BETWEEN 0  AND 10))
  );

-- Same as the original `EventReportAssessment_not_empty`, with "glasgow"
-- swapped for "avds" inside num_nonnulls.
ALTER TABLE "EventReportAssessment"
  ADD CONSTRAINT "EventReportAssessment_not_empty" CHECK (
    num_nonnulls(
      "spo2", "respiratoryRate", "heartRate", "systolic", "diastolic",
      "bloodGlucose", "temperature", "avds", "painScore", "bodyPosition"
    ) >= 1
  );

-- The "número de episódio de urgência" a Portuguese ER issues on admission —
-- written down by the crew at the hospital, and carried onto the event report
-- (and the live run it may still be in progress on).
ALTER TABLE "EventReportVictim" ADD COLUMN "hospitalEpisodeNumber" TEXT;
ALTER TABLE "LiveRun" ADD COLUMN "hospitalEpisodeNumber" TEXT;

-- Mirrors `EventReportVictim_destination_pairing`: an episode number is only
-- ever legible next to the hospital it was issued at.
ALTER TABLE "EventReportVictim"
  ADD CONSTRAINT "EventReportVictim_episode_requires_hospital"
  CHECK (
    "hospitalEpisodeNumber" IS NULL OR "destinationKind" = 'HOSPITAL'
  );

-- Stage 2 of the paid-staff rework (#246): the visible offer.
--
-- A coordinator may publish a rate on a window — e.g. "Apoio CNE, 5€/hour"
-- — *before* availability is even collected, and (once the window is
-- closed and frozen) replace it with a schedule-level override instead.
-- Hand-written because Prisma cannot express "HOURLY implies a rate and no
-- amount, FIXED the mirror, NONE/unset implies neither" as a schema-level
-- rule; the CHECK constraints below enforce it at the database itself. See
-- the doc comments on `AvailabilityWindow`/`Schedule` in schema.prisma for
-- what each column means, and `resolveCompensationOffer` in
-- @redinfo/shared for how the two rows combine (as a whole unit, never
-- field-by-field).

-- CreateEnum
CREATE TYPE "CompensationOfferKind" AS ENUM ('HOURLY', 'FIXED', 'NONE');

-- AlterTable: AvailabilityWindow
ALTER TABLE "AvailabilityWindow" ADD COLUMN "compensationKind" "CompensationOfferKind";
ALTER TABLE "AvailabilityWindow" ADD COLUMN "compensationRateCents" INTEGER;
ALTER TABLE "AvailabilityWindow" ADD COLUMN "compensationAmountCents" INTEGER;
ALTER TABLE "AvailabilityWindow" ADD COLUMN "compensationNote" TEXT;
ALTER TABLE "AvailabilityWindow" ADD COLUMN "compensationSetById" TEXT;
ALTER TABLE "AvailabilityWindow" ADD COLUMN "compensationSetAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_compensationSetById_fkey"
  FOREIGN KEY ("compensationSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written CHECK: HOURLY needs a non-negative rate and no amount, FIXED
-- the mirror, NONE (or unset) needs neither.
--
-- Every rate/amount test is spelled with an explicit IS NOT NULL ahead of
-- the comparison — `"compensationRateCents" >= 0` alone evaluates to NULL,
-- not FALSE, when the column is NULL (SQL's three-valued logic), and a CHECK
-- constraint only ever rejects a row on an outright FALSE. Without the
-- explicit null test, an HOURLY row with no rate at all would slip straight
-- through as "not proven false".
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_compensation_offer_check" CHECK (
  ("compensationKind" IS NULL AND "compensationRateCents" IS NULL AND "compensationAmountCents" IS NULL)
  OR ("compensationKind" = 'HOURLY' AND "compensationRateCents" IS NOT NULL AND "compensationRateCents" >= 0 AND "compensationAmountCents" IS NULL)
  OR ("compensationKind" = 'FIXED' AND "compensationAmountCents" IS NOT NULL AND "compensationAmountCents" >= 0 AND "compensationRateCents" IS NULL)
  OR ("compensationKind" = 'NONE' AND "compensationRateCents" IS NULL AND "compensationAmountCents" IS NULL)
);

-- AlterTable: Schedule (same shape, no note — see schema.prisma's doc comment)
ALTER TABLE "Schedule" ADD COLUMN "compensationKind" "CompensationOfferKind";
ALTER TABLE "Schedule" ADD COLUMN "compensationRateCents" INTEGER;
ALTER TABLE "Schedule" ADD COLUMN "compensationAmountCents" INTEGER;
ALTER TABLE "Schedule" ADD COLUMN "compensationSetById" TEXT;
ALTER TABLE "Schedule" ADD COLUMN "compensationSetAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_compensationSetById_fkey"
  FOREIGN KEY ("compensationSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written CHECK, mirroring AvailabilityWindow's own (see its comment
-- above for why every rate/amount test needs an explicit IS NOT NULL).
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_compensation_offer_check" CHECK (
  ("compensationKind" IS NULL AND "compensationRateCents" IS NULL AND "compensationAmountCents" IS NULL)
  OR ("compensationKind" = 'HOURLY' AND "compensationRateCents" IS NOT NULL AND "compensationRateCents" >= 0 AND "compensationAmountCents" IS NULL)
  OR ("compensationKind" = 'FIXED' AND "compensationAmountCents" IS NOT NULL AND "compensationAmountCents" >= 0 AND "compensationRateCents" IS NULL)
  OR ("compensationKind" = 'NONE' AND "compensationRateCents" IS NULL AND "compensationAmountCents" IS NULL)
);

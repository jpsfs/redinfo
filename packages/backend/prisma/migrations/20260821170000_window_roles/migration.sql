-- Windows carry the roles their schedule will be built from. Availability is
-- still collected without roles; the coordinator assigns them later.

-- CreateTable
CREATE TABLE "AvailabilityWindowRole" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxPeople" INTEGER NOT NULL,
    "requiresDriverCertification" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "AvailabilityWindowRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityWindowRole_windowId_name_key" ON "AvailabilityWindowRole"("windowId", "name");

-- CreateIndex
CREATE INDEX "AvailabilityWindowRole_windowId_idx" ON "AvailabilityWindowRole"("windowId");

-- AddForeignKey
ALTER TABLE "AvailabilityWindowRole" ADD CONSTRAINT "AvailabilityWindowRole_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "AvailabilityWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Emergency windows opened before roles existed get the default crew — one
-- driver, one team leader, one team member — which is the rule they were opened
-- under. Other categories are left with none: their roles are whatever the
-- coordinator who opened them would have chosen, and guessing would be worse
-- than an empty list the schedule screen can ask about.
INSERT INTO "AvailabilityWindowRole" ("id", "windowId", "name", "maxPeople", "requiresDriverCertification", "order")
SELECT
    gen_random_uuid()::text,
    w."id",
    role."name",
    1,
    role."name" = 'Driver',
    role."order"
FROM "AvailabilityWindow" w
CROSS JOIN (
    VALUES ('Driver', 0), ('Team Leader', 1), ('Team Member', 2)
) AS role("name", "order")
WHERE w."category" = 'EMERGENCY';

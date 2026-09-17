/**
 * One-time cleanup for the duplicate volunteer hours produced by lazy
 * SCHEDULED generation running against legacy-migrated schedules.
 *
 * Legacy migration imported historical duty rosters as real `Schedule`/
 * `ScheduleAssignment` rows (`10-schedules.loader.ts`), and every shift they
 * cover already has its hours captured by a MANUAL+APPROVED
 * `VolunteerHoursEntry` (`13-volunteer-hours.loader.ts`, both in
 * `@redinfo/legacy-migration`). Before `ensureGenerated` in
 * `volunteer-hours.service.ts` learned about
 * `VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE` (see `@redinfo/shared`),
 * it also lazily generated a SCHEDULED entry for those same migrated
 * assignments — a duplicate of the migrated MANUAL entry, which then
 * auto-approved after the grace period.
 *
 * This deletes every SCHEDULED entry dated before the cutover. MANUAL
 * entries are never touched, and neither is a SCHEDULED entry on or after
 * the cutover — that's legitimate, in-app-generated data.
 *
 * Dry-run by default; pass --confirm to actually delete.
 *
 * Usage (from packages/backend):
 *   DATABASE_URL=... pnpm exec ts-node scripts/cleanup-migrated-scheduled-hours.ts
 *   DATABASE_URL=... pnpm exec ts-node scripts/cleanup-migrated-scheduled-hours.ts --confirm
 */
import { PrismaClient, VolunteerHoursSource, VolunteerHoursStatus } from '@prisma/client';
import { VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE } from '@redinfo/shared';

const prisma = new PrismaClient();

async function main() {
  const confirm = process.argv.includes('--confirm');
  const cutover = new Date(`${VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE}T00:00:00.000Z`);

  const toDelete = await prisma.volunteerHoursEntry.findMany({
    where: { source: VolunteerHoursSource.SCHEDULED, date: { lt: cutover } },
    select: { id: true, status: true, autoApproved: true },
  });

  // Belt-and-braces: a SCHEDULED entry on or after the cutover is legitimate,
  // in-app-generated data this script must never touch. If this is non-zero
  // it changes nothing about the delete below (which is already bounded by
  // `lt: cutover`), but it's worth surfacing before deleting anything.
  const onOrAfterCutover = await prisma.volunteerHoursEntry.count({
    where: { source: VolunteerHoursSource.SCHEDULED, date: { gte: cutover } },
  });

  console.log(`Cutover date: ${VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE}`);
  console.log(`SCHEDULED entries before cutover (candidates for deletion): ${toDelete.length}`);
  console.log(
    `  of which already APPROVED: ${toDelete.filter((e) => e.status === VolunteerHoursStatus.APPROVED).length}`,
  );
  console.log(`  of which auto-approved:    ${toDelete.filter((e) => e.autoApproved).length}`);
  console.log(`SCHEDULED entries on/after cutover (left untouched either way): ${onOrAfterCutover}`);

  if (!confirm) {
    console.log('\nDry run — no rows deleted. Re-run with --confirm to delete.');
    return;
  }

  const result = await prisma.volunteerHoursEntry.deleteMany({
    where: { source: VolunteerHoursSource.SCHEDULED, date: { lt: cutover } },
  });
  console.log(
    `\nDeleted ${result.count} SCHEDULED entries dated before ${VOLUNTEER_HOURS_SCHEDULED_GENERATION_START_DATE}.`,
  );
  console.log(
    'MANUAL entries were not touched. The generation fix in ensureGenerated stops these from being recreated for pre-cutover shifts.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

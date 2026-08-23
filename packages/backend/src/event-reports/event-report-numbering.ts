import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventReportType, ReportRenumber } from '@redinfo/shared';

/**
 * Report numbers, as a projection rather than an allocation.
 *
 * A report's number is its **position among the filed reports of one
 * `(type, year)`, ordered by activation time** — gap-free by construction. So
 * it is not handed out and remembered; it is recomputed whole on every submit
 * and every delete, over a partition of a few hundred rows.
 *
 * That is what makes "delete a report and the rest close up behind it" and
 * "file a late report and it takes its rightful place" the same operation, and
 * it is why `EventReportCounter` is gone: a counter row is a second truth
 * waiting to disagree with the reports themselves.
 *
 * **This is the only file in the feature that speaks SQL**, deliberately — the
 * whole backend otherwise contains one raw statement (`SELECT 1`, in
 * `prisma.health.ts`), and keeping the raw-query surface to one reviewable file
 * is worth more than spreading it thin.
 *
 * Two things make it safe:
 *
 * 1. **`pg_advisory_xact_lock` on the partition.** Two coordinators filing in
 *    the same second cannot both compute position 42. This is the guarantee the
 *    old counter row's `ON CONFLICT DO UPDATE` gave, relocated.
 * 2. **The unique constraint is DEFERRABLE.** Shifting a partition along by one
 *    transiently collides with itself, so the check has to happen at commit
 *    rather than per row. `SET CONSTRAINTS ALL DEFERRED` is issued inside the
 *    transaction; the migration is what makes that possible.
 */

/**
 * The ordering, in one place.
 *
 * Its testable twin is `orderForNumbering` in `@redinfo/shared`, which the unit
 * test compares against. `id` is the final tiebreaker so the ordering is
 * *total*: two reports activated in the same second and created in the same
 * millisecond must still have a defined position, or the same partition
 * renumbers differently on two runs.
 */
const NUMBERING_ORDER = Prisma.sql`COALESCE("activationAt", "startedAt"), "createdAt", "id"`;

/** Only filed reports are numbered. A draft has no position in the sequence. */
const FILED = Prisma.sql`"submittedAt" IS NOT NULL`;

@Injectable()
export class EventReportNumbering {
  /**
   * Serialises everyone touching this partition for the rest of the
   * transaction.
   *
   * Transaction-scoped rather than session-scoped: it is released by commit or
   * rollback with nothing to remember to unlock, which is the only version of
   * this that cannot leak a lock on an error path.
   */
  async lockPartition(
    tx: Prisma.TransactionClient,
    type: EventReportType,
    year: number,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('event-report-number:' || ${type}::text || ':' || ${year}::text)::bigint
      )
    `;
    // The resequence below shifts a whole partition along, which transiently
    // collides with itself. Deferring to commit is what lets a single UPDATE do
    // the work instead of a two-pass shuffle.
    await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
  }

  /**
   * How many *already-filed* reports would have their printed number moved by
   * recomputing this partition.
   *
   * Filing a report whose activation predates reports already on file rewrites
   * their identities — "EMG 128/2026" becomes "EMG 127/2026" — and paper
   * already in a binder does not renumber itself. So this count is what the
   * submit path refuses on for a caller without `MANAGE_EVENT_REPORTS`: the
   * decision reaches a coordinator's judgement rather than happening by an
   * operational's thumb.
   *
   * A report that has just been marked submitted has `number IS NULL` and is
   * therefore not counted — it is the cause of the displacement, not a victim of
   * it.
   */
  async countDisplaced(
    tx: Prisma.TransactionClient,
    type: EventReportType,
    year: number,
  ): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ displaced: bigint }>>`
      WITH ordered AS (
        SELECT "id",
               ROW_NUMBER() OVER (ORDER BY ${NUMBERING_ORDER}) AS rn
          FROM "EventReport"
         WHERE "type" = ${type}::"EventReportType" AND "year" = ${year} AND ${FILED}
      )
      SELECT COUNT(*)::bigint AS displaced
        FROM ordered o
        JOIN "EventReport" r ON r."id" = o."id"
       WHERE r."number" IS NOT NULL AND r."number" IS DISTINCT FROM o.rn
    `;
    return Number(rows[0]?.displaced ?? 0);
  }

  /**
   * Recomputes the partition, and says what moved.
   *
   * `legacyNumber` is written with `COALESCE(legacyNumber, number)`, so it keeps
   * the number a report was **first** given rather than the one it had a moment
   * ago. That is the value that got printed and filed in a binder, and it is the
   * one someone holding the paper will search for.
   *
   * One statement rather than a read-then-write: `changed` is evaluated against
   * the pre-update snapshot, which is what makes the old number available to
   * return alongside the new one.
   */
  async resequence(
    tx: Prisma.TransactionClient,
    type: EventReportType,
    year: number,
  ): Promise<ReportRenumber[]> {
    const rows = await tx.$queryRaw<
      Array<{ reportId: string; from: number | null; to: number }>
    >`
      WITH ordered AS (
        SELECT "id",
               ROW_NUMBER() OVER (ORDER BY ${NUMBERING_ORDER}) AS rn
          FROM "EventReport"
         WHERE "type" = ${type}::"EventReportType" AND "year" = ${year} AND ${FILED}
      ),
      changed AS (
        SELECT o."id", o.rn, r."number" AS previous
          FROM ordered o
          JOIN "EventReport" r ON r."id" = o."id"
         WHERE r."number" IS DISTINCT FROM o.rn
      ),
      updated AS (
        UPDATE "EventReport" AS r
           SET "number" = c.rn,
               "legacyNumber" = COALESCE(r."legacyNumber", r."number")
          FROM changed c
         WHERE r."id" = c."id"
        RETURNING r."id"
      )
      -- The updated CTE is data-modifying, so Postgres runs it exactly once and
      -- to completion whether or not the outer query reads it. Selecting from
      -- changed instead is what gives us both the old and the new number.
      SELECT c."id" AS "reportId",
             c.previous::int AS "from",
             c.rn::int AS "to"
        FROM changed c
       ORDER BY c.rn
    `;

    return rows.map((row) => ({
      reportId: row.reportId,
      from: row.from === null ? null : Number(row.from),
      to: Number(row.to),
    }));
  }
}

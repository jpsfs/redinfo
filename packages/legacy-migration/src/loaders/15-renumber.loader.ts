/**
 * Renumbers every `(EMERGENCY, year)` partition the run touched, once each,
 * via the existing `EventReportNumbering` — the one sanctioned raw-SQL file
 * in the backend (see its own doc comment) and the *only* place this whole
 * tree writes with anything but the Prisma client.
 *
 * A thin wrapper rather than a no-op today because it has nothing to act on
 * until the event-report loader (Track B, blocked on Q1/Q2/Q5/Q7) exists:
 * `EventReportNumbering` itself needs no legacy-specific logic, so there is
 * no reason to gate *this* file behind those questions too. `main.ts` calls
 * it with whichever years the run actually wrote reports for — an empty set
 * when the event-report loader has not run, which is exactly correct: there
 * is nothing to renumber.
 */
// `EventReportNumbering`'s own signature is typed against `@redinfo/shared`'s
// `EventReportType`, not `@prisma/client`'s — matched here rather than cast.
import { EventReportType } from '@redinfo/shared';
import { EventReportNumbering } from '../../../backend/src/event-reports/event-report-numbering';
import { RunContext, runInLoaderTransaction } from '../run-context';

export async function loadRenumbering(ctx: RunContext, emergencyYearsTouched: Iterable<number>): Promise<void> {
  const numbering = new EventReportNumbering();

  for (const year of new Set(emergencyYearsTouched)) {
    await runInLoaderTransaction(ctx, async (tx) => {
      await numbering.lockPartition(tx, EventReportType.EMERGENCY, year);
      await numbering.resequence(tx, EventReportType.EMERGENCY, year);
    });
  }
}

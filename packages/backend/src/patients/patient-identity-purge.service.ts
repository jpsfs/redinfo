import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;

/** Overrides `DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS` (shared) without a deploy. */
export const PATIENT_IDENTITY_RETENTION_DAYS_ENV = 'PATIENT_IDENTITY_RETENTION_DAYS';

/** How often the sweep runs. A patient's window is measured in months, so an
 * hourly cadence is already generous — nothing here needs live-run-style urgency. */
export const PATIENT_PURGE_INTERVAL_MS = 60 * 60 * 1000;

export function parsePatientIdentityRetentionDays(raw: string | undefined): number {
  if (!raw) return DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${PATIENT_IDENTITY_RETENTION_DAYS_ENV} must be a positive number of days, got "${raw}".`,
    );
  }
  return parsed;
}

export interface PatientSweepResult {
  purged: number;
}

/**
 * Destroys a patient's sealed identity once the record has sat untouched past
 * the retention window.
 *
 * Keyed off `updatedAt` rather than a dedicated "last active" fact, because
 * #226 has neither a trip nor a treatment plan yet to observe — the only
 * activity this model can see is someone editing the record itself. A later
 * story (once trips/treatment plans exist) should extend the cutoff to
 * whichever is more recent, rather than leave it here as though it were the
 * considered answer; see `DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS`'s doc
 * comment (shared) for the same caveat on the default itself.
 *
 * No inline purge-on-read, unlike `IdentityPurgeService` (live-runs): a
 * live run's 48h retention makes "never serve a stale read" cheap to
 * guarantee per-request; a patient is read constantly for as long as they
 * remain a patient, and the retention window is measured in months, so a
 * periodic sweep is the whole of the guarantee here.
 */
@Injectable()
export class PatientIdentityPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PatientIdentityPurgeService.name);
  private readonly retentionDays = parsePatientIdentityRetentionDays(
    process.env[PATIENT_IDENTITY_RETENTION_DAYS_ENV],
  );
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Tests drive `sweep()` directly — see `IdentityPurgeService`'s identical note.
    if (process.env.NODE_ENV === 'test') return;

    this.timer = setInterval(() => {
      void this.sweep().catch((cause) => {
        this.logger.error(`Patient identity sweep failed: ${(cause as Error).message}`);
      });
    }, PATIENT_PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now: Date = new Date()): Promise<PatientSweepResult> {
    const cutoff = new Date(now.getTime() - this.retentionDays * DAY_MS);
    const result = await this.prisma.patient.updateMany({
      where: { identity: { not: null }, updatedAt: { lt: cutoff } },
      data: { identity: null, identityPurgedAt: now },
    });
    return { purged: result.count };
  }
}

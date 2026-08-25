import {
  CertificationType,
  HeldCertification,
  SchedulePerson,
  holdsCertification,
  isActiveEmergencyOperational as sharedIsActiveEmergencyOperational,
} from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';

/**
 * The minimum a Prisma `UserCertification` row needs for the shared
 * certification logic — a `select: CERT_HELD_SELECT` shape.
 *
 * `type` is the template-literal form, not the nominal shared enum: Prisma
 * generates its own `$Enums.CertificationType` for query results, and the
 * template-literal form is what accepts both it and the shared TS enum
 * without a cast at every call site (the same trick `WindowRow.category`
 * uses in `availability-windows.service.ts`).
 */
export interface HeldCertificationRow {
  type: `${CertificationType}`;
  validUntil: Date | null;
}

/** The Prisma `select` that produces `HeldCertificationRow` rows. */
export const CERT_HELD_SELECT = { type: true, validUntil: true } as const;

/** Today, as the ISO date the shared certification functions expect. */
export function today(): string {
  return toIsoDate(new Date());
}

/** Prisma rows → the shared `HeldCertification` shape (dates as ISO strings). */
export function toHeldCertifications(rows: HeldCertificationRow[]): HeldCertification[] {
  return rows.map((row) => ({
    type: row.type as CertificationType,
    validUntil: row.validUntil ? toIsoDate(row.validUntil) : null,
  }));
}

/** Whether these certifications include a currently-valid DRIVER. */
export function computeIsDriver(rows: HeldCertificationRow[], asOf: string = today()): boolean {
  return holdsCertification(toHeldCertifications(rows), CertificationType.DRIVER, asOf);
}

/** Whether these certifications make someone an active emergency operational. */
export function computeIsActiveEmergencyOperational(
  rows: HeldCertificationRow[],
  asOf: string = today(),
): boolean {
  return sharedIsActiveEmergencyOperational(toHeldCertifications(rows), asOf);
}

/** A Prisma row carrying id/firstName/lastName plus held certifications. */
export interface PersonCertRow {
  id: string;
  firstName: string;
  lastName: string;
  certifications: HeldCertificationRow[];
}

/** Prisma row → the shared `SchedulePerson` shape, `isDriver` computed. */
export function toSchedulePerson(row: PersonCertRow, asOf: string = today()): SchedulePerson {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    isDriver: computeIsDriver(row.certifications, asOf),
    certifications: toHeldCertifications(row.certifications),
  };
}

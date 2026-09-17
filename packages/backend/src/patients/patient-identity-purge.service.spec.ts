import { DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  PatientIdentityPurgeService,
  parsePatientIdentityRetentionDays,
} from './patient-identity-purge.service';

describe('parsePatientIdentityRetentionDays', () => {
  it('falls back to the conservative default when unset', () => {
    expect(parsePatientIdentityRetentionDays(undefined)).toBe(
      DEFAULT_PATIENT_IDENTITY_RETENTION_DAYS,
    );
  });

  it('accepts a configured override', () => {
    expect(parsePatientIdentityRetentionDays('30')).toBe(30);
  });

  it('rejects a non-positive or non-numeric value — a config mistake should stop the process, not silently purge on every sweep', () => {
    expect(() => parsePatientIdentityRetentionDays('0')).toThrow();
    expect(() => parsePatientIdentityRetentionDays('-5')).toThrow();
    expect(() => parsePatientIdentityRetentionDays('soon')).toThrow();
  });
});

describe('PatientIdentityPurgeService.sweep', () => {
  afterEach(() => {
    delete process.env.PATIENT_IDENTITY_RETENTION_DAYS;
  });

  it('purges only rows with a sealed blob untouched past the retention window', async () => {
    process.env.PATIENT_IDENTITY_RETENTION_DAYS = '30';
    const updateMany = jest.fn((_args: Record<string, unknown>) => Promise.resolve({ count: 2 }));
    const prisma = { patient: { updateMany } } as unknown as PrismaService;
    const service = new PatientIdentityPurgeService(prisma);

    const now = new Date('2026-06-01T00:00:00.000Z');
    const result = await service.sweep(now);

    expect(result).toEqual({ purged: 2 });
    const call = updateMany.mock.calls[0][0] as {
      where: { identity: unknown; updatedAt: { lt: Date } };
      data: unknown;
    };
    expect(call.where.identity).toEqual({ not: null });
    expect(call.where.updatedAt.lt).toEqual(new Date('2026-05-02T00:00:00.000Z'));
    expect(call.data).toEqual({ identity: null, identityPurgedAt: now });
  });
});

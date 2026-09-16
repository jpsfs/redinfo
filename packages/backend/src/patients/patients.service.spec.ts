import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientIdentity, PatientMobility, UserRole } from '@redinfo/shared';
import { IdentityCipher, generateIdentityKey } from '../common/identity-cipher';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';

// ── Sealed identity, mobility profile, default address, reference contact ──────
//
// `MANAGE_PATIENTS` reaches every method here; `VIEW_PATIENT_IDENTITY` gates a
// column, not a route, so every method re-checks it and either omits `identity`
// entirely (never `null` — that already means something else) or refuses to
// write it, following the `canSeeCompensation`/`LIVE_RUN_BOARD_SELECT`
// precedents on `schedules`/`live-runs`.

const KEY_A = generateIdentityKey();

const COORDINATOR = { id: 'user-coordinator', roles: [UserRole.TRANSPORT_COORDINATOR] };
// A hand-built role, standing in for a future one that holds `MANAGE_PATIENTS`
// without `VIEW_PATIENT_IDENTITY` — today's single role holds both together,
// per `ROLE_PERMISSIONS`, so the independence guarantee needs a synthetic
// caller to exercise at all.
const MANAGER_ONLY = { id: 'user-manager', roles: [] as UserRole[] };

const identity: PatientIdentity = {
  fullName: 'Maria Fernanda Costa',
  telephone: '+351912345678',
  homeAddressLine: 'Rua do Castelo, 12',
  homePostalCode: '3000-123',
  homeLocality: 'Coimbra',
  referenceContactName: 'Ana Costa',
  referenceContactRelationship: 'Filha',
  referenceContactTelephone: '+351913456789',
};

const patientRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pat-1',
  identity: null,
  identityPurgedAt: null,
  mobility: 'AMBULATORY',
  needsOxygen: false,
  escortRequired: false,
  isBariatric: false,
  defaultLatitude: null,
  defaultLongitude: null,
  localityId: null,
  locality: null,
  referenceContactIsOrganisation: false,
  contactAuthorisationRecorded: false,
  contactAuthorisationNote: null,
  isActive: true,
  createdById: 'user-coordinator',
  createdBy: { id: 'user-coordinator', firstName: 'Ana', lastName: 'Reis' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

function makeService(
  prismaOverrides: { patient?: Record<string, unknown>; locality?: Record<string, unknown> } = {},
  cipher = new IdentityCipher(`k1:${KEY_A}`),
) {
  // Merged one level deep, not spread wholesale: a test overriding just
  // `findUnique` must not silently lose `update`/`delete`/`count` underneath
  // it — `service.update` calls both in the same test.
  const patient = {
    findMany: jest.fn(() => Promise.resolve([])),
    findUnique: jest.fn(() => Promise.resolve(patientRow())),
    create: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(patientRow({ ...args.data, id: 'pat-1' })),
    ),
    update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(patientRow(args.data))),
    delete: jest.fn(() => Promise.resolve(patientRow())),
    count: jest.fn(() => Promise.resolve(1)),
    ...prismaOverrides.patient,
  };
  const locality = { count: jest.fn(() => Promise.resolve(1)), ...prismaOverrides.locality };

  const prisma = {
    patient,
    locality,
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  return { service: new PatientsService(prisma, cipher), prisma };
}

describe('identity, gated separately from the record itself', () => {
  it('omits `identity` and `identityUnavailable` entirely for a caller without VIEW_PATIENT_IDENTITY, even when a blob exists', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealed = cipher.seal('patient', 'pat-1', identity);
    const { service } = makeService(
      { patient: { findUnique: jest.fn(() => Promise.resolve(patientRow({ identity: sealed }))) } },
      cipher,
    );

    const found = await service.findOne('pat-1', MANAGER_ONLY);

    expect(Object.prototype.hasOwnProperty.call(found, 'identity')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(found, 'identityUnavailable')).toBe(false);
    expect(found.mobility).toBe(PatientMobility.AMBULATORY);
  });

  it('opens the blob for a caller with VIEW_PATIENT_IDENTITY', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealed = cipher.seal('patient', 'pat-1', identity);
    const { service } = makeService(
      { patient: { findUnique: jest.fn(() => Promise.resolve(patientRow({ identity: sealed }))) } },
      cipher,
    );

    const found = await service.findOne('pat-1', COORDINATOR);

    expect(found.identity).toEqual(identity);
  });

  it('reports identityUnavailable, not an error, when no configured key opens the blob', async () => {
    const sealingCipher = new IdentityCipher(`k-old:${KEY_A}`);
    const sealed = sealingCipher.seal('patient', 'pat-1', identity);
    const readingCipher = new IdentityCipher(`k-new:${generateIdentityKey()}`);
    const { service } = makeService(
      { patient: { findUnique: jest.fn(() => Promise.resolve(patientRow({ identity: sealed }))) } },
      readingCipher,
    );

    const found = await service.findOne('pat-1', COORDINATOR);

    expect(found.identityUnavailable).toBe(true);
    // Present as `null`, not omitted: the key is what's missing, not the fact
    // that a caller may see identity at all — same as `LiveRun`'s own
    // `identity: opened.identity ?? null` alongside its `identityUnavailable`.
    expect(found.identity).toBeNull();
  });

  it('never had identity and was purged are distinct facts', async () => {
    const { service, prisma } = makeService({
      patient: {
        findUnique: jest.fn(() =>
          Promise.resolve(patientRow({ identity: null, identityPurgedAt: new Date('2026-02-01T00:00:00.000Z') })),
        ),
      },
    });

    const found = await service.findOne('pat-1', COORDINATOR);

    expect(found.identity).toBeNull();
    expect(found.identityPurgedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(prisma.patient.findUnique).toHaveBeenCalled();
  });

  it('lists never select the ciphertext column for a caller without VIEW_PATIENT_IDENTITY', async () => {
    const { service, prisma } = makeService();

    await service.findManaged(MANAGER_ONLY);

    const call = (prisma.patient.findMany as jest.Mock).mock.calls[0][0];
    expect(call.select.identity).toBeUndefined();
  });

  it('lists select the ciphertext column for a caller with VIEW_PATIENT_IDENTITY', async () => {
    const { service, prisma } = makeService();

    await service.findManaged(COORDINATOR);

    const call = (prisma.patient.findMany as jest.Mock).mock.calls[0][0];
    expect(call.select.identity).toBe(true);
  });
});

describe('writing identity', () => {
  it('refuses to create a patient with identity from a caller without VIEW_PATIENT_IDENTITY', async () => {
    const { service } = makeService();

    await expect(
      service.create({ mobility: PatientMobility.AMBULATORY, identity }, MANAGER_ONLY),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets MANAGE_PATIENTS alone create a patient with no identity at all', async () => {
    const { service } = makeService();

    const created = await service.create({ mobility: PatientMobility.WHEELCHAIR }, MANAGER_ONLY);

    expect(created.mobility).toBe(PatientMobility.WHEELCHAIR);
    expect(Object.prototype.hasOwnProperty.call(created, 'identity')).toBe(false);
  });

  it('seals identity with the row id as AAD on create, for a caller who may write it', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealSpy = jest.spyOn(cipher, 'seal');
    const { service } = makeService({}, cipher);

    const created = await service.create({ mobility: PatientMobility.AMBULATORY, identity }, COORDINATOR);

    expect(sealSpy).toHaveBeenCalledWith('patient', 'pat-1', identity);
    expect(created.identity).toEqual(identity);
  });

  it('refuses to touch identity on update from a caller without VIEW_PATIENT_IDENTITY', async () => {
    const { service } = makeService();

    await expect(
      service.update('pat-1', { identity: null }, MANAGER_ONLY),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an explicit null on update clears the blob and stamps identityPurgedAt — a deliberate erasure', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealed = cipher.seal('patient', 'pat-1', identity);
    const { service, prisma } = makeService(
      { patient: { findUnique: jest.fn(() => Promise.resolve(patientRow({ identity: sealed }))) } },
      cipher,
    );

    await service.update('pat-1', { identity: null }, COORDINATOR);

    const call = (prisma.patient.update as jest.Mock).mock.calls[0][0];
    expect(call.data.identity).toBeNull();
    expect(call.data.identityPurgedAt).toBeInstanceOf(Date);
  });

  it('leaves the existing blob untouched when identity is omitted from the update', async () => {
    const { service, prisma } = makeService();

    await service.update('pat-1', { mobility: PatientMobility.STRETCHER }, COORDINATOR);

    const call = (prisma.patient.update as jest.Mock).mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(call.data, 'identity')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(call.data, 'identityPurgedAt')).toBe(false);
  });
});

describe('the unsealed profile — what planning reads without opening the blob', () => {
  it('rejects a coordinate given without its pair', async () => {
    const { service } = makeService();

    await expect(
      service.create(
        { mobility: PatientMobility.AMBULATORY, defaultLatitude: 40.2 },
        MANAGER_ONLY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown localityId', async () => {
    const { service } = makeService({ locality: { count: jest.fn(() => Promise.resolve(0)) } });

    await expect(
      service.create({ mobility: PatientMobility.AMBULATORY, localityId: 'nope' }, MANAGER_ONLY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s a patient that does not exist', async () => {
    const { service } = makeService({
      patient: { findUnique: jest.fn(() => Promise.resolve(null)) },
    });

    await expect(service.findOne('missing', MANAGER_ONLY)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('remove', () => {
  it('404s when the patient is already gone', async () => {
    const { service } = makeService({ patient: { count: jest.fn(() => Promise.resolve(0)) } });

    await expect(service.remove('missing', MANAGER_ONLY)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── Batched name+mobility lookup (#235) ─────────────────────────────────────

describe('findManyForDisplay', () => {
  it('returns mobility only, no fullName, for a caller without VIEW_PATIENT_IDENTITY', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealed = cipher.seal('patient', 'pat-1', identity);
    const { service } = makeService(
      {
        patient: {
          findMany: jest.fn(() =>
            Promise.resolve([patientRow({ id: 'pat-1', identity: sealed, mobility: 'WHEELCHAIR' })]),
          ),
        },
      },
      cipher,
    );

    const result = await service.findManyForDisplay(['pat-1'], MANAGER_ONLY);

    expect(result.get('pat-1')).toEqual({ mobility: PatientMobility.WHEELCHAIR, fullName: null });
  });

  it('includes fullName for a caller with VIEW_PATIENT_IDENTITY', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealed = cipher.seal('patient', 'pat-1', identity);
    const { service } = makeService(
      { patient: { findMany: jest.fn(() => Promise.resolve([patientRow({ id: 'pat-1', identity: sealed })])) } },
      cipher,
    );

    const result = await service.findManyForDisplay(['pat-1'], COORDINATOR);

    expect(result.get('pat-1')).toEqual({ mobility: PatientMobility.AMBULATORY, fullName: identity.fullName });
  });

  it('short-circuits to an empty map without touching the database', async () => {
    const findMany = jest.fn();
    const { service } = makeService({ patient: { findMany } });

    const result = await service.findManyForDisplay([], COORDINATOR);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

// ── Batched name+mobility lookup for a crew member's own manifest (#236) ────

describe('findManyForCrewManifest', () => {
  it('includes fullName with no VIEW_PATIENT_IDENTITY check at all — see the method doc comment for why', async () => {
    const cipher = new IdentityCipher(`k1:${KEY_A}`);
    const sealed = cipher.seal('patient', 'pat-1', identity);
    const { service } = makeService(
      { patient: { findMany: jest.fn(() => Promise.resolve([patientRow({ id: 'pat-1', identity: sealed })])) } },
      cipher,
    );

    // No `user`/capability argument at all — this method takes only ids.
    const result = await service.findManyForCrewManifest(['pat-1']);

    expect(result.get('pat-1')).toEqual({ mobility: PatientMobility.AMBULATORY, fullName: identity.fullName });
  });

  it('short-circuits to an empty map without touching the database', async () => {
    const findMany = jest.fn();
    const { service } = makeService({ patient: { findMany } });

    const result = await service.findManyForCrewManifest([]);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgreementsService } from './agreements.service';
import { PrismaService } from '../prisma/prisma.service';

// ── The terms a transport falls under, scoped to its paying organisation (#227) ──
//
// An agreement can only belong to an organisation flagged `isPayer` — the
// same role-flag distinction `Organisation` enforces on itself. No tariff or
// rate fields: billing is modelled here, never performed.

const PAYER = {
  id: 'org-payer',
  name: 'Allianz',
  taxId: null,
  contactEmail: null,
  contactPhone: null,
  isRequester: false,
  isPayer: true,
  notes: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const agreement = (
  overrides: Partial<{
    id: string;
    payerOrganisationId: string;
    name: string;
    externalReference: string | null;
    validFrom: Date;
    validTo: Date | null;
    notes: string | null;
    isActive: boolean;
    payerOrganisation: typeof PAYER;
  }> = {},
) => ({
  id: 'agr-1',
  payerOrganisationId: PAYER.id,
  name: 'SNS — Serviço Nacional de Saúde',
  externalReference: null,
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  validTo: null,
  notes: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  payerOrganisation: PAYER,
  ...overrides,
});

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    agreement: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(agreement())),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(agreement(args.data as never)),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(agreement(args.data as never)),
      ),
      delete: jest.fn(() => Promise.resolve(agreement())),
      count: jest.fn(() => Promise.resolve(0)),
    },
    organisation: { findUnique: jest.fn(() => Promise.resolve(PAYER)) },
    $transaction: jest.fn((arg: unknown) => Promise.all(arg as Promise<unknown>[])),
    ...prismaOverrides,
  } as unknown as PrismaService;

  return { service: new AgreementsService(prisma), prisma };
}

describe('creating an agreement', () => {
  it('trims the name and stores the payer', async () => {
    const { service, prisma } = makeService();

    await service.create({
      payerOrganisationId: PAYER.id,
      name: '  SNS — Serviço Nacional de Saúde  ',
      validFrom: '2026-01-01',
    });

    expect(prisma.agreement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'SNS — Serviço Nacional de Saúde',
          payerOrganisationId: PAYER.id,
        }),
      }),
    );
  });

  it('refuses an organisation not flagged as a payer', async () => {
    const { service } = makeService({
      organisation: { findUnique: jest.fn(() => Promise.resolve({ ...PAYER, isPayer: false })) },
    });

    await expect(
      service.create({ payerOrganisationId: PAYER.id, name: 'x', validFrom: '2026-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an organisation that does not exist', async () => {
    const { service } = makeService({ organisation: { findUnique: jest.fn(() => Promise.resolve(null)) } });

    await expect(
      service.create({ payerOrganisationId: 'org-gone', name: 'x', validFrom: '2026-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an end date before the start date', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        payerOrganisationId: PAYER.id,
        name: 'x',
        validFrom: '2026-06-01',
        validTo: '2026-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('updating an agreement', () => {
  it('validates the record as it will be, not the patch alone', async () => {
    const { service } = makeService();

    await expect(service.update('agr-1', { validTo: '2025-01-01' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('re-checks the payer flag only when the payer actually changes', async () => {
    const findUnique = jest.fn(() => Promise.resolve(PAYER));
    const { service, prisma } = makeService({ organisation: { findUnique } });

    await service.update('agr-1', { name: 'Renamed' });

    expect(findUnique).not.toHaveBeenCalled();
    expect(prisma.agreement.update).toHaveBeenCalled();
  });

  it('is 404 for an agreement that is not there', async () => {
    const { service } = makeService({
      agreement: { ...(makeService().prisma.agreement as object), findUnique: jest.fn(() => Promise.resolve(null)) },
    });

    await expect(service.update('agr-gone', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('removing an agreement', () => {
  it('deletes it outright — nothing references an agreement yet', async () => {
    const { service, prisma } = makeService();

    await service.remove('agr-1');

    expect(prisma.agreement.delete).toHaveBeenCalled();
  });
});

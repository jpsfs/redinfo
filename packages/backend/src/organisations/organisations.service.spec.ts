import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrganisationsService } from './organisations.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Requester and payer as roles on one model (#227) ────────────────────────
//
// One row can carry both flags at once — AXA Assistance can both refer and
// pay for its own trips — and a role-less row is refused for the same
// default-deny reason `Facility` refuses one flagged as neither destination:
// a row nothing can name is unreachable the moment it is saved. Reference
// codes are a child collection replaced as a whole set on save, same
// contract as `MaterialItemsService`'s barcodes.

const organisation = (
  overrides: Partial<{
    id: string;
    name: string;
    taxId: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    isRequester: boolean;
    isPayer: boolean;
    notes: string | null;
    isActive: boolean;
    references: { id: string; organisationId: string; code: string; description: string | null }[];
  }> = {},
) => ({
  id: 'org-1',
  name: 'AXA Assistance',
  taxId: null,
  contactEmail: null,
  contactPhone: null,
  isRequester: true,
  isPayer: false,
  notes: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  references: [],
  ...overrides,
});

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    organisation: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(organisation())),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(organisation(args.data as never)),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(organisation(args.data as never)),
      ),
      delete: jest.fn(() => Promise.resolve(organisation())),
      count: jest.fn(() => Promise.resolve(0)),
    },
    organisationReference: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    agreement: { count: jest.fn(() => Promise.resolve(0)) },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    }),
    ...prismaOverrides,
  } as unknown as PrismaService;

  return { service: new OrganisationsService(prisma), prisma };
}

describe('creating an organisation', () => {
  it('trims the name and defaults to active', async () => {
    const { service, prisma } = makeService();

    await service.create({ name: '  AXA Assistance  ', isRequester: true });

    expect(prisma.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'AXA Assistance', isActive: true }),
      }),
    );
  });

  it('refuses an organisation flagged as neither requester nor payer', async () => {
    const { service } = makeService();

    await expect(service.create({ name: 'Nobody' })).rejects.toThrow(BadRequestException);
  });

  it('accepts an organisation flagged as both requester and payer', async () => {
    const { service, prisma } = makeService();

    await service.create({ name: 'AXA Assistance', isRequester: true, isPayer: true });

    expect(prisma.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRequester: true, isPayer: true }),
      }),
    );
  });

  it('saves several reference codes as a set', async () => {
    const { service, prisma } = makeService();

    await service.create({
      name: 'AXA Assistance',
      isRequester: true,
      references: [
        { code: 'AZP', description: 'Envelope-level account code' },
        { code: 'ALLIANZ-01' },
      ],
    });

    expect(prisma.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          references: {
            create: [
              { code: 'AZP', description: 'Envelope-level account code' },
              { code: 'ALLIANZ-01', description: null },
            ],
          },
        }),
      }),
    );
  });

  it('refuses the same reference code listed twice', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        name: 'AXA Assistance',
        isRequester: true,
        references: [{ code: 'AZP' }, { code: 'AZP' }],
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('updating an organisation', () => {
  it('validates the record as it will be, not the patch alone', async () => {
    // The stored organisation is a requester only; clearing that flag alone
    // would leave the row flagged as neither, so it is refused.
    const { service } = makeService();

    await expect(service.update('org-1', { isRequester: false })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a patch that keeps at least one role flag set', async () => {
    const { service, prisma } = makeService();

    await expect(service.update('org-1', { isPayer: true })).resolves.toBeDefined();
    expect(prisma.organisation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isRequester: true, isPayer: true }) }),
    );
  });

  it('replaces the whole reference set when given one', async () => {
    const { service, prisma } = makeService();

    await service.update('org-1', { references: [{ code: 'NEW-CODE' }] });

    expect(prisma.organisationReference.deleteMany).toHaveBeenCalledWith({
      where: { organisationId: 'org-1' },
    });
    expect(prisma.organisation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ references: { create: [{ code: 'NEW-CODE', description: null }] } }),
      }),
    );
  });

  it('leaves references untouched when the field is omitted', async () => {
    const { service, prisma } = makeService();

    await service.update('org-1', { name: 'AXA Assistance Portugal' });

    expect(prisma.organisationReference.deleteMany).not.toHaveBeenCalled();
  });

  it('is 404 for an organisation that is not there', async () => {
    const { service } = makeService({
      organisation: { ...(makeService().prisma.organisation as object), findUnique: jest.fn(() => Promise.resolve(null)) },
    });

    await expect(service.update('org-gone', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('removing an organisation', () => {
  it('deletes one no agreement has ever named as payer', async () => {
    const { service, prisma } = makeService();

    await service.remove('org-1');

    expect(prisma.organisation.delete).toHaveBeenCalled();
    expect(prisma.organisation.update).not.toHaveBeenCalled();
  });

  it('retires one an agreement names as payer, so the agreement keeps naming it', async () => {
    const { service, prisma } = makeService({ agreement: { count: jest.fn(() => Promise.resolve(2)) } });

    const result = await service.remove('org-1');

    expect(prisma.organisation.delete).not.toHaveBeenCalled();
    expect(prisma.organisation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(result.isActive).toBe(false);
  });
});

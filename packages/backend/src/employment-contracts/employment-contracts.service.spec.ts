import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmploymentContractKind } from '@redinfo/shared';
import { EmploymentContractsService } from './employment-contracts.service';

const USER_ID = 'u-tiago';
const CREATED_BY = 'u-coordinator';

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    employmentContract: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({
          id: 'ec1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          ...args.data,
        }),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({
          id: args.where.id,
          userId: USER_ID,
          kind: 'FULL_TIME',
          startDate: new Date('2026-03-01'),
          createdById: CREATED_BY,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
          ...args.data,
        }),
      ),
      delete: jest.fn().mockResolvedValue({ id: 'ec1' }),
    },
    ...overrides,
  };
}

const dto = (overrides: Partial<{ kind: EmploymentContractKind; startDate: string; endDate?: string }> = {}) => ({
  kind: EmploymentContractKind.FULL_TIME,
  startDate: '2026-03-01',
  ...overrides,
});

describe('EmploymentContractsService', () => {
  let service: EmploymentContractsService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new EmploymentContractsService(prisma as never);
  });

  describe('create', () => {
    it('rejects an endDate before startDate', async () => {
      await expect(
        service.create(USER_ID, dto({ startDate: '2026-06-01', endDate: '2026-01-01' }), CREATED_BY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employmentContract.create).not.toHaveBeenCalled();
    });

    it('rejects a contract overlapping an existing one for the same person', async () => {
      prisma.employmentContract.findMany.mockResolvedValue([
        { id: 'existing', userId: USER_ID, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
      ]);
      await expect(service.create(USER_ID, dto({ startDate: '2026-06-01' }), CREATED_BY)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.employmentContract.create).not.toHaveBeenCalled();
    });

    it('allows a contract that starts exactly after a previous one ended', async () => {
      prisma.employmentContract.findMany.mockResolvedValue([
        { id: 'existing', userId: USER_ID, startDate: new Date('2025-01-01'), endDate: new Date('2026-02-28') },
      ]);
      await expect(service.create(USER_ID, dto({ startDate: '2026-03-01' }), CREATED_BY)).resolves.toBeDefined();
    });

    it('creates a well-formed open-ended contract', async () => {
      const result = await service.create(USER_ID, dto(), CREATED_BY);
      expect(result.userId).toBe(USER_ID);
      expect(result.kind).toBe(EmploymentContractKind.FULL_TIME);
      expect(prisma.employmentContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: USER_ID, createdById: CREATED_BY, endDate: null }),
        }),
      );
    });
  });

  describe('end', () => {
    it('rejects ending a contract belonging to a different user', async () => {
      prisma.employmentContract.findUnique.mockResolvedValue({
        id: 'ec1',
        userId: 'someone-else',
        startDate: new Date('2026-03-01'),
      });
      await expect(service.end(USER_ID, 'ec1', { endDate: '2026-10-31' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.employmentContract.update).not.toHaveBeenCalled();
    });

    it('rejects an endDate before the contract started', async () => {
      prisma.employmentContract.findUnique.mockResolvedValue({
        id: 'ec1',
        userId: USER_ID,
        startDate: new Date('2026-03-01'),
      });
      await expect(service.end(USER_ID, 'ec1', { endDate: '2026-01-01' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.employmentContract.update).not.toHaveBeenCalled();
    });

    it('dates the contract closed rather than deleting it', async () => {
      prisma.employmentContract.findUnique.mockResolvedValue({
        id: 'ec1',
        userId: USER_ID,
        startDate: new Date('2026-03-01'),
      });
      const result = await service.end(USER_ID, 'ec1', { endDate: '2026-10-31' });
      expect(prisma.employmentContract.update).toHaveBeenCalledWith({
        where: { id: 'ec1' },
        data: { endDate: new Date('2026-10-31') },
      });
      expect(result.endDate).toBe('2026-10-31');
      expect(prisma.employmentContract.delete).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects removing a contract belonging to a different user', async () => {
      prisma.employmentContract.findUnique.mockResolvedValue({ id: 'ec1', userId: 'someone-else' });
      await expect(service.remove(USER_ID, 'ec1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.employmentContract.delete).not.toHaveBeenCalled();
    });

    it('removes a contract belonging to the caller-specified user', async () => {
      prisma.employmentContract.findUnique.mockResolvedValue({ id: 'ec1', userId: USER_ID });
      await service.remove(USER_ID, 'ec1');
      expect(prisma.employmentContract.delete).toHaveBeenCalledWith({ where: { id: 'ec1' } });
    });
  });

  describe('list', () => {
    it('returns every contract for the user, newest first', async () => {
      prisma.employmentContract.findMany.mockResolvedValue([
        {
          id: 'ec1',
          userId: USER_ID,
          kind: 'FULL_TIME',
          startDate: new Date('2026-03-01'),
          endDate: null,
          createdById: CREATED_BY,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
        },
      ]);
      const result = await service.list(USER_ID);
      expect(result.userId).toBe(USER_ID);
      expect(result.contracts).toHaveLength(1);
      expect(result.contracts[0].startDate).toBe('2026-03-01');
    });
  });
});

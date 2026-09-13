import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffAbsenceKind, UserRole } from '@redinfo/shared';
import { StaffAbsencesService } from './staff-absences.service';

const USER_ID = 'u-tiago';
const OTHER_USER_ID = 'u-someone-else';
const CREATED_BY = 'u-coordinator';

const coordinator = { id: CREATED_BY, roles: [UserRole.EMERGENCY_COORDINATOR] };
const volunteer = { id: USER_ID, roles: [UserRole.EMERGENCY_OPERATIONAL] };

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    staffAbsence: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({
          id: 'sa1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          ...args.data,
        }),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({
          id: args.where.id,
          userId: USER_ID,
          kind: 'VACATION',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-14'),
          notes: null,
          createdById: CREATED_BY,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          ...args.data,
        }),
      ),
      delete: jest.fn().mockResolvedValue({ id: 'sa1' }),
    },
    ...overrides,
  };
}

const dto = (
  overrides: Partial<{ userId: string; kind: StaffAbsenceKind; startDate: string; endDate: string; notes?: string }> = {},
) => ({
  userId: USER_ID,
  kind: StaffAbsenceKind.VACATION,
  startDate: '2026-08-01',
  endDate: '2026-08-14',
  ...overrides,
});

describe('StaffAbsencesService', () => {
  let service: StaffAbsencesService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new StaffAbsencesService(prisma as never);
  });

  describe('create', () => {
    it('rejects an endDate before startDate', async () => {
      await expect(
        service.create(dto({ startDate: '2026-08-14', endDate: '2026-08-01' }), CREATED_BY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.staffAbsence.create).not.toHaveBeenCalled();
    });

    it('rejects a range overlapping an existing absence for the same person', async () => {
      prisma.staffAbsence.findMany.mockResolvedValue([
        { id: 'existing', userId: USER_ID, startDate: new Date('2026-08-10'), endDate: new Date('2026-08-20') },
      ]);
      await expect(service.create(dto(), CREATED_BY)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.staffAbsence.create).not.toHaveBeenCalled();
    });

    it('allows a range that starts exactly after a previous one ended', async () => {
      prisma.staffAbsence.findMany.mockResolvedValue([
        { id: 'existing', userId: USER_ID, startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') },
      ]);
      await expect(service.create(dto(), CREATED_BY)).resolves.toBeDefined();
    });

    it('scopes the overlap check to the target person alone', async () => {
      await service.create(dto(), CREATED_BY);
      expect(prisma.staffAbsence.findMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });

    it('creates a well-formed absence', async () => {
      const result = await service.create(dto({ notes: 'Two weeks off' }), CREATED_BY);
      expect(result.userId).toBe(USER_ID);
      expect(result.kind).toBe(StaffAbsenceKind.VACATION);
      expect(prisma.staffAbsence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            createdById: CREATED_BY,
            notes: 'Two weeks off',
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('404s on an absence that does not exist', async () => {
      await expect(
        service.update('missing', { kind: StaffAbsenceKind.SICK_LEAVE, startDate: '2026-08-01', endDate: '2026-08-02' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an endDate before startDate', async () => {
      prisma.staffAbsence.findUnique.mockResolvedValue({
        id: 'sa1',
        userId: USER_ID,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-14'),
      });
      await expect(
        service.update('sa1', { kind: StaffAbsenceKind.VACATION, startDate: '2026-08-14', endDate: '2026-08-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.staffAbsence.update).not.toHaveBeenCalled();
    });

    it('rejects a new range overlapping another absence for the same person', async () => {
      prisma.staffAbsence.findUnique.mockResolvedValue({
        id: 'sa1',
        userId: USER_ID,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-14'),
      });
      prisma.staffAbsence.findMany.mockResolvedValue([
        { id: 'other', userId: USER_ID, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-10') },
      ]);
      await expect(
        service.update('sa1', { kind: StaffAbsenceKind.VACATION, startDate: '2026-09-05', endDate: '2026-09-15' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.staffAbsence.update).not.toHaveBeenCalled();
    });

    it('does not treat itself as an overlap', async () => {
      prisma.staffAbsence.findUnique.mockResolvedValue({
        id: 'sa1',
        userId: USER_ID,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-14'),
      });
      await expect(
        service.update('sa1', { kind: StaffAbsenceKind.SICK_LEAVE, startDate: '2026-08-02', endDate: '2026-08-10' }),
      ).resolves.toBeDefined();
      expect(prisma.staffAbsence.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, id: { not: 'sa1' } },
      });
    });
  });

  describe('remove', () => {
    it('404s on an absence that does not exist', async () => {
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.staffAbsence.delete).not.toHaveBeenCalled();
    });

    it('removes an existing absence', async () => {
      prisma.staffAbsence.findUnique.mockResolvedValue({ id: 'sa1', userId: USER_ID });
      await service.remove('sa1');
      expect(prisma.staffAbsence.delete).toHaveBeenCalledWith({ where: { id: 'sa1' } });
    });
  });

  describe('list', () => {
    it('rejects a malformed date range', async () => {
      await expect(service.list(coordinator, 'not-a-date', '2026-08-31')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('a caller without MANAGE_PERSONNEL is always scoped to themselves', async () => {
      await service.list(volunteer, '2026-08-01', '2026-08-31');
      expect(prisma.staffAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) }),
      );
    });

    it('a caller without MANAGE_PERSONNEL cannot ask for someone else', async () => {
      await expect(service.list(volunteer, '2026-08-01', '2026-08-31', OTHER_USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('a coordinator sees everyone when no userId is given', async () => {
      await service.list(coordinator, '2026-08-01', '2026-08-31');
      const call = prisma.staffAbsence.findMany.mock.calls[0][0];
      expect(call.where.userId).toBeUndefined();
    });

    it('a coordinator can filter to one person', async () => {
      await service.list(coordinator, '2026-08-01', '2026-08-31', USER_ID);
      expect(prisma.staffAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) }),
      );
    });
  });

  describe('findOverlapping', () => {
    it('queries by inclusive-range overlap, unscoped by user', async () => {
      await service.findOverlapping('2026-08-01', '2026-08-31');
      expect(prisma.staffAbsence.findMany).toHaveBeenCalledWith({
        where: {
          startDate: { lte: new Date('2026-08-31T00:00:00.000Z') },
          endDate: { gte: new Date('2026-08-01T00:00:00.000Z') },
        },
      });
    });
  });
});

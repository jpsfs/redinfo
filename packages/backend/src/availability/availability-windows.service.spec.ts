import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityWindowsService,
  MAX_WINDOW_DAYS,
} from './availability-windows.service';
import { AvailabilityWindowStatus } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const COORDINATOR = { id: 'user-coord', firstName: 'Maria', lastName: 'Santos' };

function windowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'win-1',
    startDate: new Date('2026-09-28T00:00:00.000Z'),
    endDate: new Date('2026-10-05T00:00:00.000Z'),
    status: AvailabilityWindowStatus.OPEN,
    openedById: COORDINATOR.id,
    openedBy: COORDINATOR,
    openedAt: new Date('2026-09-26T09:14:00.000Z'),
    closedById: null,
    closedBy: null,
    closedAt: null,
    createdAt: new Date('2026-09-26T09:14:00.000Z'),
    updatedAt: new Date('2026-09-26T09:14:00.000Z'),
    ...overrides,
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    availabilityWindow: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve(windowRow({ id: 'win-new', ...args.data, openedBy: COORDINATOR })),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve(
          windowRow({
            id: args.where.id,
            ...args.data,
            openedBy: COORDINATOR,
            closedBy: COORDINATOR,
          }),
        ),
      ),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

describe('AvailabilityWindowsService', () => {
  let service: AvailabilityWindowsService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new AvailabilityWindowsService(prisma as never);
  });

  // ── open (AC: only one window open at a time) ────────────────────────────────

  describe('open', () => {
    it('creates a window when none is open', async () => {
      const result = await service.open(
        { startDate: '2026-09-28', endDate: '2026-10-05' },
        COORDINATOR.id,
      );

      expect(prisma.availabilityWindow.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.startDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
      expect(data.endDate.toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect(data.status).toBe(AvailabilityWindowStatus.OPEN);
      expect(data.openedById).toBe(COORDINATOR.id);
      expect(result.startDate).toBe('2026-09-28');
      expect(result.endDate).toBe('2026-10-05');
    });

    it('throws ConflictException when a window is already open', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());

      await expect(
        service.open({ startDate: '2026-10-12', endDate: '2026-10-19' }, COORDINATOR.id),
      ).rejects.toThrow(ConflictException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('names the blocking window in the conflict message', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());

      await expect(
        service.open({ startDate: '2026-10-12', endDate: '2026-10-19' }, COORDINATOR.id),
      ).rejects.toThrow(/2026-09-28 – 2026-10-05/);
    });

    it('throws BadRequestException when the end date precedes the start date', async () => {
      await expect(
        service.open({ startDate: '2026-10-12', endDate: '2026-10-08' }, COORDINATOR.id),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.availabilityWindow.create).not.toHaveBeenCalled();
    });

    it('accepts a single-day window', async () => {
      const result = await service.open(
        { startDate: '2026-10-05', endDate: '2026-10-05' },
        COORDINATOR.id,
      );
      expect(result.startDate).toBe(result.endDate);
    });

    it('rejects a window longer than the allowed maximum', async () => {
      await expect(
        service.open({ startDate: '2026-01-01', endDate: '2026-12-31' }, COORDINATOR.id),
      ).rejects.toThrow(new RegExp(`at most ${MAX_WINDOW_DAYS} days`));
    });

    it.each(['2026-13-01', '28/09/2026', 'soon'])(
      'rejects malformed start date %s',
      async (value) => {
        await expect(
          service.open({ startDate: value, endDate: '2026-10-05' }, COORDINATOR.id),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('normalises a full timestamp down to its calendar day', async () => {
      await service.open(
        { startDate: '2026-09-28T22:30:00.000Z', endDate: '2026-10-05' },
        COORDINATOR.id,
      );
      const { data } = prisma.availabilityWindow.create.mock.calls[0][0];
      expect(data.startDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    });
  });

  // ── close (AC: coordinators can close the active window) ─────────────────────

  describe('close', () => {
    it('marks the window closed and records who closed it', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(windowRow());

      const result = await service.close('win-1', COORDINATOR.id);

      const { data } = prisma.availabilityWindow.update.mock.calls[0][0];
      expect(data.status).toBe(AvailabilityWindowStatus.CLOSED);
      expect(data.closedById).toBe(COORDINATOR.id);
      expect(data.closedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(AvailabilityWindowStatus.CLOSED);
    });

    it('throws NotFoundException for an unknown window', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(null);
      await expect(service.close('nope', COORDINATOR.id)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the window is already closed', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(
        windowRow({ status: AvailabilityWindowStatus.CLOSED }),
      );
      await expect(service.close('win-1', COORDINATOR.id)).rejects.toThrow(ConflictException);
      expect(prisma.availabilityWindow.update).not.toHaveBeenCalled();
    });
  });

  // ── lookups ─────────────────────────────────────────────────────────────────

  describe('findActive', () => {
    it('returns null when no window is open', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(null);
      await expect(service.findActive()).resolves.toBeNull();
    });

    it('only ever looks for OPEN windows', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(windowRow());
      await service.findActive();
      expect(prisma.availabilityWindow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: AvailabilityWindowStatus.OPEN } }),
      );
    });
  });

  describe('findActiveOrLatest', () => {
    it('falls back to the most recently opened window when none is open', async () => {
      prisma.availabilityWindow.findFirst
        .mockResolvedValueOnce(null) // no OPEN window
        .mockResolvedValueOnce(windowRow({ status: AvailabilityWindowStatus.CLOSED }));

      const result = await service.findActiveOrLatest();

      expect(result?.status).toBe(AvailabilityWindowStatus.CLOSED);
      expect(prisma.availabilityWindow.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderBy: { openedAt: 'desc' } }),
      );
    });

    it('returns null when no window has ever been opened', async () => {
      prisma.availabilityWindow.findFirst.mockResolvedValue(null);
      await expect(service.findActiveOrLatest()).resolves.toBeNull();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });

    it('serialises dates as ISO calendar days and timestamps as ISO instants', async () => {
      prisma.availabilityWindow.findUnique.mockResolvedValue(windowRow());
      const result = await service.findOne('win-1');
      expect(result.startDate).toBe('2026-09-28');
      expect(result.openedAt).toBe('2026-09-26T09:14:00.000Z');
      expect(result.openedBy).toEqual(COORDINATOR);
      expect(result.closedAt).toBeNull();
    });
  });

  describe('findAll', () => {
    it('pages newest-first and reports the total', async () => {
      prisma.availabilityWindow.findMany.mockResolvedValue([windowRow()]);
      prisma.availabilityWindow.count.mockResolvedValue(3);

      const result = await service.findAll(2, 10);

      expect(prisma.availabilityWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10, orderBy: { openedAt: 'desc' } }),
      );
      expect(result).toMatchObject({ total: 3, page: 2, perPage: 10 });
      expect(result.data).toHaveLength(1);
    });
  });
});

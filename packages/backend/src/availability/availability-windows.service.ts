import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityWindowDto } from './dto/create-availability-window.dto';
import { isIsoDate, isoDateRange, parseIsoDate, toIsoDate } from '../utils/date.util';
import { AvailabilityWindow, AvailabilityWindowStatus } from '@redinfo/shared';

/** Longest window a coordinator may open, as a guard against fat-fingered years. */
export const MAX_WINDOW_DAYS = 92;

type ActorRow = { id: string; firstName: string; lastName: string };

type WindowRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  // Prisma generates its own string-union enums; the template-literal form
  // accepts both those and the shared TS enum without a cast at every call.
  status: `${AvailabilityWindowStatus}`;
  openedById: string;
  openedBy?: ActorRow | null;
  openedAt: Date;
  closedById: string | null;
  closedBy?: ActorRow | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ACTOR_SELECT = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class AvailabilityWindowsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, perPage = 25) {
    const skip = (page - 1) * perPage;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.availabilityWindow.findMany({
        skip,
        take: perPage,
        orderBy: { openedAt: 'desc' },
        include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
      }),
      this.prisma.availabilityWindow.count(),
    ]);
    return { data: rows.map(serializeWindow), total, page, perPage };
  }

  async findOne(id: string) {
    const window = await this.prisma.availabilityWindow.findUnique({
      where: { id },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    if (!window) throw new NotFoundException(`Availability window ${id} not found`);
    return serializeWindow(window);
  }

  /** The single OPEN window, or null when submissions are closed. */
  async findActive(): Promise<AvailabilityWindow | null> {
    const window = await this.prisma.availabilityWindow.findFirst({
      where: { status: AvailabilityWindowStatus.OPEN },
      orderBy: { openedAt: 'desc' },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    return window ? serializeWindow(window) : null;
  }

  /**
   * The window the self-service screen should show: the open one if there is
   * one, otherwise the most recently opened (closed) window, so volunteers can
   * still read back their final submissions.
   */
  async findActiveOrLatest(): Promise<AvailabilityWindow | null> {
    const active = await this.findActive();
    if (active) return active;
    const latest = await this.prisma.availabilityWindow.findFirst({
      orderBy: { openedAt: 'desc' },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    return latest ? serializeWindow(latest) : null;
  }

  async open(dto: CreateAvailabilityWindowDto, openedById: string) {
    const startDate = this.assertIsoDate(dto.startDate, 'startDate');
    const endDate = this.assertIsoDate(dto.endDate, 'endDate');

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const days = isoDateRange(startDate, endDate).length;
    if (days > MAX_WINDOW_DAYS) {
      throw new BadRequestException(
        `A window may span at most ${MAX_WINDOW_DAYS} days (got ${days})`,
      );
    }

    // Only one window may be OPEN at a time (AC). Checked here rather than in
    // the schema because Prisma's DSL cannot express a filtered unique index.
    const alreadyOpen = await this.prisma.availabilityWindow.findFirst({
      where: { status: AvailabilityWindowStatus.OPEN },
    });
    if (alreadyOpen) {
      throw new ConflictException(
        `An availability window is already open (${toIsoDate(alreadyOpen.startDate)} – ${toIsoDate(
          alreadyOpen.endDate,
        )}). Close it before opening the next one.`,
      );
    }

    const created = await this.prisma.availabilityWindow.create({
      data: {
        startDate: parseIsoDate(startDate),
        endDate: parseIsoDate(endDate),
        status: AvailabilityWindowStatus.OPEN,
        openedById,
      },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    return serializeWindow(created);
  }

  async close(id: string, closedById: string) {
    const window = await this.prisma.availabilityWindow.findUnique({ where: { id } });
    if (!window) throw new NotFoundException(`Availability window ${id} not found`);
    if (window.status === AvailabilityWindowStatus.CLOSED) {
      throw new ConflictException(`Availability window ${id} is already closed`);
    }

    const closed = await this.prisma.availabilityWindow.update({
      where: { id },
      data: {
        status: AvailabilityWindowStatus.CLOSED,
        closedById,
        closedAt: new Date(),
      },
      include: { openedBy: ACTOR_SELECT, closedBy: ACTOR_SELECT },
    });
    return serializeWindow(closed);
  }

  private assertIsoDate(value: string, field: string): string {
    const normalised = value?.length > 10 ? toIsoDate(value) : value;
    if (!isIsoDate(normalised)) {
      throw new BadRequestException(
        `${field} must be a valid calendar date (YYYY-MM-DD), got "${value}"`,
      );
    }
    return normalised;
  }
}

export function serializeWindow(row: WindowRow): AvailabilityWindow {
  return {
    id: row.id,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    status: row.status as AvailabilityWindowStatus,
    openedById: row.openedById,
    openedBy: row.openedBy ?? null,
    openedAt: row.openedAt.toISOString(),
    closedById: row.closedById,
    closedBy: row.closedBy ?? null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

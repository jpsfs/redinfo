import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { isIsoDate, parseIsoDate, toIsoDate } from '../utils/date.util';
import { Holiday } from '@redinfo/shared';

type HolidayRow = { id: string; date: Date; name: string; createdAt: Date; updatedAt: Date };

/**
 * Coordinator-maintained holiday table. A holiday makes a weekday follow the
 * weekend shift pattern — but that rule lives in `ShiftScheduleService`, which
 * is the only consumer of `findBetween`/`isHoliday`.
 */
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, perPage = 100, from?: string, to?: string) {
    const skip = (page - 1) * perPage;
    const where = this.dateRangeWhere(from, to);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.holiday.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { date: 'asc' },
      }),
      this.prisma.holiday.count({ where }),
    ]);
    return { data: rows.map(serializeHoliday), total, page, perPage };
  }

  async findOne(id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException(`Holiday ${id} not found`);
    return serializeHoliday(holiday);
  }

  async create(dto: CreateHolidayDto) {
    const date = this.assertIsoDate(dto.date);
    const existing = await this.prisma.holiday.findUnique({
      where: { date: parseIsoDate(date) },
    });
    if (existing) {
      throw new ConflictException(`A holiday already exists on ${date}`);
    }
    const created = await this.prisma.holiday.create({
      data: { date: parseIsoDate(date), name: dto.name },
    });
    return serializeHoliday(created);
  }

  async update(id: string, dto: UpdateHolidayDto) {
    await this.findOne(id);

    if (dto.date !== undefined) {
      const date = this.assertIsoDate(dto.date);
      const clash = await this.prisma.holiday.findUnique({
        where: { date: parseIsoDate(date) },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(`A holiday already exists on ${date}`);
      }
    }

    const updated = await this.prisma.holiday.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: parseIsoDate(this.assertIsoDate(dto.date)) }),
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });
    return serializeHoliday(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    const deleted = await this.prisma.holiday.delete({ where: { id } });
    return serializeHoliday(deleted);
  }

  /** Holidays in `[from, to]`, keyed by ISO date. Used by ShiftScheduleService. */
  async findBetween(from: string, to: string): Promise<Map<string, string>> {
    const rows = await this.prisma.holiday.findMany({
      where: {
        date: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
      },
      orderBy: { date: 'asc' },
    });
    return new Map(rows.map((row) => [toIsoDate(row.date), row.name]));
  }

  async isHoliday(date: string): Promise<boolean> {
    const found = await this.prisma.holiday.findUnique({
      where: { date: parseIsoDate(date) },
    });
    return found !== null;
  }

  private assertIsoDate(value: string): string {
    // `@IsDateString()` also accepts full timestamps; `@db.Date` columns only
    // ever hold a calendar day, so normalise and reject anything ambiguous.
    const normalised = value.length > 10 ? toIsoDate(value) : value;
    if (!isIsoDate(normalised)) {
      throw new BadRequestException(`date must be a valid calendar date (YYYY-MM-DD), got "${value}"`);
    }
    return normalised;
  }

  private dateRangeWhere(from?: string, to?: string) {
    if (!from && !to) return {};
    return {
      date: {
        ...(from ? { gte: parseIsoDate(this.assertIsoDate(from)) } : {}),
        ...(to ? { lte: parseIsoDate(this.assertIsoDate(to)) } : {}),
      },
    };
  }
}

export function serializeHoliday(row: HolidayRow): Holiday {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

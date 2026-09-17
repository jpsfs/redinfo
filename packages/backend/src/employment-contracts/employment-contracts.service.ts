import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentContract, EmploymentContractKind, EmploymentContractsResponse } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toIsoDate, parseIsoDate } from '../utils/date.util';
import { CreateEmploymentContractDto } from './dto/create-contract.dto';
import { EndEmploymentContractDto } from './dto/end-contract.dto';

type ContractRow = {
  id: string;
  userId: string;
  kind: string;
  startDate: Date;
  endDate: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const toContract = (row: ContractRow): EmploymentContract => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind as EmploymentContractKind,
  startDate: toIsoDate(row.startDate),
  endDate: row.endDate ? toIsoDate(row.endDate) : null,
  createdById: row.createdById,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Two inclusive date ranges (`endDate` null = open-ended) sharing any day at all. */
function dateRangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aEndsAfterBStarts = aEnd === null || aEnd >= bStart;
  const bEndsAfterAStarts = bEnd === null || bEnd >= aStart;
  return aEndsAfterBStarts && bEndsAfterAStarts;
}

/**
 * Employment contracts (Stage 1 of the paid-staff rework) — a dated fact
 * replacing #223's timeless `User.isPaidStaff` flag. See `isOnContractClock`
 * (shared) for what this changes about `AssignmentCompensationKind`
 * resolution: the contract's own `startDate`/`endDate` is the authoritative
 * gate in front of a `PaidStaffSchedule` block/override.
 */
@Injectable()
export class EmploymentContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<EmploymentContractsResponse> {
    const rows = await this.prisma.employmentContract.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
    return { userId, contracts: rows.map(toContract) };
  }

  /**
   * One person may not hold two overlapping contracts — which one would
   * `isOnContractClock` gate against for a date both cover? A new contract
   * either starts after the last one ended, or the last one needs an
   * `endDate` first.
   */
  async create(
    userId: string,
    dto: CreateEmploymentContractDto,
    createdById: string,
  ): Promise<EmploymentContract> {
    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('A contract cannot end before it starts.');
    }

    const existing = await this.prisma.employmentContract.findMany({ where: { userId } });
    const overlap = existing.find((row) =>
      dateRangesOverlap(
        dto.startDate,
        dto.endDate ?? null,
        toIsoDate(row.startDate),
        row.endDate ? toIsoDate(row.endDate) : null,
      ),
    );
    if (overlap) {
      throw new ConflictException(
        'This person already has a contract covering some of these dates — end it first, or ' +
          'pick a start date after it ends.',
      );
    }

    const row = await this.prisma.employmentContract.create({
      data: {
        userId,
        kind: dto.kind,
        startDate: parseIsoDate(dto.startDate),
        endDate: dto.endDate ? parseIsoDate(dto.endDate) : null,
        createdById,
      },
    });
    return toContract(row);
  }

  /**
   * Dates when a contract stopped, rather than deleting the row — a past
   * assignment's `SALARY` resolution (`isOnContractClock`) depends on the
   * contract staying on file for the date it covered. See
   * `EndEmploymentContractRequest` (shared).
   */
  async end(userId: string, contractId: string, dto: EndEmploymentContractDto): Promise<EmploymentContract> {
    const row = await this.prisma.employmentContract.findUnique({ where: { id: contractId } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException(`Employment contract ${contractId} not found`);
    }
    if (dto.endDate < toIsoDate(row.startDate)) {
      throw new BadRequestException('A contract cannot end before it starts.');
    }
    const updated = await this.prisma.employmentContract.update({
      where: { id: contractId },
      data: { endDate: parseIsoDate(dto.endDate) },
    });
    return toContract(updated);
  }

  async remove(userId: string, contractId: string): Promise<{ id: string }> {
    const row = await this.prisma.employmentContract.findUnique({ where: { id: contractId } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException(`Employment contract ${contractId} not found`);
    }
    await this.prisma.employmentContract.delete({ where: { id: contractId } });
    return { id: contractId };
  }
}

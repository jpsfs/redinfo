import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateMaintenanceEntryDto } from './dto/create-maintenance-entry.dto';
import { UpdateMaintenanceEntryDto } from './dto/update-maintenance-entry.dto';
import { addDays } from '../utils/date.util';
import { VehicleType, VehicleOccupancySource } from '@redinfo/shared';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleOccupancy: VehicleOccupancyService,
  ) {}

  // ─── Vehicles ───────────────────────────────────────────────────────────────

  async findAll(page = 1, perPage = 25, vehicleType?: VehicleType) {
    const skip = (page - 1) * perPage;
    const where = {
      isDeleted: false,
      ...(vehicleType ? { vehicleType } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { data, total, page, perPage };
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, isDeleted: false },
      include: { maintenanceEntries: { orderBy: { date: 'desc' } } },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found`);
    return vehicle;
  }

  async findUpcoming(days = 30) {
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.prisma.vehicle.findMany({
      where: {
        isDeleted: false,
        OR: [
          { insuranceRenewalDate: { lte: threshold } },
          { nextImtInspectionDate: { lte: threshold } },
        ],
      },
      orderBy: { insuranceRenewalDate: 'asc' },
    });
  }

  async create(dto: CreateVehicleDto) {
    const plate = dto.licensePlate.toUpperCase();

    const [plateConflict, caudaConflict] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { licensePlate: plate } }),
      this.prisma.vehicle.findUnique({ where: { numeroCauda: dto.numeroCauda } }),
    ]);

    if (plateConflict) throw new ConflictException('License plate already in use');
    if (caudaConflict) throw new ConflictException('Número de cauda already in use');

    return this.prisma.vehicle.create({
      data: {
        ...dto,
        licensePlate: plate,
        insuranceRenewalDate: new Date(dto.insuranceRenewalDate),
        nextImtInspectionDate: new Date(dto.nextImtInspectionDate),
      },
    });
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);

    if (dto.licensePlate) {
      const plate = dto.licensePlate.toUpperCase();
      const conflict = await this.prisma.vehicle.findFirst({
        where: { licensePlate: plate, NOT: { id } },
      });
      if (conflict) throw new ConflictException('License plate already in use');
      dto = { ...dto, licensePlate: plate };
    }

    if (dto.numeroCauda) {
      const conflict = await this.prisma.vehicle.findFirst({
        where: { numeroCauda: dto.numeroCauda, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Número de cauda already in use');
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.licensePlate !== undefined && { licensePlate: dto.licensePlate }),
        ...(dto.numeroCauda !== undefined && { numeroCauda: dto.numeroCauda }),
        ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType }),
        ...(dto.insuranceRenewalDate !== undefined && {
          insuranceRenewalDate: new Date(dto.insuranceRenewalDate),
        }),
        ...(dto.nextImtInspectionDate !== undefined && {
          nextImtInspectionDate: new Date(dto.nextImtInspectionDate),
        }),
        ...(dto.manufacturer !== undefined && { manufacturer: dto.manufacturer }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.seatedCapacity !== undefined && { seatedCapacity: dto.seatedCapacity }),
        ...(dto.wheelchairPositions !== undefined && {
          wheelchairPositions: dto.wheelchairPositions,
        }),
        ...(dto.stretcherPositions !== undefined && {
          stretcherPositions: dto.stretcherPositions,
        }),
        ...(dto.hasRampOrLift !== undefined && { hasRampOrLift: dto.hasRampOrLift }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vehicle.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  // ─── Maintenance Entries ─────────────────────────────────────────────────────

  async findAllEntries(page = 1, perPage = 25, vehicleId?: string) {
    const skip = (page - 1) * perPage;
    const where = vehicleId ? { vehicleId } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.maintenanceEntry.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { date: 'desc' },
      }),
      this.prisma.maintenanceEntry.count({ where }),
    ]);

    return { data, total, page, perPage };
  }

  async findOneEntry(id: string) {
    const entry = await this.prisma.maintenanceEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Maintenance entry ${id} not found`);
    return entry;
  }

  async createEntry(dto: CreateMaintenanceEntryDto) {
    await this.findOne(dto.vehicleId);
    const entry = await this.prisma.maintenanceEntry.create({
      data: {
        ...dto,
        date: new Date(dto.date),
        cost: dto.cost,
        vatAmount: dto.vatAmount ?? null,
      },
    });
    await this.syncMaintenanceOccupancy(entry);
    return entry;
  }

  async updateEntry(id: string, dto: UpdateMaintenanceEntryDto) {
    await this.findOneEntry(id);
    const entry = await this.prisma.maintenanceEntry.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.serviceProvider !== undefined && { serviceProvider: dto.serviceProvider }),
        ...(dto.cost !== undefined && { cost: dto.cost }),
        ...(dto.vatAmount !== undefined && { vatAmount: dto.vatAmount }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    await this.syncMaintenanceOccupancy(entry);
    return entry;
  }

  async removeEntry(id: string) {
    await this.findOneEntry(id);
    const entry = await this.prisma.maintenanceEntry.delete({ where: { id } });
    await this.vehicleOccupancy.removeForSource(VehicleOccupancySource.MAINTENANCE, id);
    return entry;
  }

  /**
   * Write-through to `VehicleOccupancy` (#222) — a `MaintenanceEntry` only
   * carries a date, no times, so it occupies the whole working day.
   */
  private async syncMaintenanceOccupancy(entry: {
    id: string;
    vehicleId: string;
    date: Date;
    notes: string | null;
  }) {
    await this.vehicleOccupancy.syncForSource(VehicleOccupancySource.MAINTENANCE, entry.id, {
      vehicleId: entry.vehicleId,
      startsAt: entry.date,
      endsAt: addDays(entry.date, 1),
      notes: entry.notes,
    });
  }
}

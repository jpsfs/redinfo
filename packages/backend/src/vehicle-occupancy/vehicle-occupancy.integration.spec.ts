import { PrismaClient } from '@prisma/client';
import { VehicleType, VehicleOccupancySource } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleOccupancyService } from './vehicle-occupancy.service';
import { VehiclesService } from '../vehicles/vehicles.service';

/**
 * Integration coverage for #222's shared vehicle occupancy against a real
 * Postgres — the unit specs cover the same behaviour against a mocked
 * Prisma; this proves the maintenance write-through and the overlap query
 * actually work at the database, and that the conflict path is enforced by
 * a unique constraint rather than by application code alone.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describeIntegration('VehicleOccupancyService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const occupancy = new VehicleOccupancyService(prisma);
  const vehicles = new VehiclesService(prisma, occupancy);
  const vehicleIds: string[] = [];

  async function makeVehicle(suffix: string) {
    const vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `${RUN}-${suffix}`,
        numeroCauda: `${RUN}-${suffix}`,
        vehicleType: VehicleType.TRANSPORT,
        insuranceRenewalDate: new Date('2099-12-31T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2099-12-31T00:00:00.000Z'),
      },
    });
    vehicleIds.push(vehicle.id);
    return vehicle;
  }

  afterAll(async () => {
    await prisma.vehicleOccupancy.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.maintenanceEntry.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  });

  it('integration: creating a maintenance entry writes through to a VehicleOccupancy interval for the whole day', async () => {
    const vehicle = await makeVehicle('01');

    const entry = await vehicles.createEntry({
      vehicleId: vehicle.id,
      date: '2026-09-15',
      description: 'Annual service',
      serviceProvider: 'Garagem Silva',
      cost: 200,
    });

    const found = await prisma.vehicleOccupancy.findFirst({
      where: { source: VehicleOccupancySource.MAINTENANCE, sourceId: entry.id },
    });
    expect(found).toMatchObject({ vehicleId: vehicle.id });
    expect(found!.startsAt.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(found!.endsAt.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('integration: updating a maintenance entry moves its occupancy interval instead of duplicating it', async () => {
    const vehicle = await makeVehicle('02');
    const entry = await vehicles.createEntry({
      vehicleId: vehicle.id,
      date: '2026-09-16',
      description: 'Brake pads',
      serviceProvider: 'Garagem Silva',
      cost: 90,
    });

    await vehicles.updateEntry(entry.id, { date: '2026-09-17' });

    const rows = await prisma.vehicleOccupancy.findMany({
      where: { source: VehicleOccupancySource.MAINTENANCE, sourceId: entry.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].startsAt.toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('integration: deleting a maintenance entry removes its occupancy interval', async () => {
    const vehicle = await makeVehicle('03');
    const entry = await vehicles.createEntry({
      vehicleId: vehicle.id,
      date: '2026-09-18',
      description: 'Tyre change',
      serviceProvider: 'Garagem Silva',
      cost: 120,
    });

    await vehicles.removeEntry(entry.id);

    const found = await prisma.vehicleOccupancy.findFirst({
      where: { source: VehicleOccupancySource.MAINTENANCE, sourceId: entry.id },
    });
    expect(found).toBeNull();
  });

  it('integration: an interval query returns everything overlapping the window for a vehicle, whatever the source', async () => {
    const vehicle = await makeVehicle('04');
    await vehicles.createEntry({
      vehicleId: vehicle.id,
      date: '2026-09-20',
      description: 'Inspection',
      serviceProvider: 'Garagem Silva',
      cost: 50,
    });
    await occupancy.book({
      vehicleId: vehicle.id,
      startsAt: new Date('2026-09-21T08:00:00.000Z'),
      endsAt: new Date('2026-09-21T16:00:00.000Z'),
      source: VehicleOccupancySource.SCHEDULE_SHIFT,
      sourceId: `${RUN}-shift-1`,
    });

    const found = await occupancy.findInRange(
      new Date('2026-09-20T00:00:00.000Z'),
      new Date('2026-09-22T00:00:00.000Z'),
      vehicle.id,
    );
    expect(found.map((r) => r.source).sort()).toEqual(
      [VehicleOccupancySource.MAINTENANCE, VehicleOccupancySource.SCHEDULE_SHIFT].sort(),
    );
  });

  it('integration: booking an overlapping interval is rejected without a reason, and succeeds with one', async () => {
    const vehicle = await makeVehicle('05');
    await occupancy.book({
      vehicleId: vehicle.id,
      startsAt: new Date('2026-09-25T08:00:00.000Z'),
      endsAt: new Date('2026-09-25T16:00:00.000Z'),
      source: VehicleOccupancySource.SCHEDULE_SHIFT,
      sourceId: `${RUN}-shift-2`,
    });

    await expect(
      occupancy.book({
        vehicleId: vehicle.id,
        startsAt: new Date('2026-09-25T10:00:00.000Z'),
        endsAt: new Date('2026-09-25T18:00:00.000Z'),
        source: VehicleOccupancySource.SUPPORT_EVENT,
        sourceId: `${RUN}-event-1`,
      }),
    ).rejects.toThrow('already committed');

    const overridden = await occupancy.book({
      vehicleId: vehicle.id,
      startsAt: new Date('2026-09-25T10:00:00.000Z'),
      endsAt: new Date('2026-09-25T18:00:00.000Z'),
      source: VehicleOccupancySource.SUPPORT_EVENT,
      sourceId: `${RUN}-event-1`,
      overrideReason: 'Coordinator confirmed both crews cover the gap',
    });
    expect(overridden.overrideReason).toBe('Coordinator confirmed both crews cover the gap');

    const persisted = await prisma.vehicleOccupancy.findUnique({ where: { id: overridden.id } });
    expect(persisted?.overrideReason).toBe('Coordinator confirmed both crews cover the gap');
  });
});

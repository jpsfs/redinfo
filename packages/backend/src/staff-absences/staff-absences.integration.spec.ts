import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { StaffAbsenceKind, UserRole } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAbsencesService } from './staff-absences.service';

/**
 * Integration coverage for the staff absence calendar (#224) against a real
 * Postgres — the unit specs cover the overlap/ordering rules against a
 * mocked Prisma; this proves the self-scoping split (with vs. without
 * `MANAGE_PERSONNEL`) and the range-overlap query actually work against the
 * real schema and its foreign keys.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}.${RUN}@staff-absences.test`;

describeIntegration('StaffAbsencesService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const staffAbsences = new StaffAbsencesService(prisma);
  const userIds: string[] = [];

  let tiago: { id: string };
  let coordinator: { id: string };

  async function createUser(firstName: string, lastName: string, role: UserRole) {
    const user = await prisma.user.create({
      data: {
        email: email(`${firstName}.${lastName}`.toLowerCase()),
        firstName,
        lastName,
        roles: [role],
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    tiago = await createUser('Tiago', 'Absences', UserRole.EMERGENCY_OPERATIONAL);
    coordinator = await createUser('Carla', 'Absences', UserRole.EMERGENCY_COORDINATOR);
  });

  afterAll(async () => {
    await prisma.staffAbsence.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('integration: creates an absence and rejects an overlapping one for the same person', async () => {
    const created = await staffAbsences.create(
      { userId: tiago.id, kind: StaffAbsenceKind.VACATION, startDate: '2026-08-01', endDate: '2026-08-14' },
      coordinator.id,
    );
    expect(created.id).toBeTruthy();

    await expect(
      staffAbsences.create(
        { userId: tiago.id, kind: StaffAbsenceKind.SICK_LEAVE, startDate: '2026-08-10', endDate: '2026-08-20' },
        coordinator.id,
      ),
    ).rejects.toThrow('already has an absence');

    // A range that starts right after the first one ended is fine.
    const following = await staffAbsences.create(
      { userId: tiago.id, kind: StaffAbsenceKind.OTHER_PAID_LEAVE, startDate: '2026-08-15', endDate: '2026-08-16' },
      coordinator.id,
    );
    expect(following.id).toBeTruthy();
  });

  it('integration: findOverlapping answers "who is absent" across every person, unscoped', async () => {
    const absence = await staffAbsences.create(
      { userId: tiago.id, kind: StaffAbsenceKind.VACATION, startDate: '2026-09-01', endDate: '2026-09-05' },
      coordinator.id,
    );

    const found = await staffAbsences.findOverlapping('2026-09-03', '2026-09-04');
    expect(found.map((a) => a.id)).toContain(absence.id);

    const missed = await staffAbsences.findOverlapping('2026-09-06', '2026-09-10');
    expect(missed.map((a) => a.id)).not.toContain(absence.id);
  });

  it('integration: a caller without MANAGE_PERSONNEL only ever sees their own absences', async () => {
    await staffAbsences.create(
      { userId: tiago.id, kind: StaffAbsenceKind.VACATION, startDate: '2026-10-01', endDate: '2026-10-02' },
      coordinator.id,
    );

    const volunteer = { id: tiago.id, roles: [UserRole.EMERGENCY_OPERATIONAL] };
    const own = await staffAbsences.list(volunteer, '2026-10-01', '2026-10-31');
    expect(own.every((a) => a.userId === tiago.id)).toBe(true);
    expect(own.length).toBeGreaterThan(0);

    await expect(
      staffAbsences.list(volunteer, '2026-10-01', '2026-10-31', coordinator.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('integration: a MANAGE_PERSONNEL holder sees every person in range', async () => {
    const coordinatorUser = { id: coordinator.id, roles: [UserRole.EMERGENCY_COORDINATOR] };
    const rows = await staffAbsences.list(coordinatorUser, '2026-08-01', '2026-10-31');
    expect(rows.some((a) => a.userId === tiago.id)).toBe(true);
  });

  it('integration: update rejects a range overlapping another absence for the same person, and removing frees the dates', async () => {
    const first = await staffAbsences.create(
      { userId: tiago.id, kind: StaffAbsenceKind.VACATION, startDate: '2026-11-01', endDate: '2026-11-05' },
      coordinator.id,
    );
    const second = await staffAbsences.create(
      { userId: tiago.id, kind: StaffAbsenceKind.SICK_LEAVE, startDate: '2026-11-10', endDate: '2026-11-12' },
      coordinator.id,
    );

    await expect(
      staffAbsences.update(second.id, { kind: StaffAbsenceKind.SICK_LEAVE, startDate: '2026-11-04', endDate: '2026-11-11' }),
    ).rejects.toThrow('already has an absence');

    await staffAbsences.remove(first.id);

    const moved = await staffAbsences.update(second.id, {
      kind: StaffAbsenceKind.SICK_LEAVE,
      startDate: '2026-11-04',
      endDate: '2026-11-11',
    });
    expect(moved.startDate).toBe('2026-11-04');
  });
});

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider, Prisma, User, UserRole } from '@prisma/client';
import {
  Action,
  AuthProvider as SharedAuthProvider,
  BloodType as SharedBloodType,
  CertificationStatus,
  CertificationType,
  DEFAULT_USER_ROLES,
  User as SharedUser,
  UserRole as SharedUserRole,
  effectiveCertifications,
  hasPermission,
  holdsCertification,
  normalizeRoles,
  sameRoleSet,
} from '@redinfo/shared';
import { ApiConflictException } from '../common/api-error.exception';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate, toIsoDate } from '../utils/date.util';
import { serializeLocality } from '../geography/geography.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CERT_SELECT, CertRow, serializeCertification } from './user-certifications.service';
import { recordProfileChanges } from './profile-audit.util';
import { today, toHeldCertifications } from './certifications.util';

/**
 * Whether a delete failed because another row still points at this one.
 *
 * Two shapes, both seen in practice: Prisma maps some foreign-key failures to
 * a known code, but a Postgres `RESTRICT` violation (SQLSTATE 23001) is not one
 * of them — that arrives as an *unknown* request error carrying the raw
 * connector message, so the code alone is not enough to recognise it.
 */
function isStillReferenced(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2003: foreign key constraint failed. P2014: required relation violated.
    return error.code === 'P2003' || error.code === 'P2014';
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /\b23001\b|violates RESTRICT|foreign key constraint/i.test(error.message);
  }
  return false;
}

/** A friendly name for each identity field a unique-constraint violation could name. */
const IDENTITY_FIELD_LABEL: Record<string, string> = {
  email: 'That email',
  redCrossNumber: 'That Red Cross national number',
  volunteerNumber: 'That volunteer number',
  nif: 'That NIF',
  photoStorageKey: 'That photo',
};

/** Maps a unique-constraint violation on an identity field to a message worth reading. */
function mapIdentityConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? (error.meta!.target as string[]) : [];
    const label = IDENTITY_FIELD_LABEL[target[0]] ?? 'That value';
    return new ConflictException(`${label} is already in use by another person.`);
  }
  return error;
}

/** Every field a coordinator (via `UsersService`) may change, for the audit trail. */
const ACCOUNT_AUDITED_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'roles',
  'provider',
  'isActive',
  'phone',
  'birthDate',
  'joinedOn',
  'addressLine',
  'postalCode',
  'localityId',
  'redCrossNumber',
  'volunteerNumber',
  'nif',
  'citizenCardNumber',
  'bloodType',
  'emergencyContactName',
  'emergencyContactPhone',
];

/**
 * Account-level fields — `Action.MANAGE_USERS`, admin only. Everything else on
 * `UpdateUserDto` is personnel-level — `Action.MANAGE_PERSONNEL`, which a
 * coordinator also holds. `PATCH /users/:id` is deliberately left ungated at
 * the route (see `UsersController`) so one endpoint can serve both, with this
 * split enforced here instead — the same "ungated handler, service decides"
 * pattern `SchedulesService` uses for `getMyDuties`.
 */
const ACCOUNT_ONLY_FIELDS = ['email', 'roles', 'password', 'provider'] as const;

export const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  roles: true,
  provider: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  phone: true,
  birthDate: true,
  joinedOn: true,
  addressLine: true,
  postalCode: true,
  localityId: true,
  locality: {
    select: {
      id: true,
      name: true,
      municipalityId: true,
      municipality: {
        select: { id: true, ineCode: true, name: true, district: true, latitude: true, longitude: true },
      },
    },
  },
  redCrossNumber: true,
  volunteerNumber: true,
  nif: true,
  citizenCardNumber: true,
  bloodType: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  photoFilename: true,
  photoMimeType: true,
  photoByteSize: true,
  photoStorageKey: true,
  locale: true,
  certifications: { select: CERT_SELECT },
} satisfies Prisma.UserSelect;

// Hand-rolled rather than `Prisma.UserGetPayload<>`: Prisma's generated
// payload type renders enum columns as their own nominal `$Enums.X`, which
// does not structurally satisfy the shared enums. The template-literal form
// is what accepts both without a cast at every call site — see
// `WindowRow.category` in `availability-windows.service.ts` for the same trick.
interface PersonRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: `${UserRole}`[];
  provider: `${AuthProvider}`;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  phone: string | null;
  birthDate: Date | null;
  joinedOn: Date | null;
  addressLine: string | null;
  postalCode: string | null;
  localityId: string | null;
  locality: Parameters<typeof serializeLocality>[0] | null;
  redCrossNumber: string | null;
  volunteerNumber: string | null;
  nif: string | null;
  citizenCardNumber: string | null;
  bloodType: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoFilename: string | null;
  photoMimeType: string | null;
  photoByteSize: number | null;
  photoStorageKey: string | null;
  locale: string | null;
  certifications: CertRow[];
}

/** Prisma row → the shared `User` (personnel) shape, computed fields included. */
export function serializePerson(row: PersonRow, asOf: string = today()): SharedUser {
  const held = toHeldCertifications(row.certifications);

  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    roles: row.roles as SharedUserRole[],
    provider: row.provider as SharedAuthProvider,
    isActive: row.isActive,
    isDriver: holdsCertification(held, CertificationType.DRIVER, asOf),
    isActiveEmergencyOperational:
      holdsCertification(held, CertificationType.TAT, asOf) ||
      holdsCertification(held, CertificationType.TAS, asOf),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    phone: row.phone,
    birthDate: row.birthDate ? toIsoDate(row.birthDate) : null,
    joinedOn: row.joinedOn ? toIsoDate(row.joinedOn) : null,
    addressLine: row.addressLine,
    postalCode: row.postalCode,
    localityId: row.localityId,
    locality: row.locality ? serializeLocality(row.locality) : null,
    redCrossNumber: row.redCrossNumber,
    volunteerNumber: row.volunteerNumber,
    nif: row.nif,
    citizenCardNumber: row.citizenCardNumber,
    bloodType: row.bloodType as SharedBloodType | null,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    photoFilename: row.photoFilename,
    photoMimeType: row.photoMimeType,
    photoByteSize: row.photoByteSize,
    hasPhoto: row.photoStorageKey !== null,
    locale: row.locale as SharedUser['locale'],
    certifications: row.certifications.map(serializeCertification),
  };
}

export interface PersonnelFilters {
  q?: string;
  role?: SharedUserRole;
  isActive?: boolean;
  readiness?: 'OPERATIONAL' | 'NOT_OPERATIONAL';
  certification?: CertificationType;
  /** Someone holding at least one *effective* certification in this state — the dashboard alert tile's click-through. */
  certificationStatus?: Extract<CertificationStatus, 'EXPIRING' | 'EXPIRED'>;
  ids?: string[];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, perPage = 25, filters: PersonnelFilters = {}) {
    const where = this.buildWhere(filters);
    const orderBy = [{ firstName: 'asc' as const }, { lastName: 'asc' as const }];

    // `ids` is react-admin's `getMany` — it wants exactly those rows, not a page.
    if (filters.ids) {
      const rows = await this.prisma.user.findMany({ where, orderBy, select: PERSON_SELECT });
      const data = rows.map((row) => serializePerson(row));
      return { data, total: data.length, page: 1, perPage: data.length || 1 };
    }

    // Readiness and certification are derived (implication + expiry), not a
    // column a WHERE clause can test — filtered in memory after serializing.
    if (
      filters.readiness === undefined &&
      filters.certification === undefined &&
      filters.certificationStatus === undefined
    ) {
      const skip = (page - 1) * perPage;
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({ where, skip, take: perPage, orderBy, select: PERSON_SELECT }),
        this.prisma.user.count({ where }),
      ]);
      return { data: rows.map((row) => serializePerson(row)), total, page, perPage };
    }

    const asOf = today();
    const rows = await this.prisma.user.findMany({ where, orderBy, select: PERSON_SELECT });
    let people = rows.map((row) => serializePerson(row, asOf));
    if (filters.readiness === 'OPERATIONAL') {
      people = people.filter((person) => person.isActiveEmergencyOperational);
    } else if (filters.readiness === 'NOT_OPERATIONAL') {
      people = people.filter((person) => !person.isActiveEmergencyOperational);
    }
    if (filters.certification) {
      const type = filters.certification;
      people = people.filter((person) => holdsCertification(person.certifications ?? [], type, asOf));
    }
    if (filters.certificationStatus) {
      const status = filters.certificationStatus;
      people = people.filter((person) =>
        effectiveCertifications(person.certifications ?? [], asOf).some((cert) => cert.status === status),
      );
    }
    const total = people.length;
    const skip = (page - 1) * perPage;
    return { data: people.slice(skip, skip + perPage), total, page, perPage };
  }

  /** Counts of people whose *effective* certifications need attention — the dashboard tile. */
  async certificationAlerts() {
    const asOf = today();
    const rows = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { certifications: { select: { type: true, validUntil: true } } },
    });

    let expiring = 0;
    let expired = 0;
    for (const row of rows) {
      const held = toHeldCertifications(row.certifications);
      const effective = effectiveCertifications(held, asOf);
      if (effective.some((cert) => cert.status === 'EXPIRED')) expired += 1;
      else if (effective.some((cert) => cert.status === 'EXPIRING')) expiring += 1;
    }
    return { expiring, expired };
  }

  async findOne(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, select: PERSON_SELECT });
    if (!row) throw new NotFoundException(`User ${id} not found`);
    return serializePerson(row);
  }

  /** Full raw row, `passwordHash` included — for local-login comparison only. */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * OAuth login only ever authenticates an EXISTING account — it never
   * creates one. Accounts are admin-provisioned (`create`/`update` below);
   * letting a first-time Google/Microsoft sign-in silently create a user
   * would be self-registration via SSO, which is exactly what this closes.
   *
   * The first successful sign-in for a still-LOCAL account auto-links that
   * provider (an admin shouldn't need to already know the provider's opaque
   * `providerId` to provision someone for OAuth) and wipes `passwordHash` —
   * from then on the link is one-way: only an admin editing the account
   * directly can move it back to LOCAL (see `update`). A login attempt can
   * never do that, and can never relink an account already tied to a
   * *different* OAuth provider — both come back `null`, which the calling
   * strategy turns into an auth failure rather than an exception, since this
   * runs mid-redirect (see `GoogleAuthGuard`/`MicrosoftAuthGuard`).
   */
  async findOrLinkOAuthUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    provider: AuthProvider;
    providerId: string;
  }): Promise<User | null> {
    const existing = await this.prisma.user.findFirst({
      where: { provider: params.provider, providerId: params.providerId },
    });
    if (existing) return existing.isActive ? existing : null;

    const byEmail = await this.prisma.user.findUnique({ where: { email: params.email } });
    if (!byEmail || !byEmail.isActive) return null;
    if (byEmail.provider !== AuthProvider.LOCAL && byEmail.provider !== params.provider) {
      return null;
    }

    return this.prisma.user.update({
      where: { id: byEmail.id },
      data: { provider: params.provider, providerId: params.providerId, passwordHash: null },
    });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const provider = dto.provider ?? AuthProvider.LOCAL;
    // A GOOGLE/MICROSOFT account never gets a password, even if one was
    // typed into the form — it would just be dead credential material,
    // since `validateLocalUser` refuses any account whose provider isn't
    // LOCAL regardless.
    const passwordHash = provider === AuthProvider.LOCAL && dto.password ? await bcrypt.hash(dto.password, 12) : null;

    try {
      const row = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          roles: normalizeRoles(dto.roles ?? DEFAULT_USER_ROLES) as never[],
          provider,
          isActive: dto.isActive ?? true,
          phone: dto.phone,
          birthDate: dto.birthDate ? parseIsoDate(dto.birthDate) : undefined,
          joinedOn: dto.joinedOn ? parseIsoDate(dto.joinedOn) : undefined,
          addressLine: dto.addressLine,
          postalCode: dto.postalCode,
          localityId: dto.localityId,
          redCrossNumber: dto.redCrossNumber,
          volunteerNumber: dto.volunteerNumber,
          nif: dto.nif,
          citizenCardNumber: dto.citizenCardNumber,
          bloodType: dto.bloodType,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
        },
        select: PERSON_SELECT,
      });
      return serializePerson(row);
    } catch (error) {
      throw mapIdentityConflict(error);
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: { id: string; roles: SharedUserRole[] }) {
    // Cheap gate before the row is read at all. `PATCH /users/:id` is
    // deliberately ungated at the route, so without this, reading `before`
    // first would let any authenticated user probe which ids exist via
    // 404-vs-403.
    if (
      !hasPermission(actor.roles, Action.MANAGE_PERSONNEL) &&
      !hasPermission(actor.roles, Action.MANAGE_USERS)
    ) {
      throw new ForbiddenException("You may not edit this person's profile.");
    }

    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`User ${id} not found`);

    // "Present in the DTO" is not "being edited" — the edit form resubmits
    // every field it rendered (see `UserEdit`'s doc comment), which used to
    // 403 a coordinator out of their own screen for resaving an unchanged
    // email/roles alongside a real change. Only a value that actually
    // differs from the stored row counts as touching it.
    const touchesAccountFields =
      (dto.email !== undefined && dto.email !== before.email) ||
      (dto.provider !== undefined && dto.provider !== before.provider) ||
      (dto.roles !== undefined && !sameRoleSet(dto.roles, before.roles as SharedUserRole[])) ||
      (typeof dto.password === 'string' && dto.password.length > 0);
    const touchesPersonnelFields = Object.keys(dto).some(
      (key) =>
        !(ACCOUNT_ONLY_FIELDS as readonly string[]).includes(key) &&
        (dto as Record<string, unknown>)[key] !== undefined,
    );
    if (touchesAccountFields && !hasPermission(actor.roles, Action.MANAGE_USERS)) {
      throw new ForbiddenException('Only an administrator may change email, roles or password.');
    }
    if (touchesPersonnelFields && !hasPermission(actor.roles, Action.MANAGE_PERSONNEL)) {
      throw new ForbiddenException("You may not edit this person's profile.");
    }

    // A user losing their last SYSTEM_ADMIN role, or being deactivated while
    // holding it, would leave nobody able to grant it back. Deletion is
    // covered separately in `remove()`.
    const losingSystemAdmin =
      (before.roles as SharedUserRole[]).includes(SharedUserRole.SYSTEM_ADMIN) &&
      ((dto.roles !== undefined && !dto.roles.includes(SharedUserRole.SYSTEM_ADMIN)) ||
        dto.isActive === false);
    if (losingSystemAdmin) {
      await this.assertNotLastSystemAdmin(id);
    }

    // Moving an account to GOOGLE/MICROSOFT here is the one way back out of
    // the one-way lock `findOrLinkOAuthUser` puts an OAuth-linked account
    // into — an admin, not a login attempt. It also wipes any password so
    // there's no leftover credential material for a provider that isn't
    // LOCAL, same as account creation.
    const movingOffLocal = dto.provider !== undefined && dto.provider !== AuthProvider.LOCAL;
    const passwordHash = movingOffLocal
      ? null
      : dto.password
        ? await bcrypt.hash(dto.password, 12)
        : undefined;

    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.email && { email: dto.email }),
          ...(dto.firstName && { firstName: dto.firstName }),
          ...(dto.lastName && { lastName: dto.lastName }),
          ...(dto.roles && { roles: normalizeRoles(dto.roles) as never[] }),
          ...(dto.provider && { provider: dto.provider }),
          ...(passwordHash !== undefined && { passwordHash }),
          // Booleans need an explicit undefined check — `false` must persist.
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.birthDate !== undefined && { birthDate: dto.birthDate ? parseIsoDate(dto.birthDate) : null }),
          ...(dto.joinedOn !== undefined && { joinedOn: dto.joinedOn ? parseIsoDate(dto.joinedOn) : null }),
          ...(dto.addressLine !== undefined && { addressLine: dto.addressLine }),
          ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
          ...(dto.localityId !== undefined && { localityId: dto.localityId }),
          ...(dto.redCrossNumber !== undefined && { redCrossNumber: dto.redCrossNumber }),
          ...(dto.volunteerNumber !== undefined && { volunteerNumber: dto.volunteerNumber }),
          ...(dto.nif !== undefined && { nif: dto.nif }),
          ...(dto.citizenCardNumber !== undefined && { citizenCardNumber: dto.citizenCardNumber }),
          ...(dto.bloodType !== undefined && { bloodType: dto.bloodType }),
          ...(dto.emergencyContactName !== undefined && { emergencyContactName: dto.emergencyContactName }),
          ...(dto.emergencyContactPhone !== undefined && { emergencyContactPhone: dto.emergencyContactPhone }),
        },
        select: PERSON_SELECT,
      });

      await recordProfileChanges(this.prisma, {
        userId: id,
        changedById: actor.id,
        fields: ACCOUNT_AUDITED_FIELDS,
        before,
        after: row,
      });

      return serializePerson(row);
    } catch (error) {
      throw mapIdentityConflict(error);
    }
  }

  /**
   * Records that must outlive the person — an emergency report names its crew,
   * and that history is not rewritten because someone left — hold their row
   * with a `Restrict` foreign key. Reported as a conflict pointing at
   * deactivation rather than surfacing a raw constraint violation as a 500.
   */
  async remove(id: string) {
    const person = await this.findOne(id);
    if (person.roles.includes(SharedUserRole.SYSTEM_ADMIN)) {
      await this.assertNotLastSystemAdmin(id);
    }
    try {
      const row = await this.prisma.user.delete({ where: { id }, select: PERSON_SELECT });
      return serializePerson(row);
    } catch (error) {
      if (isStillReferenced(error)) {
        throw new ConflictException(
          'This person is named on records that must keep their history, such as ' +
            'emergency reports. Deactivate them instead of deleting them.',
        );
      }
      throw error;
    }
  }

  /**
   * Refuses to remove the only `SYSTEM_ADMIN` left — the role that grants
   * every other role, so losing the last holder is unrecoverable without
   * direct database access.
   */
  private async assertNotLastSystemAdmin(excludingId: string): Promise<void> {
    const otherAdmins = await this.prisma.user.count({
      where: { isActive: true, roles: { has: SharedUserRole.SYSTEM_ADMIN as never }, id: { not: excludingId } },
    });
    if (otherAdmins === 0) {
      throw new ApiConflictException(
        'LAST_SYSTEM_ADMIN',
        'This is the only System Administrator left — give someone else that role first.',
      );
    }
  }

  private buildWhere(filters: PersonnelFilters): Prisma.UserWhereInput {
    return {
      ...(filters.ids ? { id: { in: filters.ids } } : {}),
      // `?role=X` means "people who hold X", not "whose only role is X".
      ...(filters.role ? { roles: { has: filters.role as never } } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.q
        ? {
            OR: [
              { firstName: { contains: filters.q, mode: 'insensitive' as const } },
              { lastName: { contains: filters.q, mode: 'insensitive' as const } },
              { email: { contains: filters.q, mode: 'insensitive' as const } },
              { redCrossNumber: { contains: filters.q, mode: 'insensitive' as const } },
              { volunteerNumber: { contains: filters.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }
}

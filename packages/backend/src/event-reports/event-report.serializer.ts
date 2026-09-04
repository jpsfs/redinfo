import { Prisma } from '@prisma/client';
import {
  AbcdeFindings,
  AvdsLevel,
  EventLocationType,
  EventReport,
  EventReportAssessment,
  EventReportAttachment,
  EventReportAttachmentKind,
  EventReportCrewMember,
  EventReportInemSupportUnit,
  EventReportInput,
  EventReportMaterial,
  EventReportType,
  EventReportVehicle,
  EventReportVictim,
  Gender,
  InemSupportUnitType,
  InventoryItemType,
  RouteLeg,
  VITAL_KEYS,
  VictimDestinationKind,
  availabilityWindowLabel,
} from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
import { serializeLocality } from '../geography/geography.service';

const PERSON_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Everything a report is read with.
 *
 * One include for every read path — list, mine, and single — so a field can
 * never be present on one screen and quietly missing on another. Ordered by
 * `position` throughout: the sequence a crew entered people and vehicles in is
 * part of what the report says.
 */
export const EVENT_REPORT_INCLUDE = {
  locality: { include: { municipality: true } },
  crew: {
    include: { user: PERSON_SELECT },
    orderBy: { position: 'asc' },
  },
  vehicles: {
    include: { vehicle: { select: { id: true, licensePlate: true, numeroCauda: true } } },
    orderBy: { position: 'asc' },
  },
  victims: {
    include: { destinationHospital: { select: { id: true, name: true } } },
    orderBy: { position: 'asc' },
  },
  inemSupportUnits: {
    include: { hospital: { select: { id: true, name: true } } },
    orderBy: { position: 'asc' },
  },
  materials: {
    include: {
      materialItem: { select: { id: true, namePt: true, nameEn: true, unit: true, type: true } },
      vehicle: { select: { id: true, licensePlate: true, numeroCauda: true } },
    },
    orderBy: { position: 'asc' },
  },
  attachments: {
    include: { uploadedBy: PERSON_SELECT },
    orderBy: { createdAt: 'asc' },
  },
  assessments: { orderBy: { position: 'asc' } },
  createdBy: PERSON_SELECT,
  submittedBy: PERSON_SELECT,
  schedule: { include: { window: true } },
  liveRun: { select: { id: true } },
} satisfies Prisma.EventReportInclude;

export type EventReportRow = Prisma.EventReportGetPayload<{
  include: typeof EVENT_REPORT_INCLUDE;
}>;

function serializeCrewMember(row: EventReportRow['crew'][number]): EventReportCrewMember {
  return {
    id: row.id,
    userId: row.userId,
    user: row.user,
    roleName: row.roleName,
    position: row.position,
  };
}

function serializeVehicle(row: EventReportRow['vehicles'][number]): EventReportVehicle {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    vehicle: row.vehicle,
    kilometres: row.kilometres,
    position: row.position,
    routeLegs: (row.routeLegs as RouteLeg[] | null) ?? null,
    isOverridden: row.isOverridden,
  };
}

function serializeMaterial(row: EventReportRow['materials'][number]): EventReportMaterial {
  return {
    id: row.id,
    materialItemId: row.materialItemId,
    materialItem: { ...row.materialItem, type: row.materialItem.type as InventoryItemType },
    vehicleId: row.vehicleId,
    vehicle: row.vehicle,
    quantity: row.quantity,
    position: row.position,
  };
}

/**
 * One set of observations.
 *
 * `temperature` is the only `Decimal` here, and it comes back from Prisma as a
 * `Decimal` object rather than a number — so it is converted rather than
 * serialised, or every client would receive `{"s":1,"e":1,"d":[368]}` where it
 * expected `36.8`.
 */
function serializeAssessment(
  row: EventReportRow['assessments'][number],
): EventReportAssessment {
  const vitals = {} as Record<string, number | null>;
  for (const key of VITAL_KEYS) {
    const value = row[key];
    vitals[key] =
      value === null || value === undefined
        ? null
        : typeof value === 'number'
          ? value
          : Number(value);
  }

  return {
    id: row.id,
    position: row.position,
    takenAt: row.takenAt.toISOString(),
    bodyPosition: row.bodyPosition,
    avds: row.avds as AvdsLevel | null,
    ...vitals,
  } as EventReportAssessment;
}

function serializeVictim(row: EventReportRow['victims'][number]): EventReportVictim {
  return {
    id: row.id,
    position: row.position,
    gender: row.gender as Gender,
    age: row.age,
    destinationKind: row.destinationKind as VictimDestinationKind,
    destinationHospitalId: row.destinationHospitalId,
    destinationHospital: row.destinationHospital,
    hospitalEpisodeNumber: row.hospitalEpisodeNumber,
  };
}

function serializeInemSupportUnit(
  row: EventReportRow['inemSupportUnits'][number],
): EventReportInemSupportUnit {
  return {
    id: row.id,
    position: row.position,
    unitType: row.unitType as InemSupportUnitType,
    hospitalId: row.hospitalId,
    hospital: row.hospital,
  };
}

function serializeAttachment(
  row: EventReportRow['attachments'][number],
): EventReportAttachment {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    kind: row.kind as EventReportAttachmentKind,
    uploadedById: row.uploadedById,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Null timestamps stay null — "not marked" is a fact, not a missing value. */
const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

/**
 * A report as every client reads it.
 *
 * `shiftLabel` is passed in rather than looked up: resolving a shift's clock
 * span means loading the window's per-day pattern, which is worth doing for
 * one report and not for a page of forty. A list therefore shows the shift's
 * date, slot and rota; the single view adds the hours.
 */
export function serializeEventReport(row: EventReportRow, shiftLabel?: string): EventReport {
  return {
    id: row.id,
    type: row.type as EventReportType,
    number: row.number,
    legacyNumber: row.legacyNumber,
    year: row.year,
    occurredOn: toIsoDate(row.occurredOn),
    startedAt: row.startedAt.toISOString(),
    endedAt: iso(row.endedAt),
    externalReference: row.externalReference,
    locationType: row.locationType as EventLocationType,
    localityId: row.localityId,
    ...(row.locality ? { locality: serializeLocality(row.locality) } : {}),

    activationAt: iso(row.activationAt),
    sceneArrivalAt: iso(row.sceneArrivalAt),
    sceneDepartureAt: iso(row.sceneDepartureAt),
    hospitalArrivalAt: iso(row.hospitalArrivalAt),
    availableAt: iso(row.availableAt),

    shift:
      row.scheduleId && row.shiftDate && row.shiftSlot !== null
        ? {
            scheduleId: row.scheduleId,
            date: toIsoDate(row.shiftDate),
            slot: row.shiftSlot,
            ...(shiftLabel ? { label: shiftLabel } : {}),
            ...(row.schedule?.window
              ? {
                  windowLabel: availabilityWindowLabel({
                    category: row.schedule.window.category,
                    name: row.schedule.window.name,
                  }),
                }
              : {}),
          }
        : null,

    operationalReport: row.operationalReport,

    chamuCircumstances: row.chamuCircumstances,
    chamuHistory: row.chamuHistory,
    chamuAllergies: row.chamuAllergies,
    chamuMedication: row.chamuMedication,
    chamuLastMeal: row.chamuLastMeal,
    abcde: (row.abcde as AbcdeFindings | null) ?? null,

    crew: row.crew.map(serializeCrewMember),
    vehicles: row.vehicles.map(serializeVehicle),
    victims: row.victims.map(serializeVictim),
    inemSupportUnits: row.inemSupportUnits.map(serializeInemSupportUnit),
    materials: row.materials.map(serializeMaterial),
    attachments: row.attachments.map(serializeAttachment),
    assessments: row.assessments.map(serializeAssessment),

    submittedAt: iso(row.submittedAt),
    submittedById: row.submittedById,
    submittedBy: row.submittedBy,
    liveRunId: row.liveRun?.id ?? null,

    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A stored report back in the shape its own validator reads.
 *
 * Needed because submitting a report has to check that what is *already stored*
 * is coherent — a draft closed out of a live run in a dead spot may be missing
 * things — and `validateEventReport` is the one place that rule lives. The
 * frontend has the same function under the name `draftFromReport`; keeping the
 * two in one shape is what stops a report the wizard accepted being refused at
 * submission for a reason nobody saw.
 */
export function reportRowToInput(row: EventReportRow): EventReportInput {
  const report = serializeEventReport(row);
  return {
    type: report.type,
    occurredOn: report.occurredOn,
    startedAt: report.startedAt,
    endedAt: report.endedAt ?? null,
    externalReference: report.externalReference ?? null,
    locationType: report.locationType,
    localityId: report.localityId,
    activationAt: report.activationAt ?? null,
    sceneArrivalAt: report.sceneArrivalAt ?? null,
    sceneDepartureAt: report.sceneDepartureAt ?? null,
    hospitalArrivalAt: report.hospitalArrivalAt ?? null,
    availableAt: report.availableAt ?? null,
    shift: report.shift
      ? {
          scheduleId: report.shift.scheduleId,
          date: report.shift.date,
          slot: report.shift.slot,
        }
      : null,
    operationalReport: report.operationalReport,
    crew: report.crew.map((member) => ({
      userId: member.userId,
      roleName: member.roleName ?? null,
    })),
    vehicles: report.vehicles.map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      kilometres: vehicle.kilometres,
      routeLegs: vehicle.routeLegs ?? null,
      isOverridden: vehicle.isOverridden,
    })),
    victims: report.victims.map((victim) => ({
      gender: victim.gender,
      age: victim.age,
      destinationKind: victim.destinationKind,
      destinationHospitalId: victim.destinationHospitalId ?? null,
    })),
    inemSupportUnits: report.inemSupportUnits.map((unit) => ({
      unitType: unit.unitType,
      hospitalId: unit.hospitalId,
    })),
    materials: report.materials.map((material) => ({
      materialItemId: material.materialItemId,
      itemType: material.materialItem?.type ?? InventoryItemType.COUNTABLE,
      vehicleId: material.vehicleId,
      quantity: material.quantity,
    })),
    chamuCircumstances: report.chamuCircumstances ?? null,
    chamuHistory: report.chamuHistory ?? null,
    chamuAllergies: report.chamuAllergies ?? null,
    chamuMedication: report.chamuMedication ?? null,
    chamuLastMeal: report.chamuLastMeal ?? null,
    abcde: report.abcde ?? null,
    assessments: report.assessments.map((assessment) => {
      const { id: _id, position: _position, ...rest } = assessment;
      return rest;
    }),
  };
}

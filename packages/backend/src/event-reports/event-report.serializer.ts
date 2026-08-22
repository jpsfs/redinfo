import { Prisma } from '@prisma/client';
import {
  EventLocationType,
  EventReport,
  EventReportAttachment,
  EventReportCrewMember,
  EventReportType,
  EventReportVehicle,
  EventReportVictim,
  Gender,
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
  attachments: {
    include: { uploadedBy: PERSON_SELECT },
    orderBy: { createdAt: 'asc' },
  },
  createdBy: PERSON_SELECT,
  schedule: { include: { window: true } },
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
  };
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

    crew: row.crew.map(serializeCrewMember),
    vehicles: row.vehicles.map(serializeVehicle),
    victims: row.victims.map(serializeVictim),
    attachments: row.attachments.map(serializeAttachment),

    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

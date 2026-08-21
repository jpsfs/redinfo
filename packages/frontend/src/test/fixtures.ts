import {
  AvailabilityMatrixDay,
  AvailabilityMatrixPerson,
  AvailabilityMatrixResponse,
  AvailabilityWindow,
  AvailabilityWindowCategory,
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  coverageLevel,
  DayShiftPattern,
  DEFAULT_EMERGENCY_WINDOW_ROLES,
  defaultShiftsForDayType,
  MyAvailabilityResponse,
  roleRequiresDriverCertification,
  toShiftDefinitions,
} from '@redinfo/shared';
import { isoDateRange, parseIsoDate } from '../utils/dates';

/**
 * Test data for the availability screens.
 *
 * The window deliberately spans Mon 28 Sep → Mon 5 Oct 2026: five workdays
 * (one shift), a Saturday and Sunday (two shifts), and a holiday Monday (two
 * shifts) — every day type the default grid has.
 */
export const WINDOW_START = '2026-09-28';
export const WINDOW_END = '2026-10-05';
export const HOLIDAY_DATE = '2026-10-05';
export const HOLIDAY_NAME = 'Implantação da República';

/** The default emergency crew, as the API returns it for a window. */
export const EMERGENCY_ROLES: AvailabilityWindowRole[] = DEFAULT_EMERGENCY_WINDOW_ROLES.map(
  (role, index) => ({
    ...role,
    id: `role-${index + 1}`,
    windowId: 'win-1',
    order: index,
    requiresDriverCertification: roleRequiresDriverCertification(role.name),
  }),
);

export const OPEN_WINDOW: AvailabilityWindow = {
  id: 'win-1',
  startDate: WINDOW_START,
  endDate: WINDOW_END,
  category: AvailabilityWindowCategory.EMERGENCY,
  name: 'Emergency - October',
  roles: EMERGENCY_ROLES,
  status: AvailabilityWindowStatus.OPEN,
  openedById: 'coord-1',
  openedBy: { id: 'coord-1', firstName: 'Maria', lastName: 'Santos' },
  openedAt: '2026-09-26T09:14:00.000Z',
  closedById: null,
  closedBy: null,
  closedAt: null,
  createdAt: '2026-09-26T09:14:00.000Z',
  updatedAt: '2026-09-26T09:14:00.000Z',
};

export const CLOSED_WINDOW: AvailabilityWindow = {
  ...OPEN_WINDOW,
  status: AvailabilityWindowStatus.CLOSED,
  closedById: 'coord-1',
  closedBy: { id: 'coord-1', firstName: 'Maria', lastName: 'Santos' },
  closedAt: '2026-10-05T23:59:00.000Z',
};

/** A second open window, of another category and with no name of its own. */
export const LOCAL_SUPPORT_WINDOW: AvailabilityWindow = {
  ...OPEN_WINDOW,
  id: 'win-2',
  category: AvailabilityWindowCategory.LOCAL_SUPPORT,
  name: null,
  // Another category starts with no roles: they are whoever opens it to decide.
  roles: [],
};

/** A window on the default grid, as the API materialises one. */
export function patternFor(date: string): DayShiftPattern {
  const day = parseIsoDate(date).getUTCDay();
  const isWeekend = day === 0 || day === 6;
  const isHoliday = date === HOLIDAY_DATE;
  const dayType = isHoliday ? 'holiday' : isWeekend ? 'weekend' : 'workday';
  return {
    date,
    isWeekend,
    isHoliday,
    holidayName: isHoliday ? HOLIDAY_NAME : null,
    shifts: toShiftDefinitions(defaultShiftsForDayType(dayType)),
  };
}

export function calendarFor(from: string, to: string): DayShiftPattern[] {
  return isoDateRange(from, to).map(patternFor);
}

export function myAvailability(
  overrides: Partial<MyAvailabilityResponse> = {},
): MyAvailabilityResponse {
  return {
    window: OPEN_WINDOW,
    windows: [OPEN_WINDOW],
    canSubmit: true,
    declined: false,
    calendar: calendarFor(WINDOW_START, WINDOW_END),
    entries: [],
    ...overrides,
  };
}

export const ANA: AvailabilityMatrixPerson = {
  id: 'u-ana',
  firstName: 'Ana',
  lastName: 'Silva',
  isDriver: true,
  responseStatus: 'submitted',
};
export const BRUNO: AvailabilityMatrixPerson = {
  id: 'u-bruno',
  firstName: 'Bruno',
  lastName: 'Costa',
  isDriver: true,
  responseStatus: 'submitted',
};
export const CARLA: AvailabilityMatrixPerson = {
  id: 'u-carla',
  firstName: 'Carla',
  lastName: 'Ferreira',
  isDriver: false,
  responseStatus: 'submitted',
};
export const MARTA: AvailabilityMatrixPerson = {
  id: 'u-marta',
  firstName: 'Marta',
  lastName: 'Oliveira',
  isDriver: false,
  responseStatus: 'declined',
};
export const RUI: AvailabilityMatrixPerson = {
  id: 'u-rui',
  firstName: 'Rui',
  lastName: 'Nunes',
  isDriver: false,
  responseStatus: 'pending',
};

const PERSONNEL = [ANA, BRUNO, CARLA, MARTA, RUI];

/** Availability per `date|slot`, used to build the matrix days. */
const AVAILABILITY: Record<string, string[]> = {
  // 4 available, 2 drivers → green
  '2026-09-28|1': [ANA.id, BRUNO.id, CARLA.id, RUI.id],
  // 3 available, 2 drivers → green
  '2026-10-03|1': [ANA.id, BRUNO.id, CARLA.id],
  // 1 available, 0 drivers → red
  '2026-10-03|2': [CARLA.id],
  // 2 available, 1 driver → yellow
  '2026-10-04|1': [ANA.id, CARLA.id],
};

function matrixDay(date: string): AvailabilityMatrixDay {
  const pattern = patternFor(date);
  return {
    date,
    isWeekend: pattern.isWeekend,
    isHoliday: pattern.isHoliday,
    holidayName: pattern.holidayName,
    shifts: pattern.shifts.map((shift) => {
      const availableUserIds = AVAILABILITY[`${date}|${shift.slot}`] ?? [];
      const driverCount = availableUserIds.filter(
        (id) => PERSONNEL.find((person) => person.id === id)?.isDriver,
      ).length;
      return {
        slot: shift.slot,
        label: shift.label,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
        vehiclesNeeded: shift.vehiclesNeeded,
        availableCount: availableUserIds.length,
        driverCount,
        coverageLevel: coverageLevel(
          availableUserIds.length,
          driverCount,
          shift.vehiclesNeeded,
        ),
        availableUserIds,
      };
    }),
  };
}

export function matrixResponse(
  overrides: Partial<AvailabilityMatrixResponse> = {},
): AvailabilityMatrixResponse {
  return {
    window: OPEN_WINDOW,
    personnel: PERSONNEL,
    days: isoDateRange(WINDOW_START, WINDOW_END).map(matrixDay),
    responseStats: { submitted: 3, declined: 1, pending: 1, total: 5 },
    ...overrides,
  };
}

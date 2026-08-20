import {
  AvailabilityMatrixDay,
  AvailabilityMatrixPerson,
  AvailabilityMatrixResponse,
  AvailabilityWindow,
  AvailabilityWindowStatus,
  coverageLevel,
  DayShiftPattern,
  MyAvailabilityResponse,
  ShiftCode,
  SHIFT_DEFINITIONS,
} from '@redinfo/shared';
import { isoDateRange, parseIsoDate } from '../utils/dates';

/**
 * Test data for the availability screens.
 *
 * The window deliberately spans Mon 28 Sep → Mon 5 Oct 2026: five workdays
 * (one shift), a Saturday and Sunday (two shifts), and a holiday Monday (two
 * shifts) — every day type the shift grid has.
 */
export const WINDOW_START = '2026-09-28';
export const WINDOW_END = '2026-10-05';
export const HOLIDAY_DATE = '2026-10-05';
export const HOLIDAY_NAME = 'Implantação da República';

export const OPEN_WINDOW: AvailabilityWindow = {
  id: 'win-1',
  startDate: WINDOW_START,
  endDate: WINDOW_END,
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

/** The same 1-shift/2-shift rule the backend applies, for building fixtures. */
export function patternFor(date: string): DayShiftPattern {
  const day = parseIsoDate(date).getUTCDay();
  const isWeekend = day === 0 || day === 6;
  const isHoliday = date === HOLIDAY_DATE;
  const codes =
    isWeekend || isHoliday
      ? [ShiftCode.MORNING, ShiftCode.AFTERNOON]
      : [ShiftCode.EVENING];
  return {
    date,
    isWeekend,
    isHoliday,
    holidayName: isHoliday ? HOLIDAY_NAME : null,
    shifts: codes.map((code) => SHIFT_DEFINITIONS[code]),
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

/** Availability per `date|shiftCode`, used to build the matrix days. */
const AVAILABILITY: Record<string, string[]> = {
  // 4 available, 2 drivers → green
  '2026-09-28|EVENING': [ANA.id, BRUNO.id, CARLA.id, RUI.id],
  // 3 available, 2 drivers → green
  '2026-10-03|MORNING': [ANA.id, BRUNO.id, CARLA.id],
  // 1 available, 0 drivers → red
  '2026-10-03|AFTERNOON': [CARLA.id],
  // 2 available, 1 driver → yellow
  '2026-10-04|MORNING': [ANA.id, CARLA.id],
};

function matrixDay(date: string): AvailabilityMatrixDay {
  const pattern = patternFor(date);
  return {
    date,
    isWeekend: pattern.isWeekend,
    isHoliday: pattern.isHoliday,
    holidayName: pattern.holidayName,
    shifts: pattern.shifts.map((shift) => {
      const availableUserIds = AVAILABILITY[`${date}|${shift.code}`] ?? [];
      const driverCount = availableUserIds.filter(
        (id) => PERSONNEL.find((person) => person.id === id)?.isDriver,
      ).length;
      return {
        shiftCode: shift.code,
        label: shift.label,
        availableCount: availableUserIds.length,
        driverCount,
        coverageLevel: coverageLevel(availableUserIds.length, driverCount),
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

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_SHIFTS_PER_DAY, MINUTES_PER_DAY, toMinuteOfDay } from '@redinfo/shared';
import {
  copyShiftsTo,
  countCopyTargets,
  DayShiftEditor,
  WindowDayDraft,
} from './DayShiftEditor';

/** Minutes from midnight, so the expectations read in wall-clock time. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

/**
 * Mon 28 Sep → Sun 4 Oct 2026 plus the holiday Monday: two working days, a
 * weekend, and a holiday that falls on a weekday — the four cases the copy
 * actions have to tell apart.
 */
function drafts(): WindowDayDraft[] {
  return [
    {
      date: '2026-09-28',
      isWeekend: false,
      isHoliday: false,
      shifts: [{ startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 }],
    },
    {
      date: '2026-09-29',
      isWeekend: false,
      isHoliday: false,
      shifts: [{ startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 }],
    },
    {
      date: '2026-10-03',
      isWeekend: true,
      isHoliday: false,
      shifts: [
        { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
        { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
      ],
    },
    {
      date: '2026-10-05',
      isWeekend: false,
      isHoliday: true,
      holidayName: 'Implantação da República',
      shifts: [
        { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
        { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
      ],
    },
  ];
}

const shiftsOn = (days: WindowDayDraft[], date: string) =>
  days.find((day) => day.date === date)!.shifts;

/** Type a time into a native time input, the way the picker commits one. */
const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

// ─── the copy rule ─────────────────────────────────────────────────────────────

describe('copyShiftsTo', () => {
  it('copies to every working day, leaving weekends and holidays alone', () => {
    const source = {
      ...drafts()[0],
      shifts: [{ startMinute: at(6), endMinute: at(10), vehiclesNeeded: 1 }],
    };
    const days = [source, ...drafts().slice(1)];

    const result = copyShiftsTo(days, '2026-09-28', 'workdays');

    expect(shiftsOn(result, '2026-09-29')).toEqual([
      { startMinute: at(6), endMinute: at(10), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(result, '2026-10-03')).toEqual(shiftsOn(days, '2026-10-03'));
    expect(shiftsOn(result, '2026-10-05')).toEqual(shiftsOn(days, '2026-10-05'));
  });

  it('treats a holiday on a weekday as a non-working day', () => {
    const days = drafts();

    const result = copyShiftsTo(days, '2026-10-03', 'nonWorkdays');

    expect(shiftsOn(result, '2026-10-05')).toEqual(shiftsOn(days, '2026-10-03'));
    expect(shiftsOn(result, '2026-09-28')).toEqual([
      { startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('copies to every day when asked for all of them', () => {
    const source = {
      ...drafts()[0],
      shifts: [{ startMinute: at(9, 30), endMinute: at(13), vehiclesNeeded: 1 }],
    };
    const days = [source, ...drafts().slice(1)];

    const result = copyShiftsTo(days, '2026-09-28', 'all');

    expect(result.every((day) => day.shifts.length === 1)).toBe(true);
    expect(result.every((day) => day.shifts[0].startMinute === at(9, 30))).toBe(true);
  });

  it('copies an empty day, which is how you clear a run of days', () => {
    const days = [{ ...drafts()[0], shifts: [] }, ...drafts().slice(1)];

    const result = copyShiftsTo(days, '2026-09-28', 'workdays');

    expect(shiftsOn(result, '2026-09-29')).toEqual([]);
  });

  it('deep-copies, so editing one day afterwards cannot change another', () => {
    const days = copyShiftsTo(drafts(), '2026-09-28', 'workdays');

    shiftsOn(days, '2026-09-28')[0].startMinute = at(6);

    expect(shiftsOn(days, '2026-09-29')[0].startMinute).toBe(at(20));
  });

  it('is a no-op for an unknown source date', () => {
    const days = drafts();
    expect(copyShiftsTo(days, '2026-12-25', 'all')).toBe(days);
  });
});

describe('countCopyTargets', () => {
  it('counts each set of days the actions offer', () => {
    const days = drafts();
    expect(countCopyTargets(days, 'workdays')).toBe(2);
    expect(countCopyTargets(days, 'nonWorkdays')).toBe(2);
    expect(countCopyTargets(days, 'all')).toBe(4);
  });
});

// ─── the table ─────────────────────────────────────────────────────────────────

describe('DayShiftEditor', () => {
  function renderEditor(days = drafts()) {
    const onChange = vi.fn();
    const view = render(<DayShiftEditor days={days} onChange={onChange} />);
    return { onChange, view };
  }

  it('lists every day with its type and shifts', () => {
    renderEditor();

    expect(screen.getByText('Mon, 28 Sep')).toBeInTheDocument();
    expect(screen.getByText('Sat, 3 Oct')).toBeInTheDocument();
    expect(screen.getByText('Holiday · Implantação da República')).toBeInTheDocument();
    expect(screen.getAllByText('Workday')).toHaveLength(2);
    expect(screen.getByLabelText('Mon, 28 Sep shift 1 start')).toHaveValue('20:00');
  });

  it('uses time inputs, so each platform offers its own picker', () => {
    renderEditor();

    const input = screen.getByLabelText('Mon, 28 Sep shift 1 start');
    expect(input).toHaveAttribute('type', 'time');
    // Minute granularity, which is the point of not using hour dropdowns.
    expect(input).toHaveAttribute('step', '60');
  });

  it('shows an end of midnight as 00:00, which is all a time input can hold', () => {
    renderEditor();

    expect(screen.getByLabelText('Sat, 3 Oct shift 2 end')).toHaveValue('00:00');
  });

  it('changes one shift’s time without touching the others', () => {
    const { onChange } = renderEditor();

    setTime('Mon, 28 Sep shift 1 start', '18:00');

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-09-28')).toEqual([
      { startMinute: at(18), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(updated, '2026-09-29')).toEqual([
      { startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('keeps a time that falls part-way through an hour', () => {
    const { onChange } = renderEditor();

    setTime('Sat, 3 Oct shift 1 start', '08:45');

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-10-03')[0]).toEqual({
      startMinute: at(8, 45),
      endMinute: at(16),
      vehiclesNeeded: 1,
    });
  });

  it('reads 00:00 as end-of-day for an end time', () => {
    const { onChange } = renderEditor();

    setTime('Sat, 3 Oct shift 1 end', '00:00');

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-10-03')[0].endMinute).toBe(MINUTES_PER_DAY);
  });

  it('reads 00:00 as midnight itself for a start time', () => {
    const { onChange } = renderEditor();

    setTime('Sat, 3 Oct shift 1 start', '00:00');

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-10-03')[0].startMinute).toBe(0);
  });

  it('ignores a cleared field rather than inventing a time', () => {
    const { onChange } = renderEditor();

    setTime('Mon, 28 Sep shift 1 start', '');

    expect(onChange).not.toHaveBeenCalled();
  });

  // ── vehicles ───────────────────────────────────────────────────────────────

  it('shows the vehicles each shift needs', () => {
    renderEditor();

    expect(screen.getByLabelText('Mon, 28 Sep shift 1 vehicles')).toHaveValue(1);
    expect(screen.getByLabelText('Sat, 3 Oct shift 2 vehicles')).toHaveValue(1);
  });

  it('changes the vehicles of one shift only', () => {
    const { onChange } = renderEditor();

    fireEvent.change(screen.getByLabelText('Sat, 3 Oct shift 1 vehicles'), {
      target: { value: '3' },
    });

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-10-03')).toEqual([
      { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 3 },
      { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('accepts none, for a shift that needs people but no vehicle', () => {
    const { onChange } = renderEditor();

    fireEvent.change(screen.getByLabelText('Mon, 28 Sep shift 1 vehicles'), {
      target: { value: '0' },
    });

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-09-28')[0].vehiclesNeeded).toBe(0);
  });

  it('clamps a count outside the allowed range instead of saving it', () => {
    const { onChange } = renderEditor();

    fireEvent.change(screen.getByLabelText('Mon, 28 Sep shift 1 vehicles'), {
      target: { value: '-4' },
    });
    expect(
      (onChange.mock.calls[0][0] as WindowDayDraft[])[0].shifts[0].vehiclesNeeded,
    ).toBe(0);

    fireEvent.change(screen.getByLabelText('Mon, 28 Sep shift 1 vehicles'), {
      target: { value: '99' },
    });
    expect(
      (onChange.mock.calls[1][0] as WindowDayDraft[])[0].shifts[0].vehiclesNeeded,
    ).toBe(10);
  });

  it('copies the vehicle counts along with the times', async () => {
    const days = [
      {
        ...drafts()[0],
        shifts: [{ startMinute: at(19), endMinute: at(23), vehiclesNeeded: 2 }],
      },
      ...drafts().slice(1),
    ];
    const { onChange } = renderEditor(days);

    await userEvent.click(
      screen.getByLabelText('Copy Mon, 28 Sep shifts to other days'),
    );
    await userEvent.click(screen.getByText('All working days (2)'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-09-29')).toEqual([
      { startMinute: at(19), endMinute: at(23), vehiclesNeeded: 2 },
    ]);
  });

  it('gives a newly added shift one vehicle', async () => {
    const days = [{ ...drafts()[0], shifts: [] }, ...drafts().slice(1)];
    const { onChange } = renderEditor(days);

    await userEvent.click(screen.getByLabelText('Add a shift to Mon, 28 Sep'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-09-28')[0].vehiclesNeeded).toBe(1);
  });

  it('adds a shift after the last one, so it cannot start out overlapping', async () => {
    const { onChange } = renderEditor();

    await userEvent.click(screen.getByLabelText('Add a shift to Sat, 3 Oct'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    // The Saturday already runs to midnight, so the new shift is clamped there.
    expect(shiftsOn(updated, '2026-10-03')).toEqual([
      { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
      { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
      { startMinute: at(23), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('adds a shift to an empty day starting at 08:00', async () => {
    const days = [{ ...drafts()[0], shifts: [] }, ...drafts().slice(1)];
    const { onChange } = renderEditor(days);

    await userEvent.click(screen.getByLabelText('Add a shift to Mon, 28 Sep'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-09-28')).toEqual([
      { startMinute: at(8), endMinute: at(12), vehiclesNeeded: 1 },
    ]);
  });

  it('stops adding shifts at the per-day maximum', () => {
    const packed = Array.from({ length: MAX_SHIFTS_PER_DAY }, (_, index) => ({
      startMinute: at(index),
      endMinute: at(index + 1),
      vehiclesNeeded: 1,
    }));
    renderEditor([{ ...drafts()[0], shifts: packed }, ...drafts().slice(1)]);

    expect(screen.getByLabelText('Add a shift to Mon, 28 Sep')).toBeDisabled();
    expect(screen.getByLabelText('Add a shift to Sat, 3 Oct')).toBeEnabled();
  });

  it('removes a single shift', async () => {
    const { onChange } = renderEditor();

    await userEvent.click(screen.getByLabelText('Remove Sat, 3 Oct shift 1'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-10-03')).toEqual([
      { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('shows a day with no shifts as needing nobody', () => {
    renderEditor([{ ...drafts()[0], shifts: [] }, ...drafts().slice(1)]);

    expect(
      screen.getByText('No shifts — nobody is asked to cover this day.'),
    ).toBeInTheDocument();
  });

  it('flags overlapping shifts on the row itself', () => {
    renderEditor([
      {
        ...drafts()[0],
        shifts: [
          { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
          { startMinute: at(12), endMinute: at(20), vehiclesNeeded: 1 },
        ],
      },
      ...drafts().slice(1),
    ]);

    expect(
      screen.getByText('Shifts 08:00–16:00 and 12:00–20:00 overlap.'),
    ).toBeInTheDocument();
  });

  it('flags an overlap of a single minute', () => {
    renderEditor([
      {
        ...drafts()[0],
        shifts: [
          { startMinute: at(8), endMinute: at(16, 1), vehiclesNeeded: 1 },
          { startMinute: at(16), endMinute: at(20), vehiclesNeeded: 1 },
        ],
      },
      ...drafts().slice(1),
    ]);

    expect(
      screen.getByText('Shifts 08:00–16:01 and 16:00–20:00 overlap.'),
    ).toBeInTheDocument();
  });

  it('flags a shift that ends before it starts', () => {
    renderEditor([
      { ...drafts()[0], shifts: [{ startMinute: at(20), endMinute: at(8), vehiclesNeeded: 1 }] },
      ...drafts().slice(1),
    ]);

    expect(
      screen.getByText('A shift must end after it starts (got 20:00–08:00).'),
    ).toBeInTheDocument();
  });

  // ── the copy actions ───────────────────────────────────────────────────────

  it('offers the three copy targets with how many days each covers', async () => {
    renderEditor();

    await userEvent.click(
      screen.getByLabelText('Copy Mon, 28 Sep shifts to other days'),
    );
    const menu = screen.getByRole('menu');

    expect(within(menu).getByText('All working days (2)')).toBeInTheDocument();
    expect(within(menu).getByText('All weekends & holidays (2)')).toBeInTheDocument();
    expect(within(menu).getByText('All days (4)')).toBeInTheDocument();
  });

  it('copies the row’s shifts to all working days', async () => {
    const days = [
      { ...drafts()[0], shifts: [{ startMinute: at(19), endMinute: at(23, 30), vehiclesNeeded: 1 }] },
      ...drafts().slice(1),
    ];
    const { onChange } = renderEditor(days);

    await userEvent.click(
      screen.getByLabelText('Copy Mon, 28 Sep shifts to other days'),
    );
    await userEvent.click(screen.getByText('All working days (2)'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(shiftsOn(updated, '2026-09-29')).toEqual([
      { startMinute: at(19), endMinute: at(23, 30), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(updated, '2026-10-03')).toHaveLength(2);
  });

  it('copies to all days when asked, and closes the menu', async () => {
    const { onChange } = renderEditor();

    await userEvent.click(screen.getByLabelText('Copy Sat, 3 Oct shifts to other days'));
    await userEvent.click(screen.getByText('All days (4)'));

    const updated = onChange.mock.calls[0][0] as WindowDayDraft[];
    expect(updated.every((day) => day.shifts.length === 2)).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disables every control while saving', () => {
    render(<DayShiftEditor days={drafts()} onChange={vi.fn()} disabled />);

    expect(screen.getByLabelText('Mon, 28 Sep shift 1 start')).toBeDisabled();
    expect(screen.getByLabelText('Add a shift to Mon, 28 Sep')).toBeDisabled();
    expect(screen.getByLabelText('Remove Mon, 28 Sep shift 1')).toBeDisabled();
    expect(
      screen.getByLabelText('Copy Mon, 28 Sep shifts to other days'),
    ).toBeDisabled();
  });
});

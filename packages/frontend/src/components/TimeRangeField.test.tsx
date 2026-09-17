import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../i18n/i18nProvider';
import { TimeRangeField } from './TimeRangeField';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const renderField = (props: Partial<Parameters<typeof TimeRangeField>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <TimeRangeField startMinute={19 * 60} endMinute={21 * 60} onChange={onChange} {...props} />
    </AdminContext>,
  );
  return { onChange };
};

describe('TimeRangeField', () => {
  it('shows the derived duration', () => {
    renderField();
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('recomputes the duration when the start time changes', () => {
    const { onChange } = renderField();
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '20:00' } });
    expect(onChange).toHaveBeenCalledWith({ startMinute: 20 * 60, endMinute: 21 * 60, minutes: 60 });
  });

  it('recomputes the duration when the end time changes', () => {
    const { onChange } = renderField();
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '20:00' } });
    expect(onChange).toHaveBeenCalledWith({ startMinute: 19 * 60, endMinute: 20 * 60, minutes: 60 });
  });

  it('wraps past midnight', () => {
    renderField({ startMinute: 22 * 60, endMinute: 30 });
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });
});

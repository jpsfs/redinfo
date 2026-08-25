import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from './i18nProvider';
import { useIntlLocale } from './useIntlLocale';

const renderWithLocale = (locale: 'pt' | 'en') => {
  const i18nProvider = polyglotI18nProvider(messages, locale);
  return renderHook(() => useIntlLocale(), {
    wrapper: ({ children }) => (
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        {children}
      </AdminContext>
    ),
  });
};

describe('useIntlLocale', () => {
  it("gives 'pt-PT' for the app's 'pt'", () => {
    const { result } = renderWithLocale('pt');
    expect(result.current).toBe('pt-PT');
  });

  it("gives 'en-GB' for the app's 'en' — a real region, not a guess", () => {
    const { result } = renderWithLocale('en');
    expect(result.current).toBe('en-GB');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../i18n/i18nProvider';
import { RichTextEditor } from './RichTextEditor';

// Shared by crew and coordinator forms alike — pinned to 'en' here since
// this standalone test predates #180 and isn't specific to either
// convention; the toolbar's own translations are exercised for real wherever
// it's mounted inside a converted screen's test (e.g. the narrative section
// of an event report, which defaults to 'pt').
const i18nProvider = polyglotI18nProvider(messages, 'en');

describe('RichTextEditor', () => {
  it('renders the toolbar and starts empty', async () => {
    render(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <RichTextEditor value="" onChange={vi.fn()} />
      </AdminContext>,
    );
    await waitFor(() => expect(screen.getByLabelText('Bold')).toBeInTheDocument());
    expect(screen.getByLabelText('Italic')).toBeInTheDocument();
  });
});

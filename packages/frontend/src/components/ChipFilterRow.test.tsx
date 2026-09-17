import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from '@mui/material';
import { ChipFilterRow } from './ChipFilterRow';

describe('ChipFilterRow', () => {
  it('renders every chip passed to it', () => {
    render(
      <ChipFilterRow>
        <Chip label="All" />
        <Chip label="Emergency" />
      </ChipFilterRow>,
    );
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
  });

  it('scrolls its own overflow instead of wrapping to a new row', () => {
    const { container } = render(
      <ChipFilterRow>
        <Chip label="All" />
      </ChipFilterRow>,
    );
    // The two properties this component exists for: chips never wrap to a
    // second row, and any overflow scrolls horizontally within this box
    // rather than growing it (see the file's own doc comment for why a
    // plain `minWidth: 0` here isn't the whole story).
    expect(container.firstChild).toHaveStyle({
      flexWrap: 'nowrap',
      overflowX: 'auto',
      minWidth: 0,
    });
  });
});

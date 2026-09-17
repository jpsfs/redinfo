import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Recharts' <ResponsiveContainer> measures its host element via
// ResizeObserver, which jsdom does not implement. Without a stub the import
// throws before a single statistics chart test can render; a 0×0 stub is
// enough since chart assertions in this repo read the "Ver dados em tabela"
// twin, never the SVG recharts would draw at a real size.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// MUI's useMediaQuery needs matchMedia, which jsdom does not implement. Tests
// that care about the responsive swap override this per case (see renderMobile).
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

import { useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { MessageKey } from './labels';

type EnumMessageKey = string & { readonly __enumMessageKey?: never };

/**
 * A typed wrapper around react-admin's `useTranslate()` that keeps the
 * compile-time key check the app's own screens have relied on since before
 * #180: `MessageKey` makes a typo in a literal key a compile error rather
 * than a blank label on a phone.
 *
 * Existing call sites that used the old bare `t(key)` become
 * `const t = useT();` at the top of the component and are otherwise
 * unchanged — this is deliberately shaped the same way.
 *
 * Enum-label helpers (`reportTypeLabel`, `roleLabel`, …) take the function
 * `useTranslate()` returns directly as their first argument — not this
 * wrapper — since their keys are built at runtime and cannot be checked
 * against `MessageKey` anyway.
 */
export const useT = () => {
  const translate = useTranslate();
  return useCallback(
    (key: MessageKey | EnumMessageKey, options?: Record<string, unknown>) => translate(key, options),
    [translate],
  );
};

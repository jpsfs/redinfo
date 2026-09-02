/**
 * Deliberately dumb — step names and status codes to stdout/stderr, nothing
 * structured. The one rule that matters (docs/inem-portal-contract.md
 * "Logging"): **never** log a cookie value, a `SAMLResponse`, the shared
 * credential, the OTP, or a `storageState`. Every call site in this package
 * passes a literal step-name string, never a value pulled from the flow —
 * keep it that way rather than reaching for string interpolation of
 * anything that came off the wire.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  info: (message) => console.log(`[inem-worker] ${message}`),
  warn: (message) => console.warn(`[inem-worker] ${message}`),
  error: (message) => console.error(`[inem-worker] ${message}`),
};

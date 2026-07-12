import type { ErrorCode } from './codes.js';

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly requestId: string;
  };
}

export const buildErrorEnvelope = (
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Readonly<Record<string, unknown>>,
): ErrorEnvelope => ({
  error: details !== undefined ? { code, message, details, requestId } : { code, message, requestId },
});

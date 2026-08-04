import type { ErrorCode } from './codes.js';

export interface AppErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
  readonly userMessage: string;
  readonly isOperational = true;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(userMessage: string, options?: AppErrorOptions) {
    super(userMessage, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.userMessage = userMessage;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

export const isAppError = (value: unknown): value is AppError =>
  value instanceof AppError;

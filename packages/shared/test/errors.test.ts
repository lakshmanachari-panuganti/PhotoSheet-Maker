import { describe, expect, it } from 'vitest';

import {
  AppError,
  CorruptImageError,
  ERROR_CODES,
  HTTP_STATUS_FOR,
  LayoutImpossibleError,
  RateLimitedError,
  ValidationFailedError,
  buildErrorEnvelope,
  isAppError,
  type ErrorCode,
} from '../src/errors/index.js';

describe('error taxonomy', () => {
  it('every ErrorCode has an HTTP status', () => {
    for (const code of ERROR_CODES) {
      expect(typeof HTTP_STATUS_FOR[code]).toBe('number');
    }
  });

  it('assigns the documented HTTP statuses', () => {
    const expected: Record<ErrorCode, number> = {
      VALIDATION_FAILED: 400,
      UNSUPPORTED_FORMAT: 415,
      CORRUPT_IMAGE: 422,
      ANIMATED_NOT_SUPPORTED: 422,
      IMAGE_TOO_LARGE_PIXELS: 422,
      FILE_TOO_LARGE: 413,
      TOO_MANY_FILES: 413,
      INVALID_CROP_RECT: 400,
      PHOTO_LARGER_THAN_PAPER: 422,
      LAYOUT_IMPOSSIBLE: 422,
      PROCESSING_TIMEOUT: 504,
      ENCODE_FAILED: 500,
      PDF_BUILD_FAILED: 500,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    };
    for (const code of ERROR_CODES) {
      expect(HTTP_STATUS_FOR[code]).toBe(expected[code]);
    }
  });

  it('AppError subclasses expose code, httpStatus, userMessage, isOperational', () => {
    const err = new ValidationFailedError('bad input', { details: { field: 'dpi' } });
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.httpStatus).toBe(400);
    expect(err.userMessage).toBe('bad input');
    expect(err.isOperational).toBe(true);
    expect(err.details).toEqual({ field: 'dpi' });
    expect(err.name).toBe('ValidationFailedError');
    expect(isAppError(err)).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  it('CorruptImageError preserves the original cause', () => {
    const cause = new Error('libvips explode');
    const err = new CorruptImageError('image 3 is corrupt', { cause });
    expect(err.cause).toBe(cause);
    expect(err.code).toBe('CORRUPT_IMAGE');
  });

  it('LayoutImpossibleError carries structured details for the client', () => {
    const err = new LayoutImpossibleError('reduce the margin to 20mm or less', {
      details: { maxMarginMm: 20 },
    });
    expect(err.code).toBe('LAYOUT_IMPOSSIBLE');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toEqual({ maxMarginMm: 20 });
  });

  it('RateLimitedError includes retryAfterSeconds', () => {
    const err = new RateLimitedError('slow down', 42);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.httpStatus).toBe(429);
    expect(err.retryAfterSeconds).toBe(42);
  });

  it('isAppError rejects non-app errors', () => {
    expect(isAppError(new Error('generic'))).toBe(false);
    expect(isAppError('string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });

  describe('buildErrorEnvelope', () => {
    it('includes required fields and requestId', () => {
      const env = buildErrorEnvelope('LAYOUT_IMPOSSIBLE', 'reduce margin', 'req-123', {
        maxMarginMm: 20,
      });
      expect(env).toEqual({
        error: {
          code: 'LAYOUT_IMPOSSIBLE',
          message: 'reduce margin',
          details: { maxMarginMm: 20 },
          requestId: 'req-123',
        },
      });
    });

    it('omits details when not provided', () => {
      const env = buildErrorEnvelope('INTERNAL', 'oops', 'req-456');
      expect(env.error.details).toBeUndefined();
      expect(env.error.requestId).toBe('req-456');
    });
  });
});

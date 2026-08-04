import { AppError, type AppErrorOptions } from './AppError.js';
import { HTTP_STATUS_FOR } from './codes.js';

export class ValidationFailedError extends AppError {
  readonly code = 'VALIDATION_FAILED' as const;
  readonly httpStatus = HTTP_STATUS_FOR.VALIDATION_FAILED;
}

export class UnsupportedFormatError extends AppError {
  readonly code = 'UNSUPPORTED_FORMAT' as const;
  readonly httpStatus = HTTP_STATUS_FOR.UNSUPPORTED_FORMAT;
}

export class CorruptImageError extends AppError {
  readonly code = 'CORRUPT_IMAGE' as const;
  readonly httpStatus = HTTP_STATUS_FOR.CORRUPT_IMAGE;
}

export class AnimatedNotSupportedError extends AppError {
  readonly code = 'ANIMATED_NOT_SUPPORTED' as const;
  readonly httpStatus = HTTP_STATUS_FOR.ANIMATED_NOT_SUPPORTED;
}

export class ImageTooLargePixelsError extends AppError {
  readonly code = 'IMAGE_TOO_LARGE_PIXELS' as const;
  readonly httpStatus = HTTP_STATUS_FOR.IMAGE_TOO_LARGE_PIXELS;
}

export class FileTooLargeError extends AppError {
  readonly code = 'FILE_TOO_LARGE' as const;
  readonly httpStatus = HTTP_STATUS_FOR.FILE_TOO_LARGE;
}

export class TooManyFilesError extends AppError {
  readonly code = 'TOO_MANY_FILES' as const;
  readonly httpStatus = HTTP_STATUS_FOR.TOO_MANY_FILES;
}

export class InvalidCropRectError extends AppError {
  readonly code = 'INVALID_CROP_RECT' as const;
  readonly httpStatus = HTTP_STATUS_FOR.INVALID_CROP_RECT;
}

export class PhotoLargerThanPaperError extends AppError {
  readonly code = 'PHOTO_LARGER_THAN_PAPER' as const;
  readonly httpStatus = HTTP_STATUS_FOR.PHOTO_LARGER_THAN_PAPER;
}

export class LayoutImpossibleError extends AppError {
  readonly code = 'LAYOUT_IMPOSSIBLE' as const;
  readonly httpStatus = HTTP_STATUS_FOR.LAYOUT_IMPOSSIBLE;
}

export class ProcessingTimeoutError extends AppError {
  readonly code = 'PROCESSING_TIMEOUT' as const;
  readonly httpStatus = HTTP_STATUS_FOR.PROCESSING_TIMEOUT;
}

export class EncodeFailedError extends AppError {
  readonly code = 'ENCODE_FAILED' as const;
  readonly httpStatus = HTTP_STATUS_FOR.ENCODE_FAILED;
}

export class PdfBuildFailedError extends AppError {
  readonly code = 'PDF_BUILD_FAILED' as const;
  readonly httpStatus = HTTP_STATUS_FOR.PDF_BUILD_FAILED;
}

export class RateLimitedError extends AppError {
  readonly code = 'RATE_LIMITED' as const;
  readonly httpStatus = HTTP_STATUS_FOR.RATE_LIMITED;
  readonly retryAfterSeconds: number;

  constructor(userMessage: string, retryAfterSeconds: number, options?: AppErrorOptions) {
    super(userMessage, options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalError extends AppError {
  readonly code = 'INTERNAL' as const;
  readonly httpStatus = HTTP_STATUS_FOR.INTERNAL;
}

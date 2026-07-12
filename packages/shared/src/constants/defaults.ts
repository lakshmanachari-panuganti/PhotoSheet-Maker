import { DEFAULT_DPI, type Dpi } from './dpi.js';
import type { Orientation } from './units.js';

export const DEFAULTS = Object.freeze({
  dpi: DEFAULT_DPI satisfies Dpi,
  gapMm: 2,
  marginMm: 5,
  borderMm: 0,
  backgroundHex: '#FFFFFF',
  cutMarks: true,
  cutMarkLengthMm: 3,
  cutMarkWidthPx: 1,
  orientation: 'portrait' satisfies Orientation,
  autoLayout: true,
  copies: 1,
  rotationDeg: 0,
});

export const BOUNDS = Object.freeze({
  gapMm: { min: 0, max: 20 },
  marginMm: { min: 0, max: 50 },
  borderMm: { min: 0, max: 10 },
  cutMarkLengthMm: { min: 1, max: 20 },
  cutMarkWidthPx: { min: 1, max: 5 },
  copies: { min: 1, max: 200 },
  rotationDeg: { min: -180, max: 180 },
  customDimMm: { min: 10, max: 500 },
  fileBytes: { min: 1, max: 10 * 1024 * 1024 },
  fileCount: { min: 1, max: 10 },
  imagePixels: { max: 50_000_000 },
});

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export const OUTPUT_FORMATS = ['png', 'jpg', 'pdf'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const EFFECTIVE_DPI_WARN_THRESHOLD = 200;

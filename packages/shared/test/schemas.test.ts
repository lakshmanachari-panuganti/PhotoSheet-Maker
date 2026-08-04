import { describe, expect, it } from 'vitest';

import { jobRequestSchema, type JobRequest } from '../src/schemas/index.js';

const baseJob = (): JobRequest => ({
  photoStandard: 'IN_PASSPORT',
  paper: 'A4',
  orientation: 'portrait',
  dpi: 300,
  marginMm: 5,
  gapMm: 2,
  borderMm: 0,
  backgroundHex: '#FFFFFF',
  cutMarks: true,
  cutMarkLengthMm: 3,
  cutMarkWidthPx: 1,
  autoLayout: true,
  outputFormat: 'pdf',
  photos: [
    {
      fileIndex: 0,
      cropRect: { x: 0, y: 0, width: 100, height: 128 },
      rotationDeg: 0,
      copies: 30,
    },
  ],
});

describe('jobRequestSchema', () => {
  it('accepts a well-formed request', () => {
    const parsed = jobRequestSchema.parse(baseJob());
    expect(parsed.photoStandard).toBe('IN_PASSPORT');
  });

  it('rejects unsupported DPI', () => {
    const bad = { ...baseJob(), dpi: 150 };
    const result = jobRequestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects margin > 50mm', () => {
    const bad = { ...baseJob(), marginMm: 51 };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid hex color', () => {
    const bad = { ...baseJob(), backgroundHex: 'white' };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects copies > 200', () => {
    const job = baseJob();
    const bad = {
      ...job,
      photos: job.photos.map((p) => ({ ...p, copies: 201 })),
    };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects rotation outside [-180, 180]', () => {
    const job = baseJob();
    const bad = {
      ...job,
      photos: job.photos.map((p) => ({ ...p, rotationDeg: 181 })),
    };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('requires customPhotoDim when photoStandard is CUSTOM', () => {
    const bad: JobRequest = { ...baseJob(), photoStandard: 'CUSTOM' };
    const result = jobRequestSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'customPhotoDim'),
      ).toBe(true);
    }
  });

  it('accepts CUSTOM photo standard with customPhotoDim', () => {
    const good: JobRequest = {
      ...baseJob(),
      photoStandard: 'CUSTOM',
      customPhotoDim: { width: 40, height: 50, unit: 'mm' },
    };
    expect(jobRequestSchema.safeParse(good).success).toBe(true);
  });

  it('requires customPaperDim when paper is CUSTOM', () => {
    const bad: JobRequest = { ...baseJob(), paper: 'CUSTOM' };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects >10 photos', () => {
    const job = baseJob();
    const bad = {
      ...job,
      photos: Array.from({ length: 11 }, () => ({ ...job.photos[0]! })),
    };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('requires fixedCols/fixedRows when autoLayout is false', () => {
    const bad = { ...baseJob(), autoLayout: false };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts fixed layout with cols/rows', () => {
    const good: JobRequest = {
      ...baseJob(),
      autoLayout: false,
      fixedCols: 3,
      fixedRows: 4,
    };
    expect(jobRequestSchema.safeParse(good).success).toBe(true);
  });

  it('accepts custom dimensions at the boundary (10mm, 500mm)', () => {
    const good: JobRequest = {
      ...baseJob(),
      photoStandard: 'CUSTOM',
      customPhotoDim: { width: 10, height: 500, unit: 'mm' },
    };
    expect(jobRequestSchema.safeParse(good).success).toBe(true);
  });

  it('rejects custom dimensions outside the boundary', () => {
    const bad: JobRequest = {
      ...baseJob(),
      photoStandard: 'CUSTOM',
      customPhotoDim: { width: 9, height: 45, unit: 'mm' },
    };
    expect(jobRequestSchema.safeParse(bad).success).toBe(false);
  });
});

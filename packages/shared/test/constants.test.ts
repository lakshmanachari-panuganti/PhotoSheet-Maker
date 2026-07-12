import { describe, expect, it } from 'vitest';

import {
  DEFAULTS,
  BOUNDS,
  MM_PER_INCH,
  PAPER_SIZES,
  PHOTO_STANDARDS,
  SUPPORTED_DPI,
} from '../src/constants/index.js';

describe('constants', () => {
  it('exposes 300 and 600 as the only supported DPIs', () => {
    expect(SUPPORTED_DPI).toEqual([300, 600]);
  });

  it('defines MM_PER_INCH as 25.4', () => {
    expect(MM_PER_INCH).toBe(25.4);
  });

  it('locks default values from the spec', () => {
    expect(DEFAULTS.dpi).toBe(300);
    expect(DEFAULTS.gapMm).toBe(2);
    expect(DEFAULTS.marginMm).toBe(5);
    expect(DEFAULTS.borderMm).toBe(0);
    expect(DEFAULTS.backgroundHex).toBe('#FFFFFF');
    expect(DEFAULTS.cutMarks).toBe(true);
    expect(DEFAULTS.cutMarkLengthMm).toBe(3);
    expect(DEFAULTS.cutMarkWidthPx).toBe(1);
    expect(DEFAULTS.orientation).toBe('portrait');
    expect(DEFAULTS.autoLayout).toBe(true);
    expect(DEFAULTS.copies).toBe(1);
    expect(DEFAULTS.rotationDeg).toBe(0);
  });

  it('locks bounds from the spec', () => {
    expect(BOUNDS.gapMm).toEqual({ min: 0, max: 20 });
    expect(BOUNDS.marginMm).toEqual({ min: 0, max: 50 });
    expect(BOUNDS.borderMm).toEqual({ min: 0, max: 10 });
    expect(BOUNDS.copies).toEqual({ min: 1, max: 200 });
    expect(BOUNDS.rotationDeg).toEqual({ min: -180, max: 180 });
    expect(BOUNDS.customDimMm).toEqual({ min: 10, max: 500 });
    expect(BOUNDS.fileBytes.max).toBe(10 * 1024 * 1024);
    expect(BOUNDS.fileCount).toEqual({ min: 1, max: 10 });
    expect(BOUNDS.imagePixels.max).toBe(50_000_000);
  });

  it('does not merge US_PASSPORT and SQ_51MM (they are different sizes)', () => {
    expect(PHOTO_STANDARDS.US_PASSPORT.width).toBe(2);
    expect(PHOTO_STANDARDS.US_PASSPORT.unit).toBe('in');
    expect(PHOTO_STANDARDS.SQ_51MM.width).toBe(51);
    expect(PHOTO_STANDARDS.SQ_51MM.unit).toBe('mm');
  });

  it('defines every documented paper size with the correct unit', () => {
    expect(PAPER_SIZES.A4).toMatchObject({ width: 210, height: 297, unit: 'mm' });
    expect(PAPER_SIZES.A5).toMatchObject({ width: 148, height: 210, unit: 'mm' });
    expect(PAPER_SIZES.LETTER).toMatchObject({ width: 8.5, height: 11, unit: 'in' });
    expect(PAPER_SIZES.LEGAL).toMatchObject({ width: 8.5, height: 14, unit: 'in' });
    expect(PAPER_SIZES.P_4X6).toMatchObject({ width: 4, height: 6, unit: 'in' });
    expect(PAPER_SIZES.P_5X7).toMatchObject({ width: 5, height: 7, unit: 'in' });
    expect(PAPER_SIZES.P_6X8).toMatchObject({ width: 6, height: 8, unit: 'in' });
  });
});

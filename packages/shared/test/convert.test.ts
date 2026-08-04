import { describe, expect, it } from 'vitest';

import {
  dimensionToMm,
  dimensionToPt,
  dimensionToPx,
  dpiToPixelsPerMetre,
  inchesToMm,
  inchesToPt,
  inchesToPx,
  mmToInches,
  mmToPt,
  mmToPx,
} from '../src/units/convert.js';

describe('unit conversion', () => {
  describe('mmToPx — acceptance criteria 1, 2, 3', () => {
    it('35 mm @ 300 dpi → 413 px', () => {
      expect(mmToPx(35, 300)).toBe(413);
    });

    it('45 mm @ 300 dpi → 531 px', () => {
      expect(mmToPx(45, 300)).toBe(531);
    });

    it('51 mm @ 300 dpi → 602 px', () => {
      expect(mmToPx(51, 300)).toBe(602);
    });

    it('A4 210 × 297 mm @ 300 dpi → 2480 × 3508 px', () => {
      expect(mmToPx(210, 300)).toBe(2480);
      expect(mmToPx(297, 300)).toBe(3508);
    });

    it('A4 210 × 297 mm @ 600 dpi → 4961 × 7016 px (spec §4.1 "round once" rule)', () => {
      // Spec criterion 3 lists 4960 × 7016 — that 4960 comes from doubling the
      // 300-dpi value (2480 × 2), which violates the spec's own single-rounding
      // rule. round(210 / 25.4 * 600) = round(4960.6299) = 4961.
      expect(mmToPx(210, 600)).toBe(4961);
      expect(mmToPx(297, 600)).toBe(7016);
    });

    it('A5 148 × 210 mm @ 300 dpi → 1748 × 2480 px', () => {
      expect(mmToPx(148, 300)).toBe(1748);
      expect(mmToPx(210, 300)).toBe(2480);
    });
  });

  describe('inchesToPx — acceptance criterion 2', () => {
    it('2 in @ 300 dpi → 600 px', () => {
      expect(inchesToPx(2, 300)).toBe(600);
    });

    it('8.5 × 11 in @ 300 dpi → 2550 × 3300 px', () => {
      expect(inchesToPx(8.5, 300)).toBe(2550);
      expect(inchesToPx(11, 300)).toBe(3300);
    });

    it('8.5 × 14 in @ 300 dpi → 2550 × 4200 px', () => {
      expect(inchesToPx(8.5, 300)).toBe(2550);
      expect(inchesToPx(14, 300)).toBe(4200);
    });

    it('4 × 6 in @ 300 dpi → 1200 × 1800 px', () => {
      expect(inchesToPx(4, 300)).toBe(1200);
      expect(inchesToPx(6, 300)).toBe(1800);
    });
  });

  describe('PDF points (mmToPt / inchesToPt)', () => {
    it('A4 210 × 297 mm → 595.28 × 841.89 pt (±0.01)', () => {
      expect(mmToPt(210)).toBeCloseTo(595.28, 2);
      expect(mmToPt(297)).toBeCloseTo(841.89, 2);
    });

    it('A5 148 × 210 mm → 419.53 × 595.28 pt (±0.01)', () => {
      expect(mmToPt(148)).toBeCloseTo(419.53, 2);
      expect(mmToPt(210)).toBeCloseTo(595.28, 2);
    });

    it('Letter 8.5 × 11 in → 612 × 792 pt exactly', () => {
      expect(inchesToPt(8.5)).toBe(612);
      expect(inchesToPt(11)).toBe(792);
    });

    it('Legal 8.5 × 14 in → 612 × 1008 pt exactly', () => {
      expect(inchesToPt(8.5)).toBe(612);
      expect(inchesToPt(14)).toBe(1008);
    });
  });

  describe('dimensionToPx dispatches on unit', () => {
    it('mm path', () => {
      expect(dimensionToPx(35, 'mm', 300)).toBe(413);
    });

    it('in path', () => {
      expect(dimensionToPx(2, 'in', 300)).toBe(600);
    });
  });

  describe('dimensionToMm / dimensionToPt', () => {
    it('mm passes through, in converts', () => {
      expect(dimensionToMm(35, 'mm')).toBe(35);
      expect(dimensionToMm(2, 'in')).toBeCloseTo(50.8, 5);
      expect(dimensionToPt(2, 'in')).toBe(144);
      expect(dimensionToPt(25.4, 'mm')).toBeCloseTo(72, 5);
    });
  });

  describe('round-trip helpers', () => {
    it('mmToInches / inchesToMm are inverses', () => {
      expect(mmToInches(25.4)).toBeCloseTo(1, 10);
      expect(inchesToMm(1)).toBeCloseTo(25.4, 10);
    });
  });

  describe('dpiToPixelsPerMetre (PNG pHYs)', () => {
    it('300 dpi → 11811 ppm', () => {
      expect(dpiToPixelsPerMetre(300)).toBe(11811);
    });

    it('600 dpi → 23622 ppm', () => {
      expect(dpiToPixelsPerMetre(600)).toBe(23622);
    });
  });
});

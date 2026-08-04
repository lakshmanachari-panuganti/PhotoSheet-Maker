import { MM_PER_INCH, PT_PER_INCH, type Dpi } from '../constants/dpi.js';
import type { Unit } from '../constants/units.js';

export const mmToInches = (mm: number): number => mm / MM_PER_INCH;

export const inchesToMm = (inches: number): number => inches * MM_PER_INCH;

export const mmToPx = (mm: number, dpi: Dpi): number =>
  Math.round((mm / MM_PER_INCH) * dpi);

export const inchesToPx = (inches: number, dpi: Dpi): number =>
  Math.round(inches * dpi);

export const mmToPt = (mm: number): number => (mm / MM_PER_INCH) * PT_PER_INCH;

export const inchesToPt = (inches: number): number => inches * PT_PER_INCH;

export const dimensionToPx = (value: number, unit: Unit, dpi: Dpi): number =>
  unit === 'mm' ? mmToPx(value, dpi) : inchesToPx(value, dpi);

export const dimensionToMm = (value: number, unit: Unit): number =>
  unit === 'mm' ? value : inchesToMm(value);

export const dimensionToPt = (value: number, unit: Unit): number =>
  unit === 'mm' ? mmToPt(value) : inchesToPt(value);

export const dpiToPixelsPerMetre = (dpi: Dpi): number =>
  Math.round(dpi * 39.3701);

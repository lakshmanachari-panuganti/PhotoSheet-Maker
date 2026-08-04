import type { Unit } from './units.js';

export const PAPER_KEYS = [
  'A4',
  'A5',
  'LETTER',
  'LEGAL',
  'P_4X6',
  'P_5X7',
  'P_6X8',
  'CUSTOM',
] as const;

export type PaperKey = (typeof PAPER_KEYS)[number];

export interface PaperDef {
  readonly key: PaperKey;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly unit: Unit;
}

export const PAPER_SIZES: Readonly<Record<Exclude<PaperKey, 'CUSTOM'>, PaperDef>> = Object.freeze({
  A4: { key: 'A4', label: 'A4 (210 × 297 mm)', width: 210, height: 297, unit: 'mm' },
  A5: { key: 'A5', label: 'A5 (148 × 210 mm)', width: 148, height: 210, unit: 'mm' },
  LETTER: { key: 'LETTER', label: 'US Letter (8.5 × 11 in)', width: 8.5, height: 11, unit: 'in' },
  LEGAL: { key: 'LEGAL', label: 'US Legal (8.5 × 14 in)', width: 8.5, height: 14, unit: 'in' },
  P_4X6: { key: 'P_4X6', label: 'Photo 4 × 6 in', width: 4, height: 6, unit: 'in' },
  P_5X7: { key: 'P_5X7', label: 'Photo 5 × 7 in', width: 5, height: 7, unit: 'in' },
  P_6X8: { key: 'P_6X8', label: 'Photo 6 × 8 in', width: 6, height: 8, unit: 'in' },
});

export const CUSTOM_PAPER_MIN_MM = 10;
export const CUSTOM_PAPER_MAX_MM = 500;

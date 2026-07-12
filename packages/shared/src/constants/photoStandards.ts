import type { Unit } from './units.js';

export const PHOTO_STANDARD_KEYS = [
  'IN_PASSPORT',
  'SCHENGEN',
  'AU_VISA',
  'CA_VISA',
  'US_PASSPORT',
  'SQ_51MM',
  'CUSTOM',
] as const;

export type PhotoStandardKey = (typeof PHOTO_STANDARD_KEYS)[number];

export interface PhotoStandardDef {
  readonly key: PhotoStandardKey;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly unit: Unit;
}

export const PHOTO_STANDARDS: Readonly<Record<Exclude<PhotoStandardKey, 'CUSTOM'>, PhotoStandardDef>> = Object.freeze({
  IN_PASSPORT: {
    key: 'IN_PASSPORT',
    label: 'India Passport (35 × 45 mm)',
    width: 35,
    height: 45,
    unit: 'mm',
  },
  SCHENGEN: {
    key: 'SCHENGEN',
    label: 'Schengen Visa (35 × 45 mm)',
    width: 35,
    height: 45,
    unit: 'mm',
  },
  AU_VISA: {
    key: 'AU_VISA',
    label: 'Australia Visa (35 × 45 mm)',
    width: 35,
    height: 45,
    unit: 'mm',
  },
  CA_VISA: {
    key: 'CA_VISA',
    label: 'Canada Visa (35 × 45 mm)',
    width: 35,
    height: 45,
    unit: 'mm',
  },
  US_PASSPORT: {
    key: 'US_PASSPORT',
    label: 'US Passport (2 × 2 in)',
    width: 2,
    height: 2,
    unit: 'in',
  },
  SQ_51MM: {
    key: 'SQ_51MM',
    label: 'Square (51 × 51 mm)',
    width: 51,
    height: 51,
    unit: 'mm',
  },
});

export const CUSTOM_PHOTO_MIN_MM = 10;
export const CUSTOM_PHOTO_MAX_MM = 500;

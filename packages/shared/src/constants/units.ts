export const UNITS = ['mm', 'in'] as const;

export type Unit = (typeof UNITS)[number];

export type Orientation = 'portrait' | 'landscape';

export const ORIENTATIONS = ['portrait', 'landscape'] as const;

export interface Dimension {
  readonly width: number;
  readonly height: number;
  readonly unit: Unit;
}

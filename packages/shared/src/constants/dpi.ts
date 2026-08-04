export const SUPPORTED_DPI = [300, 600] as const;

export type Dpi = (typeof SUPPORTED_DPI)[number];

export const DEFAULT_DPI: Dpi = 300;

export const MM_PER_INCH = 25.4;

export const PT_PER_INCH = 72;

export const isDpi = (value: number): value is Dpi =>
  (SUPPORTED_DPI as readonly number[]).includes(value);

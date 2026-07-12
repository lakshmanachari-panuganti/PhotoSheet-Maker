import type { Dpi } from '../constants/dpi.js';

export interface LayoutInput {
  readonly paperWidthMm: number;
  readonly paperHeightMm: number;
  readonly photoWidthMm: number;
  readonly photoHeightMm: number;
  readonly marginMm: number;
  readonly gapMm: number;
  readonly borderMm: number;
  readonly copies: number;
  readonly cutMarks: boolean;
  readonly cutMarkLengthMm: number;
  readonly dpi: Dpi;
  readonly autoLayout: boolean;
  readonly fixedCols?: number;
  readonly fixedRows?: number;
}

export interface Placement {
  readonly pageIndex: number;
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly innerX: number;
  readonly innerY: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
}

export interface CutMark {
  readonly pageIndex: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface LayoutOk {
  readonly ok: true;
  readonly cols: number;
  readonly rows: number;
  readonly capacityPerPage: number;
  readonly pages: number;
  readonly paperWidthPx: number;
  readonly paperHeightPx: number;
  readonly cellWidthPx: number;
  readonly cellHeightPx: number;
  readonly photoWidthPx: number;
  readonly photoHeightPx: number;
  readonly originXPx: number;
  readonly originYPx: number;
  readonly blockWidthPx: number;
  readonly blockHeightPx: number;
  readonly placements: readonly Placement[];
  readonly cutMarks: readonly CutMark[];
}

export type LayoutErrorReason = 'PHOTO_LARGER_THAN_PAPER' | 'LAYOUT_IMPOSSIBLE';

export interface LayoutError {
  readonly ok: false;
  readonly reason: LayoutErrorReason;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type LayoutResult = LayoutOk | LayoutError;

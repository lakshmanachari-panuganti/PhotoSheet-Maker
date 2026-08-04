import { mmToPx } from '../units/convert.js';
import type {
  CutMark,
  LayoutError,
  LayoutInput,
  LayoutOk,
  LayoutResult,
  Placement,
} from './types.js';

const roundMm = (v: number): number => Math.round(v * 100) / 100;

const buildPhotoLargerThanPaperError = (
  input: LayoutInput,
  cellWidthMm: number,
  cellHeightMm: number,
): LayoutError => ({
  ok: false,
  reason: 'PHOTO_LARGER_THAN_PAPER',
  message:
    `A ${cellWidthMm.toString()}×${cellHeightMm.toString()} mm cell ` +
    `(photo ${input.photoWidthMm.toString()}×${input.photoHeightMm.toString()} mm ` +
    `+ ${input.borderMm.toString()} mm border) is larger than the paper ` +
    `(${input.paperWidthMm.toString()}×${input.paperHeightMm.toString()} mm). ` +
    'Choose a larger paper size or reduce the photo size.',
  details: {
    paperWidthMm: input.paperWidthMm,
    paperHeightMm: input.paperHeightMm,
    photoWidthMm: input.photoWidthMm,
    photoHeightMm: input.photoHeightMm,
    borderMm: input.borderMm,
    cellWidthMm,
    cellHeightMm,
  },
});

const buildLayoutImpossibleError = (
  input: LayoutInput,
  cellWidthMm: number,
  cellHeightMm: number,
  cols: number,
  rows: number,
): LayoutError => {
  const maxMarginForWidthMm = (input.paperWidthMm - cellWidthMm) / 2;
  const maxMarginForHeightMm = (input.paperHeightMm - cellHeightMm) / 2;
  const maxMarginMm = Math.max(
    0,
    Math.min(maxMarginForWidthMm, maxMarginForHeightMm),
  );

  const parts: string[] = [];
  if (!input.autoLayout) {
    const maxColsForMargin = Math.floor(
      (input.paperWidthMm - 2 * input.marginMm + input.gapMm) /
        (cellWidthMm + input.gapMm),
    );
    const maxRowsForMargin = Math.floor(
      (input.paperHeightMm - 2 * input.marginMm + input.gapMm) /
        (cellHeightMm + input.gapMm),
    );
    parts.push(
      `Fixed layout requested ${input.fixedCols?.toString() ?? '?'} × ` +
        `${input.fixedRows?.toString() ?? '?'} but only ` +
        `${Math.max(0, maxColsForMargin).toString()} × ` +
        `${Math.max(0, maxRowsForMargin).toString()} fits at the current margin/gap.`,
    );
  } else {
    parts.push(
      `A margin of ${input.marginMm.toString()} mm leaves no room for a ` +
        `${input.photoWidthMm.toString()}×${input.photoHeightMm.toString()} mm ` +
        `photo on ${input.paperWidthMm.toString()}×${input.paperHeightMm.toString()} mm paper.`,
    );
  }
  parts.push(
    `Reduce the margin to ${roundMm(maxMarginMm).toString()} mm or less.`,
  );

  return {
    ok: false,
    reason: 'LAYOUT_IMPOSSIBLE',
    message: parts.join(' '),
    details: {
      paperWidthMm: input.paperWidthMm,
      paperHeightMm: input.paperHeightMm,
      photoWidthMm: input.photoWidthMm,
      photoHeightMm: input.photoHeightMm,
      borderMm: input.borderMm,
      marginMm: input.marginMm,
      gapMm: input.gapMm,
      cellWidthMm,
      cellHeightMm,
      cols,
      rows,
      maxMarginMm: roundMm(maxMarginMm),
    },
  };
};

const maxColsAt = (
  paperMm: number,
  marginMm: number,
  cellMm: number,
  gapMm: number,
): number => {
  const printable = paperMm - 2 * marginMm;
  if (printable < cellMm) return 0;
  return Math.floor((printable + gapMm) / (cellMm + gapMm));
};

export const computeLayout = (input: LayoutInput): LayoutResult => {
  if (input.copies < 1) {
    throw new Error('computeLayout: copies must be >= 1 (validate before calling)');
  }
  if (input.paperWidthMm <= 0 || input.paperHeightMm <= 0) {
    throw new Error('computeLayout: paper dimensions must be positive');
  }
  if (input.photoWidthMm <= 0 || input.photoHeightMm <= 0) {
    throw new Error('computeLayout: photo dimensions must be positive');
  }
  if (input.marginMm < 0 || input.gapMm < 0 || input.borderMm < 0) {
    throw new Error('computeLayout: margin/gap/border must be non-negative');
  }

  const cellWidthMm = input.photoWidthMm + 2 * input.borderMm;
  const cellHeightMm = input.photoHeightMm + 2 * input.borderMm;

  if (cellWidthMm > input.paperWidthMm || cellHeightMm > input.paperHeightMm) {
    return buildPhotoLargerThanPaperError(input, cellWidthMm, cellHeightMm);
  }

  let cols: number;
  let rows: number;
  if (input.autoLayout) {
    cols = maxColsAt(input.paperWidthMm, input.marginMm, cellWidthMm, input.gapMm);
    rows = maxColsAt(input.paperHeightMm, input.marginMm, cellHeightMm, input.gapMm);
  } else {
    if (input.fixedCols === undefined || input.fixedRows === undefined) {
      throw new Error(
        'computeLayout: fixedCols and fixedRows are required when autoLayout is false',
      );
    }
    cols = input.fixedCols;
    rows = input.fixedRows;

    const usedW = 2 * input.marginMm + cols * cellWidthMm + (cols - 1) * input.gapMm;
    const usedH = 2 * input.marginMm + rows * cellHeightMm + (rows - 1) * input.gapMm;
    if (usedW > input.paperWidthMm || usedH > input.paperHeightMm) {
      return buildLayoutImpossibleError(input, cellWidthMm, cellHeightMm, cols, rows);
    }
  }

  if (cols < 1 || rows < 1) {
    return buildLayoutImpossibleError(input, cellWidthMm, cellHeightMm, cols, rows);
  }

  const capacityPerPage = cols * rows;
  const pages = Math.max(1, Math.ceil(input.copies / capacityPerPage));

  const blockWidthMm = cols * cellWidthMm + (cols - 1) * input.gapMm;
  const blockHeightMm = rows * cellHeightMm + (rows - 1) * input.gapMm;
  const originXMm = (input.paperWidthMm - blockWidthMm) / 2;
  const originYMm = (input.paperHeightMm - blockHeightMm) / 2;

  const cellXMm = (col: number): number => originXMm + col * (cellWidthMm + input.gapMm);
  const cellYMm = (row: number): number => originYMm + row * (cellHeightMm + input.gapMm);

  const cellWidthPx = mmToPx(cellWidthMm, input.dpi);
  const cellHeightPx = mmToPx(cellHeightMm, input.dpi);
  const photoWidthPx = mmToPx(input.photoWidthMm, input.dpi);
  const photoHeightPx = mmToPx(input.photoHeightMm, input.dpi);

  const placements: Placement[] = [];
  for (let i = 0; i < input.copies; i++) {
    const pageIndex = Math.floor(i / capacityPerPage);
    const indexOnPage = i % capacityPerPage;
    const row = Math.floor(indexOnPage / cols);
    const col = indexOnPage % cols;

    const xMm = cellXMm(col);
    const yMm = cellYMm(row);
    const innerXMm = xMm + input.borderMm;
    const innerYMm = yMm + input.borderMm;

    placements.push({
      pageIndex,
      col,
      row,
      x: mmToPx(xMm, input.dpi),
      y: mmToPx(yMm, input.dpi),
      width: cellWidthPx,
      height: cellHeightPx,
      innerX: mmToPx(innerXMm, input.dpi),
      innerY: mmToPx(innerYMm, input.dpi),
      innerWidth: photoWidthPx,
      innerHeight: photoHeightPx,
    });
  }

  const cutMarks: CutMark[] = [];
  const effectiveCutMarkMm = Math.min(input.cutMarkLengthMm, input.marginMm);
  if (input.cutMarks && effectiveCutMarkMm > 0) {
    const colXs: number[] = [];
    for (let c = 0; c < cols; c++) {
      colXs.push(cellXMm(c));
      colXs.push(cellXMm(c) + cellWidthMm);
    }
    const rowYs: number[] = [];
    for (let r = 0; r < rows; r++) {
      rowYs.push(cellYMm(r));
      rowYs.push(cellYMm(r) + cellHeightMm);
    }

    const topStartMm = originYMm - effectiveCutMarkMm;
    const bottomStartMm = originYMm + blockHeightMm;
    const bottomEndMm = bottomStartMm + effectiveCutMarkMm;
    const leftStartMm = originXMm - effectiveCutMarkMm;
    const rightStartMm = originXMm + blockWidthMm;
    const rightEndMm = rightStartMm + effectiveCutMarkMm;

    for (let page = 0; page < pages; page++) {
      for (const xMm of colXs) {
        const x = mmToPx(xMm, input.dpi);
        cutMarks.push({
          pageIndex: page,
          x1: x,
          y1: mmToPx(topStartMm, input.dpi),
          x2: x,
          y2: mmToPx(originYMm, input.dpi),
        });
        cutMarks.push({
          pageIndex: page,
          x1: x,
          y1: mmToPx(bottomStartMm, input.dpi),
          x2: x,
          y2: mmToPx(bottomEndMm, input.dpi),
        });
      }
      for (const yMm of rowYs) {
        const y = mmToPx(yMm, input.dpi);
        cutMarks.push({
          pageIndex: page,
          x1: mmToPx(leftStartMm, input.dpi),
          y1: y,
          x2: mmToPx(originXMm, input.dpi),
          y2: y,
        });
        cutMarks.push({
          pageIndex: page,
          x1: mmToPx(rightStartMm, input.dpi),
          y1: y,
          x2: mmToPx(rightEndMm, input.dpi),
          y2: y,
        });
      }
    }
  }

  const result: LayoutOk = {
    ok: true,
    cols,
    rows,
    capacityPerPage,
    pages,
    paperWidthPx: mmToPx(input.paperWidthMm, input.dpi),
    paperHeightPx: mmToPx(input.paperHeightMm, input.dpi),
    cellWidthPx,
    cellHeightPx,
    photoWidthPx,
    photoHeightPx,
    originXPx: mmToPx(originXMm, input.dpi),
    originYPx: mmToPx(originYMm, input.dpi),
    blockWidthPx: mmToPx(blockWidthMm, input.dpi),
    blockHeightPx: mmToPx(blockHeightMm, input.dpi),
    placements,
    cutMarks,
  };
  return result;
};

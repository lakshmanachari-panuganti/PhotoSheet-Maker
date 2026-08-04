import type { LayoutInput, LayoutOk } from '@photosheet/shared';
import { computeLayout } from '@photosheet/shared';

import type { CropRect } from './crop.ts';
import { injectPngDensity } from './pngDensity.ts';

export interface ComposeInput {
  readonly layoutInput: LayoutInput;
  readonly imageBitmap: ImageBitmap;
  readonly cropRect: CropRect;
  readonly backgroundHex: string;
  readonly cutMarkWidthPx: number;
}

export interface ComposePageResult {
  readonly pageIndex: number;
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
}

const drawPage = (
  layout: LayoutOk,
  bitmap: ImageBitmap,
  cropRect: CropRect,
  pageIndex: number,
  backgroundHex: string,
  cutMarkWidthPx: number,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = layout.paperWidthPx;
  canvas.height = layout.paperHeightPx;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('composeSheet: no 2D context');

  ctx.fillStyle = backgroundHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Clamp the crop to the actual source bounds so bad input can't force
  // drawImage to sample outside the bitmap and produce a black bar.
  const sx = Math.max(0, Math.min(cropRect.x, bitmap.width - 1));
  const sy = Math.max(0, Math.min(cropRect.y, bitmap.height - 1));
  const sw = Math.max(1, Math.min(cropRect.width, bitmap.width - sx));
  const sh = Math.max(1, Math.min(cropRect.height, bitmap.height - sy));

  for (const p of layout.placements) {
    if (p.pageIndex !== pageIndex) continue;
    if (p.width > p.innerWidth) {
      ctx.fillStyle = 'white';
      ctx.fillRect(p.x, p.y, p.width, p.height);
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, p.innerX, p.innerY, p.innerWidth, p.innerHeight);
  }

  if (layout.cutMarks.length > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = Math.max(1, cutMarkWidthPx);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const m of layout.cutMarks) {
      if (m.pageIndex !== pageIndex) continue;
      ctx.moveTo(m.x1 + 0.5, m.y1 + 0.5);
      ctx.lineTo(m.x2 + 0.5, m.y2 + 0.5);
    }
    ctx.stroke();
  }

  return canvas;
};

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('composeSheet: canvas.toBlob returned null'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

const canvasToJpgBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('composeSheet: canvas.toBlob returned null'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.95,
    );
  });

export const composePagesAsPng = async (
  input: ComposeInput,
): Promise<readonly ComposePageResult[]> => {
  const layout = computeLayout(input.layoutInput);
  if (!layout.ok) throw new Error(layout.message);
  const results: ComposePageResult[] = [];
  for (let pageIndex = 0; pageIndex < layout.pages; pageIndex++) {
    const canvas = drawPage(
      layout,
      input.imageBitmap,
      input.cropRect,
      pageIndex,
      input.backgroundHex,
      input.cutMarkWidthPx,
    );
    const rawBlob = await canvasToPngBlob(canvas);
    const rawBytes = new Uint8Array(await rawBlob.arrayBuffer());
    const withDensity = injectPngDensity(rawBytes, input.layoutInput.dpi);
    // Cast: injectPngDensity returns Uint8Array backed by a fresh ArrayBuffer
    // (never SharedArrayBuffer), but TS 5.7+ can't narrow the generic buffer type.
    const finalBlob = new Blob([withDensity as BlobPart], { type: 'image/png' });
    results.push({
      pageIndex,
      blob: finalBlob,
      widthPx: canvas.width,
      heightPx: canvas.height,
    });
  }
  return results;
};

export const composePagesAsJpg = async (
  input: ComposeInput,
): Promise<readonly ComposePageResult[]> => {
  const layout = computeLayout(input.layoutInput);
  if (!layout.ok) throw new Error(layout.message);
  const results: ComposePageResult[] = [];
  for (let pageIndex = 0; pageIndex < layout.pages; pageIndex++) {
    const canvas = drawPage(
      layout,
      input.imageBitmap,
      input.cropRect,
      pageIndex,
      input.backgroundHex,
      input.cutMarkWidthPx,
    );
    const blob = await canvasToJpgBlob(canvas);
    results.push({ pageIndex, blob, widthPx: canvas.width, heightPx: canvas.height });
  }
  return results;
};

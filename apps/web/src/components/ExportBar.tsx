import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { LayoutInput, LayoutResult } from '@photosheet/shared';

import type { UploadedPhoto } from './PhotoPanel.tsx';
import type { SheetConfig } from './ConfigPanel.tsx';
import { composePagesAsJpg, composePagesAsPng } from '../lib/composeSheet.ts';
import { downloadBlob } from '../lib/download.ts';
import { defaultCenterCrop, type CropRect } from '../lib/crop.ts';

interface Props {
  readonly layout: LayoutResult;
  readonly layoutInput: LayoutInput;
  readonly photo: UploadedPhoto | null;
  readonly crop: CropRect | null;
  readonly config: SheetConfig;
}

type Format = 'png' | 'jpg';

export const ExportBar = ({ layout, layoutInput, photo, crop, config }: Props) => {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canExport = layout.ok && photo !== null && busy === null;

  const doExport = async (format: Format): Promise<void> => {
    if (!photo) {
      setError('Upload a photo first.');
      return;
    }
    if (!layout.ok) {
      setError(layout.message);
      return;
    }
    setError(null);
    setBusy(format);
    try {
      const bitmap = await createImageBitmap(photo.file);
      const cropRect: CropRect =
        crop ??
        defaultCenterCrop(
          photo.width,
          photo.height,
          layoutInput.photoWidthMm / layoutInput.photoHeightMm,
        );
      const pages =
        format === 'png'
          ? await composePagesAsPng({
              layoutInput,
              imageBitmap: bitmap,
              cropRect,
              backgroundHex: config.backgroundHex,
              cutMarkWidthPx: 1,
            })
          : await composePagesAsJpg({
              layoutInput,
              imageBitmap: bitmap,
              cropRect,
              backgroundHex: config.backgroundHex,
              cutMarkWidthPx: 1,
            });

      const stamp = new Date().toISOString().slice(0, 10);
      for (const page of pages) {
        const suffix = pages.length > 1 ? `-p${(page.pageIndex + 1).toString()}` : '';
        downloadBlob(page.blob, `photosheet-${stamp}${suffix}.${format}`);
      }
      bitmap.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canExport}
          onClick={() => {
            void doExport('png');
          }}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition disabled:opacity-40 disabled:shadow-none enabled:hover:brightness-110"
        >
          {busy === 'png' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export PNG
        </button>

        <button
          type="button"
          disabled={!canExport}
          onClick={() => {
            void doExport('jpg');
          }}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40 enabled:hover:bg-white/10"
        >
          {busy === 'jpg' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export JPG
        </button>

        <div className="ml-auto text-xs text-neutral-400">
          {photo ? (
            <span>
              Ready to render at{' '}
              <span className="font-mono text-white">
                {layout.ok ? `${layout.paperWidthPx}×${layout.paperHeightPx}` : '—'} px
              </span>{' '}
              @ <span className="font-mono text-white">{config.dpi} DPI</span>
            </span>
          ) : (
            <span>Upload a photo to enable export.</span>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-neutral-400">
        <span className="text-neutral-300">Print at 100% / Actual Size.</span> This tool does not
        validate ID-photo compliance (background colour, head height, expression). It ensures the
        <em> physical size </em> of the printed photo is correct.
      </div>
    </div>
  );
};

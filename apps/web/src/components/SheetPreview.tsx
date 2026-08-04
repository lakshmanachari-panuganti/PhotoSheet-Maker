import { useEffect, useMemo, useState } from 'react';
import type { LayoutResult } from '@photosheet/shared';

import type { UploadedPhoto } from './PhotoPanel.tsx';
import type { SheetConfig } from './ConfigPanel.tsx';
import { cropToDataUrl, type CropRect } from '../lib/crop.ts';

interface Props {
  readonly layout: LayoutResult;
  readonly photo: UploadedPhoto | null;
  readonly crop: CropRect | null;
  readonly config: SheetConfig;
}

// Render the cropped region of the source photo into an offscreen canvas
// once per (photo, crop) change. The SVG preview then uses that dataURL
// as the image href - each cell just needs a normal xMidYMid slice fit,
// no per-cell offset math. Downscales to 640 px on the long edge; that's
// plenty for on-screen preview at any zoom.
const useCroppedDataUrl = (photo: UploadedPhoto | null, crop: CropRect | null): string | null => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo || !crop) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        setDataUrl(cropToDataUrl(img, crop, 640));
      } catch {
        setDataUrl(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setDataUrl(null);
    };
    img.src = photo.objectUrl;
    return () => {
      cancelled = true;
    };
  }, [photo, crop]);

  return dataUrl;
};

export const SheetPreview = ({ layout, photo, crop, config }: Props) => {
  const [pageIndex, setPageIndex] = useState(0);
  const croppedUrl = useCroppedDataUrl(photo, crop);

  const clampedPage = useMemo(() => {
    if (!layout.ok) return 0;
    return Math.min(pageIndex, layout.pages - 1);
  }, [layout, pageIndex]);

  if (!layout.ok) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-2xl border border-rose-400/20 bg-rose-400/5 p-8 text-center">
        <div>
          <div className="text-lg font-medium text-rose-200">Layout not possible</div>
          <div className="mt-2 max-w-md text-sm text-rose-300/80">{layout.message}</div>
        </div>
      </div>
    );
  }

  const placementsOnPage = layout.placements.filter((p) => p.pageIndex === clampedPage);
  const marksOnPage = layout.cutMarks.filter((m) => m.pageIndex === clampedPage);

  const viewBoxW = layout.paperWidthPx;
  const viewBoxH = layout.paperHeightPx;

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Live Preview
        </h2>
        {layout.pages > 1 ? (
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1 py-0.5 text-xs">
            {Array.from({ length: layout.pages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPageIndex(i)}
                className={`rounded-full px-2.5 py-0.5 transition ${
                  clampedPage === i ? 'bg-sky-500 text-white' : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative flex items-center justify-center rounded-xl bg-neutral-900/60 p-6">
        <div
          className="relative w-full max-w-[720px]"
          style={{ aspectRatio: `${viewBoxW} / ${viewBoxH}` }}
        >
          <svg
            viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full rounded-md shadow-2xl shadow-black/50 ring-1 ring-white/10"
            style={{ backgroundColor: config.backgroundHex }}
            role="img"
            aria-label="Sheet preview"
          >
            {placementsOnPage.map((p, i) => (
              <g key={i}>
                {config.borderMm > 0 ? (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.width}
                    height={p.height}
                    fill="white"
                    stroke="rgba(0,0,0,0.06)"
                    strokeWidth={1}
                  />
                ) : null}
                {croppedUrl ? (
                  <image
                    x={p.innerX}
                    y={p.innerY}
                    width={p.innerWidth}
                    height={p.innerHeight}
                    href={croppedUrl}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <rect
                    x={p.innerX}
                    y={p.innerY}
                    width={p.innerWidth}
                    height={p.innerHeight}
                    fill="url(#empty-cell)"
                    stroke="rgba(14, 165, 233, 0.35)"
                    strokeWidth={2}
                    strokeDasharray="10 6"
                  />
                )}
              </g>
            ))}

            {marksOnPage.map((m, i) => (
              <line
                key={`mark-${i.toString()}`}
                x1={m.x1}
                y1={m.y1}
                x2={m.x2}
                y2={m.y2}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={Math.max(1, viewBoxW / 900)}
              />
            ))}

            <defs>
              <pattern id="empty-cell" patternUnits="userSpaceOnUse" width={24} height={24}>
                <rect width={24} height={24} fill="rgba(148, 163, 184, 0.08)" />
                <path d="M0 24 L24 0" stroke="rgba(148,163,184,0.15)" strokeWidth={1} />
              </pattern>
            </defs>
          </svg>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <Stat label="Page size">{layout.paperWidthPx} × {layout.paperHeightPx} px</Stat>
        <Stat label="Photo cell">{layout.cellWidthPx} × {layout.cellHeightPx} px</Stat>
        <Stat label="Grid">{layout.cols} × {layout.rows}</Stat>
        <Stat label="DPI">{config.dpi}</Stat>
      </div>
    </div>
  );
};

const Stat = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg bg-white/5 px-3 py-2">
    <div className="text-neutral-400">{label}</div>
    <div className="mt-0.5 font-mono text-neutral-100">{children}</div>
  </div>
);

import { Crop, RotateCcw, Upload, X, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';

import type { CropRect } from '../lib/crop.ts';

export interface UploadedPhoto {
  readonly file: File;
  readonly objectUrl: string;
  readonly width: number;
  readonly height: number;
}

interface Props {
  readonly photo: UploadedPhoto | null;
  readonly aspect: number;
  readonly onChange: (next: UploadedPhoto | null) => void;
  readonly onCropChange: (crop: CropRect | null) => void;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp';

const loadImage = (file: File): Promise<UploadedPhoto> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ file, objectUrl, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not decode ${file.name}. Try JPEG, PNG, or WebP.`));
    };
    img.src = objectUrl;
  });

export const PhotoPanel = ({ photo, aspect, onChange, onCropChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<CropRect | null>(null);

  // Reset the crop UI whenever a new photo is loaded or the target
  // aspect changes. react-easy-crop refits automatically, but we still
  // reset zoom/position so the operator sees a clean starting frame.
  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixelCrop(null);
  }, [photo?.objectUrl, aspect]);

  // Bubble the pixel crop up to the parent whenever it changes.
  useEffect(() => {
    onCropChange(pixelCrop);
  }, [pixelCrop, onCropChange]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      setError(null);
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file) return;
      if (!ACCEPTED.split(',').includes(file.type)) {
        setError(`Unsupported format: ${file.type || 'unknown'}. Use JPEG, PNG, or WebP.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File is over the 10 MB limit.');
        return;
      }
      try {
        const uploaded = await loadImage(file);
        onChange(uploaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the image.');
      }
    },
    [onChange],
  );

  const openPicker = () => inputRef.current?.click();
  const clear = () => {
    onChange(null);
    setPixelCrop(null);
    if (inputRef.current) inputRef.current.value = '';
  };
  const resetCrop = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleCropComplete = useCallback(
    (_area: Area, areaPixels: Area) => {
      setPixelCrop({
        x: Math.max(0, Math.round(areaPixels.x)),
        y: Math.max(0, Math.round(areaPixels.y)),
        width: Math.max(1, Math.round(areaPixels.width)),
        height: Math.max(1, Math.round(areaPixels.height)),
      });
    },
    [],
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Photo
        </h2>
        {photo ? (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(e) => {
          void handleFiles(e.target.files);
        }}
      />

      {photo ? (
        <div className="space-y-3">
          <div className="relative h-72 w-full overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
            <Cropper
              image={photo.objectUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              minZoom={1}
              maxZoom={5}
              zoomSpeed={0.4}
              restrictPosition
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              objectFit="contain"
              classes={{
                containerClassName: 'photo-cropper-container',
                mediaClassName: 'photo-cropper-media',
                cropAreaClassName: 'photo-cropper-area',
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <ZoomIn className="h-3.5 w-3.5 text-neutral-400" />
              <input
                type="range"
                min={1}
                max={5}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10"
                aria-label="Zoom"
              />
              <span className="w-8 text-right font-mono text-[11px] text-neutral-300">
                {zoom.toFixed(1)}×
              </span>
            </div>
            <button
              type="button"
              onClick={resetCrop}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white"
              title="Reset crop position and zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-neutral-400">Source</div>
              <div className="mt-0.5 font-mono text-neutral-100">
                {photo.width}×{photo.height}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-neutral-400">Crop</div>
              <div className="mt-0.5 font-mono text-neutral-100">
                {pixelCrop ? `${pixelCrop.width}×${pixelCrop.height}` : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-neutral-400">Bytes</div>
              <div className="mt-0.5 font-mono text-neutral-100">
                {(photo.file.size / 1024).toFixed(0)} KB
              </div>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
            <Crop className="mt-0.5 h-3 w-3 shrink-0" />
            Drag to pan, pinch or scroll to zoom. The crop rectangle stays locked to the
            selected photo standard&apos;s aspect ratio.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={`group flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition ${
            dragOver
              ? 'border-sky-400/70 bg-sky-400/10'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5'
          }`}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/20 transition group-hover:bg-sky-500/20">
            <Upload className="h-5 w-5" />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-white">Drop a photo or click to browse</div>
            <div className="mt-1 text-xs text-neutral-400">JPEG · PNG · WebP · up to 10 MB</div>
          </div>
        </button>
      )}

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      ) : null}
    </div>
  );
};

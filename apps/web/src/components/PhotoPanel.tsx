import { Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export interface UploadedPhoto {
  readonly file: File;
  readonly objectUrl: string;
  readonly width: number;
  readonly height: number;
}

interface Props {
  readonly photo: UploadedPhoto | null;
  readonly onChange: (next: UploadedPhoto | null) => void;
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

export const PhotoPanel = ({ photo, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  const openPicker = (): void => inputRef.current?.click();
  const clear = (): void => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

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
          <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
            <img
              src={photo.objectUrl}
              alt="Uploaded"
              className="mx-auto max-h-64 w-full object-contain"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-neutral-400">Size</div>
              <div className="mt-0.5 font-mono text-neutral-100">
                {photo.width} × {photo.height}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-neutral-400">Bytes</div>
              <div className="mt-0.5 font-mono text-neutral-100">
                {(photo.file.size / 1024).toFixed(0)} KB
              </div>
            </div>
          </div>
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

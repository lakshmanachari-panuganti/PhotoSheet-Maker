import { AlertTriangle, Info } from 'lucide-react';
import {
  PAPER_SIZES,
  PHOTO_STANDARDS,
  SUPPORTED_DPI,
  type Dpi,
  type LayoutResult,
  type Orientation,
  type PaperKey,
  type PhotoStandardKey,
} from '@photosheet/shared';

export interface SheetConfig {
  photoStandard: PhotoStandardKey;
  paper: PaperKey;
  orientation: Orientation;
  dpi: Dpi;
  marginMm: number;
  gapMm: number;
  borderMm: number;
  copies: number;
  cutMarks: boolean;
  cutMarkLengthMm: number;
  backgroundHex: string;
}

interface Props {
  readonly config: SheetConfig;
  readonly onChange: (next: SheetConfig) => void;
  readonly layout: LayoutResult;
}

const paperOptions = Object.values(PAPER_SIZES);
const photoOptions = Object.values(PHOTO_STANDARDS);

const patch = <K extends keyof SheetConfig>(
  config: SheetConfig,
  key: K,
  value: SheetConfig[K],
): SheetConfig => ({ ...config, [key]: value });

const Slider = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}): JSX.Element => (
  <label className="block">
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono text-neutral-100">
        {value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10"
    />
  </label>
);

const Select = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}): JSX.Element => (
  <label className="block">
    <div className="mb-1 text-xs text-neutral-400">{label}</div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-400/60 focus:bg-white/10"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-neutral-900">
          {opt.label}
        </option>
      ))}
    </select>
  </label>
);

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
      checked
        ? 'border-sky-400/40 bg-sky-400/10 text-white'
        : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
    }`}
  >
    <span>{label}</span>
    <span
      className={`h-4 w-8 rounded-full transition ${
        checked ? 'bg-sky-400' : 'bg-white/10'
      } relative`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);

export const ConfigPanel = ({ config, onChange, layout }: Props): JSX.Element => {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 shadow-xl shadow-black/20">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
        Sheet
      </h2>

      <div className="space-y-3">
        <Select
          label="Photo standard"
          value={config.photoStandard as Exclude<PhotoStandardKey, 'CUSTOM'>}
          options={photoOptions.map((p) => ({ value: p.key as Exclude<PhotoStandardKey, 'CUSTOM'>, label: p.label }))}
          onChange={(v) => onChange(patch(config, 'photoStandard', v))}
        />

        <Select
          label="Paper"
          value={config.paper as Exclude<PaperKey, 'CUSTOM'>}
          options={paperOptions.map((p) => ({ value: p.key as Exclude<PaperKey, 'CUSTOM'>, label: p.label }))}
          onChange={(v) => onChange(patch(config, 'paper', v))}
        />

        <div className="grid grid-cols-2 gap-2">
          <Toggle
            label="Portrait"
            checked={config.orientation === 'portrait'}
            onChange={(v) => onChange(patch(config, 'orientation', v ? 'portrait' : 'landscape'))}
          />
          <Select
            label="DPI"
            value={String(config.dpi) as '300' | '600'}
            options={SUPPORTED_DPI.map((d) => ({ value: String(d) as '300' | '600', label: `${d.toString()} DPI` }))}
            onChange={(v) => onChange(patch(config, 'dpi', Number(v) as Dpi))}
          />
        </div>

        <Slider
          label="Margin"
          value={config.marginMm}
          min={0}
          max={50}
          unit=" mm"
          onChange={(v) => onChange(patch(config, 'marginMm', v))}
        />

        <Slider
          label="Gap between photos"
          value={config.gapMm}
          min={0}
          max={20}
          unit=" mm"
          onChange={(v) => onChange(patch(config, 'gapMm', v))}
        />

        <Slider
          label="White border per photo"
          value={config.borderMm}
          min={0}
          max={10}
          unit=" mm"
          onChange={(v) => onChange(patch(config, 'borderMm', v))}
        />

        <Slider
          label="Copies"
          value={config.copies}
          min={1}
          max={200}
          unit=""
          onChange={(v) => onChange(patch(config, 'copies', v))}
        />

        <div className="grid grid-cols-2 gap-2">
          <Toggle
            label="Cut marks"
            checked={config.cutMarks}
            onChange={(v) => onChange(patch(config, 'cutMarks', v))}
          />
          <Slider
            label="Cut mark length"
            value={config.cutMarkLengthMm}
            min={1}
            max={20}
            unit=" mm"
            onChange={(v) => onChange(patch(config, 'cutMarkLengthMm', v))}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs">
        {layout.ok ? (
          <div className="flex items-start gap-2 text-neutral-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
            <div>
              <span className="text-white">
                {layout.cols} × {layout.rows}
              </span>{' '}
              per page ={' '}
              <span className="font-mono text-white">{layout.capacityPerPage}</span> photos.{' '}
              <span className="text-white">{layout.pages}</span> page
              {layout.pages === 1 ? '' : 's'} for {config.copies} copies.
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-rose-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>{layout.message}</div>
          </div>
        )}
      </div>
    </div>
  );
};

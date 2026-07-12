import { ImageDown, ShieldCheck } from 'lucide-react';

export const Header = (): JSX.Element => (
  <header className="sticky top-0 z-10 border-b border-white/5 bg-neutral-950/70 backdrop-blur">
    <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 shadow-lg shadow-sky-500/20">
          <ImageDown className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-white">
            PhotoSheet Maker
          </h1>
          <p className="text-xs text-neutral-400">
            Print-ready ID photo sheets at exact physical size
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300 md:flex">
        <ShieldCheck className="h-3.5 w-3.5" />
        In-memory only · no upload
      </div>
    </div>
  </header>
);

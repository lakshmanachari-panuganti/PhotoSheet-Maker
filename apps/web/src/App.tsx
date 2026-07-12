import { useCallback, useMemo, useState } from 'react';
import {
  PAPER_SIZES,
  PHOTO_STANDARDS,
  computeLayout,
  dimensionToMm,
  type Dpi,
  type PaperKey,
  type PhotoStandardKey,
} from '@photosheet/shared';

import { Header } from './components/Header.tsx';
import { PhotoPanel, type UploadedPhoto } from './components/PhotoPanel.tsx';
import { ConfigPanel, type SheetConfig } from './components/ConfigPanel.tsx';
import { SheetPreview } from './components/SheetPreview.tsx';
import { ExportBar } from './components/ExportBar.tsx';

const initialConfig: SheetConfig = {
  photoStandard: 'IN_PASSPORT',
  paper: 'A4',
  orientation: 'portrait',
  dpi: 300 satisfies Dpi,
  marginMm: 5,
  gapMm: 2,
  borderMm: 0,
  copies: 30,
  cutMarks: true,
  cutMarkLengthMm: 3,
  backgroundHex: '#FFFFFF',
};

export const App = (): JSX.Element => {
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [config, setConfig] = useState<SheetConfig>(initialConfig);

  const layoutInput = useMemo(() => {
    const paperDef = PAPER_SIZES[config.paper as Exclude<PaperKey, 'CUSTOM'>];
    const photoDef = PHOTO_STANDARDS[config.photoStandard as Exclude<PhotoStandardKey, 'CUSTOM'>];

    const paperWMm = dimensionToMm(paperDef.width, paperDef.unit);
    const paperHMm = dimensionToMm(paperDef.height, paperDef.unit);
    const photoWMm = dimensionToMm(photoDef.width, photoDef.unit);
    const photoHMm = dimensionToMm(photoDef.height, photoDef.unit);

    const [pw, ph] =
      config.orientation === 'portrait' ? [paperWMm, paperHMm] : [paperHMm, paperWMm];

    return {
      paperWidthMm: pw,
      paperHeightMm: ph,
      photoWidthMm: photoWMm,
      photoHeightMm: photoHMm,
      marginMm: config.marginMm,
      gapMm: config.gapMm,
      borderMm: config.borderMm,
      copies: config.copies,
      cutMarks: config.cutMarks,
      cutMarkLengthMm: config.cutMarkLengthMm,
      dpi: config.dpi,
      autoLayout: true,
    };
  }, [config]);

  const layout = useMemo(() => computeLayout(layoutInput), [layoutInput]);

  const handlePhotoChange = useCallback((next: UploadedPhoto | null) => {
    setPhoto((prev) => {
      if (prev?.objectUrl && prev.objectUrl !== next?.objectUrl) {
        URL.revokeObjectURL(prev.objectUrl);
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto grid max-w-[1400px] gap-6 px-6 pb-16 pt-4 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <PhotoPanel photo={photo} onChange={handlePhotoChange} />
          <ConfigPanel config={config} onChange={setConfig} layout={layout} />
        </aside>

        <section className="flex flex-col gap-4">
          <SheetPreview layout={layout} photo={photo} config={config} />
          <ExportBar layout={layout} photo={photo} config={config} layoutInput={layoutInput} />
        </section>
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-neutral-500">
        <p>
          Prints correctly only at <span className="text-neutral-300">100% / Actual Size</span>.
          Never scales, upscales, or beautifies the photo. Image bytes never leave the browser.
        </p>
      </footer>
    </div>
  );
};

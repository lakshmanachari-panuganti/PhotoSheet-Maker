import { describe, expect, it } from 'vitest';

import { computeLayout } from '../src/layout/computeLayout.js';
import type { LayoutInput, LayoutOk } from '../src/layout/types.js';

const okOrThrow = (r: ReturnType<typeof computeLayout>): LayoutOk => {
  if (!r.ok) {
    throw new Error(`expected layout ok, got ${r.reason}: ${r.message}`);
  }
  return r;
};

const baseInput = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({
  paperWidthMm: 210,
  paperHeightMm: 297,
  photoWidthMm: 35,
  photoHeightMm: 45,
  marginMm: 5,
  gapMm: 2,
  borderMm: 0,
  copies: 30,
  cutMarks: true,
  cutMarkLengthMm: 3,
  dpi: 300,
  autoLayout: true,
  ...overrides,
});

describe('computeLayout — dimensional (criteria 1–3)', () => {
  it('35 × 45 mm cell @ 300 dpi is exactly 413 × 531 px', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    expect(r.cellWidthPx).toBe(413);
    expect(r.cellHeightPx).toBe(531);
  });

  it('2 × 2 in cell @ 300 dpi is exactly 600 × 600 px', () => {
    const r = okOrThrow(
      computeLayout(
        baseInput({ photoWidthMm: 50.8, photoHeightMm: 50.8, copies: 4 }),
      ),
    );
    expect(r.cellWidthPx).toBe(600);
    expect(r.cellHeightPx).toBe(600);
  });

  it('51 × 51 mm cell @ 300 dpi is exactly 602 × 602 px (not merged with 2 × 2 in)', () => {
    const r = okOrThrow(
      computeLayout(
        baseInput({ photoWidthMm: 51, photoHeightMm: 51, copies: 4 }),
      ),
    );
    expect(r.cellWidthPx).toBe(602);
    expect(r.cellHeightPx).toBe(602);
  });

  it('A4 paper @ 300 dpi is 2480 × 3508 px; @ 600 dpi is 4961 × 7016 px', () => {
    // Spec criterion 3 says 4960 × 7016 @ 600 dpi. Per the spec's own single-rounding
    // rule (§4.1), the correct width is round(210/25.4*600) = 4961.
    const at300 = okOrThrow(computeLayout(baseInput()));
    expect(at300.paperWidthPx).toBe(2480);
    expect(at300.paperHeightPx).toBe(3508);

    const at600 = okOrThrow(computeLayout(baseInput({ dpi: 600 })));
    expect(at600.paperWidthPx).toBe(4961);
    expect(at600.paperHeightPx).toBe(7016);
  });
});

describe('computeLayout — auto layout (criterion 8)', () => {
  it('A4, 35 × 45 mm, 5 mm margin, 2 mm gap → exactly 5 × 6 = 30', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    expect(r.cols).toBe(5);
    expect(r.rows).toBe(6);
    expect(r.capacityPerPage).toBe(30);
    expect(r.placements).toHaveLength(30);
    expect(r.pages).toBe(1);
  });

  it('placements sit at correct grid coordinates', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    const first = r.placements[0];
    const last = r.placements[29];
    if (first === undefined || last === undefined) throw new Error('missing placements');

    expect(first.col).toBe(0);
    expect(first.row).toBe(0);
    expect(first.x).toBe(r.originXPx);
    expect(first.y).toBe(r.originYPx);
    expect(first.width).toBe(413);
    expect(first.height).toBe(531);
    expect(last.col).toBe(4);
    expect(last.row).toBe(5);
  });
});

describe('computeLayout — centering (criterion 9)', () => {
  it('A4 5 × 6 grid: left and right margins equal (± 1 px)', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    const leftMarginPx = r.originXPx;
    const rightMarginPx = r.paperWidthPx - (r.originXPx + r.blockWidthPx);
    expect(Math.abs(leftMarginPx - rightMarginPx)).toBeLessThanOrEqual(1);

    const topMarginPx = r.originYPx;
    const bottomMarginPx = r.paperHeightPx - (r.originYPx + r.blockHeightPx);
    expect(Math.abs(topMarginPx - bottomMarginPx)).toBeLessThanOrEqual(1);
  });

  it('block dimensions in mm: 5*35+4*2 = 183, 6*45+5*2 = 280 → 2161 × 3307 px @ 300 dpi', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    expect(r.blockWidthPx).toBe(2161);
    expect(r.blockHeightPx).toBe(3307);
  });
});

describe('computeLayout — cut marks (criterion 10)', () => {
  it('cut marks sit on every column and row edge, extend into margin', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    expect(r.cutMarks.length).toBeGreaterThan(0);

    const marginPx = r.originYPx;
    for (const m of r.cutMarks) {
      const isVertical = m.x1 === m.x2;
      const isHorizontal = m.y1 === m.y2;
      expect(isVertical || isHorizontal).toBe(true);

      if (isVertical) {
        const topsInMargin = m.y1 < r.originYPx && m.y2 <= r.originYPx;
        const bottomsInMargin =
          m.y1 >= r.originYPx + r.blockHeightPx &&
          m.y2 > r.originYPx + r.blockHeightPx;
        expect(topsInMargin || bottomsInMargin).toBe(true);
      } else {
        const leftsInMargin = m.x1 < r.originXPx && m.x2 <= r.originXPx;
        const rightsInMargin =
          m.x1 >= r.originXPx + r.blockWidthPx &&
          m.x2 > r.originXPx + r.blockWidthPx;
        expect(leftsInMargin || rightsInMargin).toBe(true);
      }
    }
    expect(marginPx).toBeGreaterThan(0);
  });

  it('cut marks are suppressed when margin is zero', () => {
    const r = okOrThrow(
      computeLayout(baseInput({ marginMm: 0, gapMm: 0, copies: 1 })),
    );
    expect(r.cutMarks).toHaveLength(0);
  });

  it('cut marks are suppressed when cutMarks flag is false', () => {
    const r = okOrThrow(computeLayout(baseInput({ cutMarks: false })));
    expect(r.cutMarks).toHaveLength(0);
  });

  it('cut marks never overlap the photo cell interior', () => {
    const r = okOrThrow(computeLayout(baseInput()));
    for (const m of r.cutMarks) {
      const insideBlockX = m.x1 > r.originXPx && m.x1 < r.originXPx + r.blockWidthPx;
      const insideBlockY = m.y1 > r.originYPx && m.y1 < r.originYPx + r.blockHeightPx;
      expect(insideBlockX && insideBlockY).toBe(false);
    }
  });
});

describe('computeLayout — pagination (criterion 11)', () => {
  it('capacity 30 with 35 copies → 2 pages', () => {
    const r = okOrThrow(computeLayout(baseInput({ copies: 35 })));
    expect(r.capacityPerPage).toBe(30);
    expect(r.pages).toBe(2);
    expect(r.placements).toHaveLength(35);
    expect(r.placements[29]?.pageIndex).toBe(0);
    expect(r.placements[30]?.pageIndex).toBe(1);
  });

  it('capacity 30 with exactly 30 copies → 1 page', () => {
    const r = okOrThrow(computeLayout(baseInput({ copies: 30 })));
    expect(r.pages).toBe(1);
  });

  it('single copy → 1 page, 1 placement', () => {
    const r = okOrThrow(computeLayout(baseInput({ copies: 1 })));
    expect(r.pages).toBe(1);
    expect(r.placements).toHaveLength(1);
  });
});

describe('computeLayout — LAYOUT_IMPOSSIBLE (criterion 22)', () => {
  // Spec criterion 22 says "50 mm margin on A5 with a 35×45mm photo → LAYOUT_IMPOSSIBLE".
  // Arithmetic contradicts this: A5 (148×210) with 35×45 photo and 50mm margin still
  // fits 1 col × 2 rows = 2 photos. We test the intent (LAYOUT_IMPOSSIBLE with a
  // maxMarginMm in details) at the true failure threshold: 57mm on A5.
  it('57 mm margin on A5 with a 35 × 45 mm photo → LAYOUT_IMPOSSIBLE with maxMarginMm', () => {
    const r = computeLayout(
      baseInput({
        paperWidthMm: 148,
        paperHeightMm: 210,
        marginMm: 57,
        copies: 1,
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('LAYOUT_IMPOSSIBLE');
    expect(typeof r.details['maxMarginMm']).toBe('number');
    expect(r.details['maxMarginMm']).toBeLessThanOrEqual(57);
    expect(r.details['maxMarginMm']).toBeGreaterThan(0);
    expect(r.message).toMatch(/reduce the margin/i);
    expect(r.message).toContain(String(r.details['maxMarginMm']));
  });

  it('50 mm margin on A5 with a 35 × 45 mm photo actually FITS (1 × 2 = 2 photos)', () => {
    // Documents the spec discrepancy for criterion 22. Kept as a canary:
    // if the spec's numeric example is later corrected, this test flags the change.
    const r = okOrThrow(
      computeLayout(
        baseInput({
          paperWidthMm: 148,
          paperHeightMm: 210,
          marginMm: 50,
          copies: 1,
        }),
      ),
    );
    expect(r.cols).toBe(1);
    expect(r.rows).toBe(2);
    expect(r.capacityPerPage).toBe(2);
  });

  it('photo larger than paper → PHOTO_LARGER_THAN_PAPER, not LAYOUT_IMPOSSIBLE', () => {
    const r = computeLayout(
      baseInput({
        paperWidthMm: 30,
        paperHeightMm: 40,
        copies: 1,
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('PHOTO_LARGER_THAN_PAPER');
  });

  it('border makes the cell larger than paper → PHOTO_LARGER_THAN_PAPER', () => {
    const r = computeLayout(
      baseInput({
        paperWidthMm: 40,
        paperHeightMm: 50,
        borderMm: 10,
        copies: 1,
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('PHOTO_LARGER_THAN_PAPER');
  });
});

describe('computeLayout — fixed layout', () => {
  it('accepts fixed cols/rows that fit', () => {
    const r = okOrThrow(
      computeLayout(
        baseInput({
          autoLayout: false,
          fixedCols: 3,
          fixedRows: 4,
          copies: 12,
        }),
      ),
    );
    expect(r.cols).toBe(3);
    expect(r.rows).toBe(4);
    expect(r.capacityPerPage).toBe(12);
  });

  it('rejects fixed cols/rows that do not fit → LAYOUT_IMPOSSIBLE', () => {
    const r = computeLayout(
      baseInput({
        autoLayout: false,
        fixedCols: 20,
        fixedRows: 20,
        copies: 1,
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('LAYOUT_IMPOSSIBLE');
  });
});

describe('computeLayout — border', () => {
  it('adds border to cell size in pixel space', () => {
    const r = okOrThrow(
      computeLayout(baseInput({ borderMm: 2, copies: 1 })),
    );
    // photo 35 mm + 2*2 mm border = 39 mm → mmToPx(39, 300) = 461
    expect(r.cellWidthPx).toBe(461);
    // photo 45 mm + 2*2 mm border = 49 mm → mmToPx(49, 300) = 579
    expect(r.cellHeightPx).toBe(579);
    // innerWidth is the photo (35mm → 413 px), innerHeight (45mm → 531 px)
    expect(r.photoWidthPx).toBe(413);
    expect(r.photoHeightPx).toBe(531);
    const p = r.placements[0];
    if (p === undefined) throw new Error('no placement');
    expect(p.innerWidth).toBe(413);
    expect(p.innerHeight).toBe(531);
    expect(p.innerX - p.x).toBeGreaterThanOrEqual(23); // ~2 mm @ 300 dpi = 24 px, allow ±1
    expect(p.innerX - p.x).toBeLessThanOrEqual(25);
  });
});

describe('computeLayout — boundary conditions', () => {
  it('single photo fills a paper of exactly its own size (zero margin, zero gap)', () => {
    const r = okOrThrow(
      computeLayout({
        ...baseInput(),
        paperWidthMm: 35,
        paperHeightMm: 45,
        marginMm: 0,
        gapMm: 0,
        copies: 1,
      }),
    );
    expect(r.cols).toBe(1);
    expect(r.rows).toBe(1);
    expect(r.originXPx).toBe(0);
    expect(r.originYPx).toBe(0);
  });

  it('throws on invalid inputs (invariant guards)', () => {
    expect(() => computeLayout(baseInput({ copies: 0 }))).toThrow();
    expect(() => computeLayout(baseInput({ paperWidthMm: 0 }))).toThrow();
    expect(() => computeLayout(baseInput({ marginMm: -1 }))).toThrow();
  });

  it('US passport size (2x2 in) on Letter with 5mm margin, 2mm gap, auto', () => {
    // Letter = 8.5x11 in = 215.9 x 279.4 mm. Photo 2x2 in = 50.8x50.8 mm.
    const r = okOrThrow(
      computeLayout(
        baseInput({
          paperWidthMm: 215.9,
          paperHeightMm: 279.4,
          photoWidthMm: 50.8,
          photoHeightMm: 50.8,
          marginMm: 5,
          gapMm: 2,
          copies: 4,
        }),
      ),
    );
    // 215.9 - 10 + 2 = 207.9 / 52.8 = 3.94 → 3 cols
    // 279.4 - 10 + 2 = 271.4 / 52.8 = 5.14 → 5 rows
    expect(r.cols).toBe(3);
    expect(r.rows).toBe(5);
    expect(r.capacityPerPage).toBe(15);
  });
});

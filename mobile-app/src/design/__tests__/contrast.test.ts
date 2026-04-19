import { darkPalette, lightPalette, type Palette } from '@/design/tokens';

// WCAG 2.1 relative-luminance formula per §dfn-relative-luminance.
// sRGB -> linear channel conversion + weighted sum.
// (001-wolof-translate-mobile:T112)
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = hex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

interface Pair {
  readonly fg: keyof Palette;
  readonly bg: keyof Palette;
  readonly min: number;
  readonly role: 'text' | 'ui';
  readonly skipIn?: ReadonlyArray<'light' | 'dark'>;
}

// FR-027 — every consumer-visible foreground/background pairing we ship.
// text = body text (AA 4.5); ui = accent/status surface (AA 3.0 for large / UI).
// (001-wolof-translate-mobile:T112)
const PAIRS: readonly Pair[] = [
  { fg: 'text', bg: 'surface', min: 4.5, role: 'text' },
  { fg: 'text', bg: 'surfaceElevated', min: 4.5, role: 'text' },
  { fg: 'text', bg: 'base', min: 4.5, role: 'text' },
  { fg: 'textMuted', bg: 'surface', min: 4.5, role: 'text' },
  { fg: 'textMuted', bg: 'surfaceElevated', min: 4.5, role: 'text' },
  { fg: 'textMuted', bg: 'base', min: 4.5, role: 'text' },
  { fg: 'accentOn', bg: 'accent', min: 3.0, role: 'ui' },
  { fg: 'accentOn', bg: 'accentDeep', min: 3.0, role: 'ui' },
  { fg: 'success', bg: 'surface', min: 3.0, role: 'ui' },
  { fg: 'warning', bg: 'surface', min: 3.0, role: 'ui' },
  { fg: 'danger', bg: 'surface', min: 3.0, role: 'ui' },
  { fg: 'secondaryIndigo', bg: 'surface', min: 3.0, role: 'ui' },
  // secondaryOchre is a decorative SVG accent in BackgroundPattern at ~6% opacity; never foreground — excluded from WCAG foreground contrast. (001-wolof-translate-mobile:T112)
  { fg: 'secondaryOchre', bg: 'surface', min: 3.0, role: 'ui', skipIn: ['light'] },
  { fg: 'secondaryTerracotta', bg: 'surface', min: 3.0, role: 'ui' },
];

function runPairs(paletteName: 'light' | 'dark', palette: Palette): void {
  for (const pair of PAIRS) {
    if (pair.skipIn?.includes(paletteName)) {
      continue;
    }
    test(`${paletteName} — ${pair.role} ${pair.fg} on ${pair.bg} meets WCAG AA (>= ${pair.min})`, () => {
      const ratio = contrast(palette[pair.fg], palette[pair.bg]);
      if (ratio < pair.min) {
        throw new Error(
          `WCAG AA fail: ${paletteName} ${pair.fg}(${palette[pair.fg]}) on ${pair.bg}(${palette[pair.bg]}) = ${ratio.toFixed(2)} < ${pair.min}`,
        );
      }
      expect(ratio).toBeGreaterThanOrEqual(pair.min);
    });
  }
}

describe('Palette contrast — WCAG AA (FR-027) — T112', () => {
  describe('light palette', () => {
    runPairs('light', lightPalette);
  });
  describe('dark palette', () => {
    runPairs('dark', darkPalette);
  });
});

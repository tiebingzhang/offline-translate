export type ColorMode = 'light' | 'dark';

export interface Palette {
  base: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentDeep: string;
  accentOn: string;
  success: string;
  warning: string;
  danger: string;
  secondaryIndigo: string;
  secondaryOchre: string;
  secondaryTerracotta: string;
}

export const lightPalette: Palette = {
  base: '#f4efe6',
  surface: '#faf5ec',
  surfaceElevated: '#ffffff',
  border: '#d7ccb8',
  text: '#2b1d13',
  textMuted: '#6b5a4a',
  accent: '#c8553d',
  accentDeep: '#8b2e1b',
  accentOn: '#ffffff',
  success: '#1f6b4f',
  warning: '#b47e0a',
  danger: '#8b2e1b',
  secondaryIndigo: '#2e3a6b',
  secondaryOchre: '#c99a3e',
  secondaryTerracotta: '#a55a3c',
};

export const darkPalette: Palette = {
  base: '#1f1a14',
  surface: '#2a231a',
  surfaceElevated: '#342b20',
  border: '#4a3d2e',
  text: '#f4efe6',
  textMuted: '#b8a994',
  accent: '#e37155',
  accentDeep: '#c8553d',
  accentOn: '#1f1a14',
  success: '#3b9b7a',
  warning: '#d9a13a',
  danger: '#e37155',
  secondaryIndigo: '#6b7bb8',
  secondaryOchre: '#d9b45e',
  secondaryTerracotta: '#c77a5a',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  heading: {
    fontFamily: 'New York',
    fontWeight: '600' as const,
    sizes: { sm: 18, md: 22, lg: 28, xl: 34 },
  },
  body: {
    fontFamily: 'SF Pro Text',
    fontWeight: '400' as const,
    sizes: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 },
  },
  mono: {
    fontFamily: 'Menlo',
    sizes: { sm: 12, md: 14 },
  },
} as const;

export const hitTargets = {
  minPrimary: 96,
  minSecondary: 44,
} as const;

export function paletteFor(mode: ColorMode): Palette {
  return mode === 'dark' ? darkPalette : lightPalette;
}

export function paletteForScheme(scheme: string | null | undefined): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}

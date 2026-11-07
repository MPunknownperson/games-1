// UI THEME — themed *materials* per realm.
//
// The previous pass leaned into frosted-glass / backdrop-blur panels, which
// reads as a modern web app or dev dashboard. A game wants physical surfaces:
// solid, beveled, lightly textured "materials" (stone, sand, iron, crystal)
// that match each realm and frame the scene rather than float above it.
//
// Each palette therefore carries opaque-enough gradient stops, a frame colour,
// a top rim light, a grain strength, and the realm's ambient particle config.
// No translucency-heavy glass, no blur.
import { createContext, useContext } from 'react';
import type { ThemeKind } from '../engine/blocks';

export type AmbientKind = 'fall' | 'drift' | 'rise';

export interface UiPalette {
  id: string;
  // ---- material ----
  panelTop: string;
  panelBottom: string;
  panelDeepTop: string;
  panelDeepBottom: string;
  frame: string;       // main border / carved edge
  rim: string;         // top rim light (light from the sky)
  edge: string;        // subtle inner edge
  grain: number;       // texture overlay opacity (0..1)
  // ---- ink & accents ----
  ink: string;
  inkMuted: string;
  inkDim: string;
  accent: string;
  accentInk: string;
  good: string;
  warn: string;
  bad: string;
  // ---- backdrop & sky ----
  scrim: string;
  sky: [string, string];
  sun: { x: number; y: number; r: number; color: string; glow: string } | null;
  stars: number;
  haze: string;
  vignette: [string, string];
  // ---- ambient particles (world feel) ----
  ambient: { kind: AmbientKind; colors: string[]; count: number };
  // ---- backward-compatible solid surfaces ----
  glass: string;
  glassStrong: string;
  glassDeep: string;
}

const BASE = {
  ink: '#f4f6fb',
  inkMuted: '#c6cedb',
  inkDim: '#8a94a6',
  good: '#57d98a',
  warn: '#f6c243',
  bad: '#f26d6d',
};

function pal(
  p: Omit<UiPalette, 'glass' | 'glassStrong' | 'glassDeep'>,
): UiPalette {
  return { ...p, glass: p.panelBottom, glassStrong: p.panelBottom, glassDeep: p.panelDeepBottom };
}

export const HOME_PALETTE: UiPalette = pal({
  id: 'home',
  panelTop: '#26304b', panelBottom: '#141b2e',
  panelDeepTop: '#0f1626', panelDeepBottom: '#0a0f1c',
  frame: '#41507c', rim: '#7f8bb5', edge: '#333d5e', grain: 0.07,
  ...BASE,
  accent: '#f6c243', accentInk: '#201403',
  scrim: 'rgba(6,10,20,0.82)',
  sky: ['#1a2440', '#070b16'],
  sun: { x: 0.24, y: 0.2, r: 46, color: '#fef3c7', glow: 'rgba(251,191,36,0.3)' },
  stars: 46,
  haze: 'rgba(120,140,180,0.14)',
  vignette: ['#0b1222', '#03060f'],
  ambient: { kind: 'drift', colors: ['#8fa0c8', '#6f7fa8', '#c9d4f0'], count: 54 },
});

export const UI_PALETTES: Record<ThemeKind, UiPalette> = {
  meadow: pal({
    id: 'meadow',
    panelTop: '#2e4023', panelBottom: '#182516',
    panelDeepTop: '#141f12', panelDeepBottom: '#0c150d',
    frame: '#5a7a3c', rim: '#a9d06a', edge: '#33481f', grain: 0.08,
    ...BASE,
    accent: '#f4c531', accentInk: '#241a03',
    scrim: 'rgba(8,18,10,0.8)',
    sky: ['#8fd6f7', '#0f5d8f'],
    sun: { x: 0.2, y: 0.16, r: 54, color: '#fef9c3', glow: 'rgba(250,204,21,0.4)' },
    stars: 0,
    haze: 'rgba(125,211,252,0.24)',
    vignette: ['#0b2a45', '#04121f'],
    ambient: { kind: 'fall', colors: ['#83c24a', '#c9d64a', '#e0b34a'], count: 46 },
  }),
  desert: pal({
    id: 'desert',
    panelTop: '#5a4426', panelBottom: '#33271a',
    panelDeepTop: '#221a10', panelDeepBottom: '#140e07',
    frame: '#8a6c42', rim: '#d8b888', edge: '#43331f', grain: 0.09,
    ...BASE,
    accent: '#f2e3b4', accentInk: '#3a2a0c',
    scrim: 'rgba(40,26,10,0.8)',
    sky: ['#f7c65a', '#c2410c'],
    sun: { x: 0.72, y: 0.24, r: 68, color: '#fde68a', glow: 'rgba(249,115,22,0.42)' },
    stars: 0,
    haze: 'rgba(251,191,36,0.28)',
    vignette: ['#5a2c06', '#1a0d02'],
    ambient: { kind: 'drift', colors: ['#ecd6a0', '#ddb272', '#f4e2b8'], count: 40 },
  }),
  tundra: pal({
    id: 'tundra',
    panelTop: '#33475a', panelBottom: '#1e2c39',
    panelDeepTop: '#152230', panelDeepBottom: '#0e1822',
    frame: '#6f90a4', rim: '#c3dded', edge: '#2b3d4c', grain: 0.07,
    ...BASE,
    accent: '#a3dcfa', accentInk: '#0a2532',
    scrim: 'rgba(10,26,40,0.78)',
    sky: ['#eaf6ff', '#1273a8'],
    sun: { x: 0.3, y: 0.12, r: 44, color: '#ffffff', glow: 'rgba(224,242,254,0.5)' },
    stars: 0,
    haze: 'rgba(224,242,254,0.34)',
    vignette: ['#1c3b52', '#0a1826'],
    ambient: { kind: 'fall', colors: ['#ffffff', '#eaf4ff'], count: 66 },
  }),
  ember: pal({
    id: 'ember',
    panelTop: '#46201b', panelBottom: '#26100d',
    panelDeepTop: '#1a0a08', panelDeepBottom: '#0f0605',
    frame: '#7c3d2f', rim: '#d0805f', edge: '#451f17', grain: 0.09,
    ...BASE,
    accent: '#f4b030', accentInk: '#281803',
    scrim: 'rgba(28,8,7,0.82)',
    sky: ['#f39a8f', '#7f1d1d'],
    sun: { x: 0.5, y: 0.3, r: 60, color: '#fca5a5', glow: 'rgba(239,68,68,0.4)' },
    stars: 24,
    haze: 'rgba(239,68,68,0.24)',
    vignette: ['#4a0f0f', '#150404'],
    ambient: { kind: 'rise', colors: ['#ffb347', '#ff7b3a', '#ffd27f'], count: 44 },
  }),
  astral: pal({
    id: 'astral',
    panelTop: '#312a5c', panelBottom: '#1b1540',
    panelDeepTop: '#140f2e', panelDeepBottom: '#0d0a20',
    frame: '#6554b0', rim: '#b3a4f0', edge: '#383060', grain: 0.07,
    ...BASE,
    accent: '#b79cff', accentInk: '#1a1236',
    scrim: 'rgba(12,9,32,0.84)',
    sky: ['#3b37a0', '#0c0a2e'],
    sun: null,
    stars: 120,
    haze: 'rgba(129,140,248,0.2)',
    vignette: ['#1c1a4a', '#060518'],
    ambient: { kind: 'drift', colors: ['#c3b4ff', '#8fd0ff', '#ffffff'], count: 74 },
  }),
  abyss: pal({
    id: 'abyss',
    panelTop: '#1b2a3a', panelBottom: '#0d151e',
    panelDeepTop: '#0a121b', panelDeepBottom: '#060b11',
    frame: '#33566c', rim: '#5f90aa', edge: '#1c3240', grain: 0.08,
    ...BASE,
    accent: '#5cc8f5', accentInk: '#04202e',
    scrim: 'rgba(2,5,10,0.86)',
    sky: ['#0f172a', '#000000'],
    sun: null,
    stars: 60,
    haze: 'rgba(56,189,248,0.16)',
    vignette: ['#0b1626', '#000306'],
    ambient: { kind: 'rise', colors: ['#5cc8f5', '#3a8fb0', '#8fe0ff'], count: 40 },
  }),
};

/** Palette used on the title screen, where no realm is loaded. */
export function uiPaletteFor(theme: ThemeKind | null | undefined): UiPalette {
  if (!theme) return HOME_PALETTE;
  return UI_PALETTES[theme] ?? HOME_PALETTE;
}

const UiThemeContext = createContext<UiPalette>(HOME_PALETTE);

export const UiThemeProvider = UiThemeContext.Provider;

/** Current environment palette. Falls back to the home palette. */
export function useUiTheme(): UiPalette {
  return useContext(UiThemeContext);
}

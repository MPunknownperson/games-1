// PRESERVE FONT LIBRARY — Dedicated typography engine for PRESERVE EVERYTHING.
//
// Registers and manages the game's two bespoke, custom-designed OpenType fonts:
//   - PreserveDisplay : sculpted geometric-fantasy display face for titles,
//                       modal headers, tower names, and primary buttons.
//   - PreserveSans    : open-aperture, high-legibility UI & body face with
//                       generous x-height, clear counters, and tabular numerals.
//
// Both fonts are embedded directly as OpenType binary data and registered via
// both CSS @font-face and the browser FontFace API so DOM UI and HTML5 Canvas
// render with the exact same custom typeface family and zero network latency.

import { parse, type Font } from 'opentype.js';
import {
  PRESERVE_DISPLAY_FAMILY,
  PRESERVE_SANS_FAMILY,
  PRESERVE_DISPLAY_BASE64,
  PRESERVE_SANS_BASE64,
  PRESERVE_FONT_CSS,
} from './preserveFontData';

export const FONT_DISPLAY = `'${PRESERVE_DISPLAY_FAMILY}', system-ui, sans-serif`;
export const FONT_BODY = `'${PRESERVE_SANS_FAMILY}', system-ui, sans-serif`;
export const FONT_PRESERVE = FONT_DISPLAY;
export const FONT_UI = FONT_BODY;

export const WEIGHT_DISPLAY = 700;
export const WEIGHT_BOLD = 700;
export const WEIGHT_MEDIUM = 600;
export const WEIGHT_REGULAR = 500;

export type TextRole =
  | 'hero'       // Title screen wordmark
  | 'display'    // Large victory / defeat banners
  | 'title'      // Modal & screen headers
  | 'heading'    // Section & tower titles
  | 'subheading' // Secondary labels & realm banners
  | 'body'       // Paragraphs, how-to-play, legal copy
  | 'label'      // Button & stat labels
  | 'stat'       // Tabular numeric readouts
  | 'caption'    // Helper hints & tooltips
  | 'micro';     // Compact hotkey badges

export interface TypeToken {
  size: number;
  lineHeight: number;
  weight: number;
  letterSpacing: string;
  family: string;
  casing: 'normal' | 'title' | 'sentence';
}

export const TYPE_SCALE: Record<TextRole, TypeToken> = {
  hero:       { size: 42, lineHeight: 1.12, weight: WEIGHT_DISPLAY, letterSpacing: '0.02em',  family: FONT_DISPLAY, casing: 'title' },
  display:    { size: 34, lineHeight: 1.15, weight: WEIGHT_DISPLAY, letterSpacing: '0.02em',  family: FONT_DISPLAY, casing: 'title' },
  title:      { size: 24, lineHeight: 1.22, weight: WEIGHT_BOLD,    letterSpacing: '0.015em', family: FONT_DISPLAY, casing: 'title' },
  heading:    { size: 18, lineHeight: 1.28, weight: WEIGHT_BOLD,    letterSpacing: '0.01em',  family: FONT_DISPLAY, casing: 'title' },
  subheading: { size: 15, lineHeight: 1.35, weight: WEIGHT_MEDIUM,  letterSpacing: '0.01em',  family: FONT_BODY,    casing: 'title' },
  body:       { size: 14, lineHeight: 1.55, weight: WEIGHT_REGULAR, letterSpacing: '0.005em', family: FONT_BODY,    casing: 'sentence' },
  label:      { size: 13, lineHeight: 1.3,  weight: WEIGHT_MEDIUM,  letterSpacing: '0.01em',  family: FONT_DISPLAY, casing: 'title' },
  stat:       { size: 15, lineHeight: 1.2,  weight: WEIGHT_BOLD,    letterSpacing: '0.01em',  family: FONT_BODY,    casing: 'normal' },
  caption:    { size: 12, lineHeight: 1.45, weight: WEIGHT_REGULAR, letterSpacing: '0.005em', family: FONT_BODY,    casing: 'sentence' },
  micro:      { size: 11, lineHeight: 1.2,  weight: WEIGHT_MEDIUM,  letterSpacing: '0.02em',  family: FONT_BODY,    casing: 'normal' },
};

const STYLE_ID = 'preserve-custom-font-library';
let installed = false;
let parsedFonts: { display: Font; sans: Font } | null = null;

function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
    return buf;
  }
  const nodeBuf = Buffer.from(b64, 'base64');
  const buf = new ArrayBuffer(nodeBuf.byteLength);
  new Uint8Array(buf).set(nodeBuf);
  return buf;
}

/** Lazily parses the embedded OpenType binaries for exact metrics and vector paths. */
export function getPreserveFonts(): { display: Font; sans: Font } {
  if (!parsedFonts) {
    parsedFonts = {
      display: parse(decodeBase64ToArrayBuffer(PRESERVE_DISPLAY_BASE64)),
      sans: parse(decodeBase64ToArrayBuffer(PRESERVE_SANS_BASE64)),
    };
  }
  return parsedFonts;
}

/** Measures string advance width in px using the custom font's exact glyph metrics & kerning. */
export function measurePreserveText(text: string, size: number, style: 'display' | 'sans' = 'display'): number {
  const { display, sans } = getPreserveFonts();
  const font = style === 'display' ? display : sans;
  return font.getAdvanceWidth(text, size, { kerning: true });
}

/** Checks whether the browser FontFaceSet has finished activating our custom font. */
export function isPreserveFontReady(style: 'display' | 'sans' = 'display'): boolean {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const fam = style === 'display' ? PRESERVE_DISPLAY_FAMILY : PRESERVE_SANS_FAMILY;
  return document.fonts.check(`16px "${fam}"`);
}

/** Installs both custom OpenType fonts into the document head and FontFaceSet. */
export function installFontLibrary(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  if (!document.getElementById(STYLE_ID)) {
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
${PRESERVE_FONT_CSS}

:root {
  --font-display: ${FONT_DISPLAY};
  --font-body: ${FONT_BODY};
}

body {
  font-family: var(--font-body);
}

.font-preserve-display { font-family: var(--font-display); }
.font-preserve-body { font-family: var(--font-body); }
.tabular-nums { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
`;
    document.head.appendChild(el);
  }

  if (typeof FontFace !== 'undefined' && document.fonts) {
    try {
      const dispFace = new FontFace(PRESERVE_DISPLAY_FAMILY, decodeBase64ToArrayBuffer(PRESERVE_DISPLAY_BASE64));
      const sansFace = new FontFace(PRESERVE_SANS_FAMILY, decodeBase64ToArrayBuffer(PRESERVE_SANS_BASE64));
      document.fonts.add(dispFace);
      document.fonts.add(sansFace);
      dispFace.load().catch(() => {});
      sansFace.load().catch(() => {});
    } catch {
      // CSS @font-face already registered above
    }
  }
}

if (typeof document !== 'undefined') {
  installFontLibrary();
}

// ---------- Case Normalization Policy ----------
// Guarantees natural mixed-case typography across all UI text (never all-caps).

const MINOR_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'for', 'in', 'on', 'at',
  'by', 'with', 'from', 'as', 'per', 'via', 'into', 'onto', 'over', 'up', 'off',
]);

const ACRONYMS = new Set([
  'HP', 'AD', 'ADS', 'UI', 'ID', 'MVP', 'SFX', 'BGM', 'AI', 'NPC', 'GDPR',
  'CCPA', 'H5', 'API', 'CSS', 'SVG', 'HTML5', '2.5D', 'II', 'III', 'IV',
]);

function formatWord(w: string): string {
  if (!w) return w;
  const upper = w.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  if (/^\d/.test(w)) return w;
  if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Converts text to natural Title Case (e.g. "Begin Journey", "How to Play"). */
export function toTitleCase(text: string): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && MINOR_WORDS.has(lower)) return lower;
      return formatWord(w);
    })
    .join(' ');
}

/** Converts prose to natural Sentence case (e.g. "Defend the citadel across all waves."). */
export function toSentenceCase(text: string): string {
  if (!text) return '';
  return text
    .split(/([.!?]\s+)/)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      const trimmed = seg.trim();
      if (!trimmed) return seg;
      const words = trimmed.split(/\s+/);
      return words
        .map((w, wi) => {
          if (wi === 0) return formatWord(w);
          const upper = w.toUpperCase();
          if (ACRONYMS.has(upper)) return upper;
          if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w;
          return w.toLowerCase();
        })
        .join(' ');
    })
    .join('');
}

/** Formats any UI string into proper natural casing based on role or structure. */
export function formatGameText(text: string, forceCasing?: 'normal' | 'title' | 'sentence'): string {
  if (!text) return '';
  if (forceCasing === 'normal') return text;
  if (forceCasing === 'title') return toTitleCase(text);
  if (forceCasing === 'sentence') return toSentenceCase(text);

  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 6 || /[.!?]$/.test(trimmed)) {
    return toSentenceCase(trimmed);
  }
  return toTitleCase(trimmed);
}

// PRESERVE CANVAS TYPEFACE — Renders in-world text (floating combat numbers,
// gold popups, combo milestones, wave banners) using our custom OpenType fonts
// (PreserveDisplay & PreserveSans).
//
// Uses hardware-accelerated Canvas 2D text once the custom FontFace has
// activated, or renders the exact OpenType glyph paths directly via opentype.js
// on frame 0 / headless environments so text is always crisp, upright, and
// in the game's signature typeface.

import {
  FONT_DISPLAY,
  FONT_BODY,
  getPreserveFonts,
  installFontLibrary,
  isPreserveFontReady,
  measurePreserveText,
} from '../ui/typeface/fontLibrary';

export interface TextRenderOptions {
  x: number;
  y: number; // baseline y
  size: number;
  color: string;
  strokeWidth?: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  outline?: string;
  outlineWidth?: number;
  shadow?: { color: string; dx: number; dy: number };
  style?: 'display' | 'sans';
}

/** Measures rendered width in px using our custom OpenType font metrics. */
export function measureText(text: string, size: number, _letterSpacing = 0): number {
  return measurePreserveText(text, size, 'display');
}

/** Draws text onto an HTML5 Canvas using PreserveDisplay / PreserveSans. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, opts: TextRenderOptions) {
  installFontLibrary();
  const { size, color, style = 'display' } = opts;
  const w = measurePreserveText(text, size, style);
  let x = opts.x;
  if (opts.align === 'center') x -= w / 2;
  else if (opts.align === 'right') x -= w;
  const y = opts.y;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (isPreserveFontReady(style)) {
    const family = style === 'display' ? FONT_DISPLAY : FONT_BODY;
    ctx.font = `700 ${size}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    if (opts.shadow) {
      ctx.fillStyle = opts.shadow.color;
      ctx.fillText(text, x + opts.shadow.dx, y + opts.shadow.dy);
    }
    if (opts.outline) {
      ctx.strokeStyle = opts.outline;
      ctx.lineWidth = opts.outlineWidth ?? Math.max(2.5, size * 0.16);
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  } else {
    // Immediate vector-path rendering from the parsed OpenType font (works on frame 0 and headless)
    const { display, sans } = getPreserveFonts();
    const font = style === 'display' ? display : sans;
    const path = font.getPath(text, x, y, size, { kerning: true });

    if (opts.shadow) {
      const sp = font.getPath(text, x + opts.shadow.dx, y + opts.shadow.dy, size, { kerning: true });
      sp.fill = opts.shadow.color;
      sp.draw(ctx);
    }
    if (opts.outline) {
      path.fill = null;
      path.stroke = opts.outline;
      path.strokeWidth = opts.outlineWidth ?? Math.max(2.5, size * 0.16);
      path.draw(ctx);
    }
    path.stroke = null;
    path.fill = color;
    path.draw(ctx);
  }

  ctx.restore();
}

/** Converts text to an SVG <path> string using our custom PreserveDisplay OpenType outlines. */
export function textToSvgPaths(text: string, size: number): { paths: string; width: number; height: number } {
  const { display } = getPreserveFonts();
  const width = display.getAdvanceWidth(text, size, { kerning: true });
  const height = size;
  const path = display.getPath(text, 0, size * 0.78, size, { kerning: true });
  return { paths: path.toSVG(2), width, height };
}

// PRESERVE SANS — a custom geometric typeface built from vector paths.
// Each glyph is a set of stroke commands on a 100x100 em box.
// This provides a unique, code-native typeface with no external font dependencies.

export type GlyphCmd =
  | { m: [number, number] }  // moveTo
  | { l: [number, number] }  // lineTo
  | { c: [number, number, number, number, number, number] } // cubic bezier
  | { q: [number, number, number, number] } // quadratic
  | { z: true }; // close path

export interface Glyph {
  w: number; // advance width in em units
  cmds: GlyphCmd[];
}

// EM box is 100 units tall, baseline at 80, cap height at 15
const B = 80; // baseline
const T = 15; // top of caps

function line(pts: [number, number][]): GlyphCmd[] {
  const out: GlyphCmd[] = [{ m: pts[0] }];
  for (let i = 1; i < pts.length; i++) out.push({ l: pts[i] });
  return out;
}

// Character set with geometric, angular design
export const GLYPHS: Record<string, Glyph> = {
  ' ': { w: 30, cmds: [] },
  'A': { w: 60, cmds: [
    ...line([[0, B], [30, T], [60, B]]),
    ...line([[10, 55], [50, 55]]),
  ]},
  'B': { w: 55, cmds: [
    ...line([[0, T], [0, B]]),
    ...line([[0, T], [40, T], [50, 22], [50, 38], [40, 47], [0, 47]]),
    ...line([[0, 47], [42, 47], [55, 55], [55, 72], [42, B], [0, B]]),
  ]},
  'C': { w: 55, cmds: [
    ...line([[55, 22], [42, T], [15, T], [0, 25], [0, 65], [15, B], [42, B], [55, 68]]),
  ]},
  'D': { w: 55, cmds: [
    ...line([[0, T], [40, T], [55, 30], [55, 65], [40, B], [0, B], [0, T]]),
  ]},
  'E': { w: 50, cmds: [
    ...line([[50, T], [0, T], [0, B], [50, B]]),
    ...line([[0, 47], [42, 47]]),
  ]},
  'F': { w: 50, cmds: [
    ...line([[50, T], [0, T], [0, B]]),
    ...line([[0, 47], [42, 47]]),
  ]},
  'G': { w: 60, cmds: [
    ...line([[60, 22], [42, T], [15, T], [0, 25], [0, 65], [15, B], [42, B], [60, 68], [60, 50], [35, 50]]),
  ]},
  'H': { w: 55, cmds: [
    ...line([[0, T], [0, B]]),
    ...line([[55, T], [55, B]]),
    ...line([[0, 47], [55, 47]]),
  ]},
  'I': { w: 30, cmds: [
    ...line([[5, T], [25, T]]),
    ...line([[15, T], [15, B]]),
    ...line([[5, B], [25, B]]),
  ]},
  'J': { w: 40, cmds: [
    ...line([[10, T], [40, T]]),
    ...line([[30, T], [30, 65], [20, B], [5, B], [0, 70]]),
  ]},
  'K': { w: 55, cmds: [
    ...line([[0, T], [0, B]]),
    ...line([[55, T], [0, 47], [55, B]]),
  ]},
  'L': { w: 45, cmds: [
    ...line([[0, T], [0, B], [45, B]]),
  ]},
  'M': { w: 70, cmds: [
    ...line([[0, B], [0, T], [35, 55], [70, T], [70, B]]),
  ]},
  'N': { w: 60, cmds: [
    ...line([[0, B], [0, T], [60, B], [60, T]]),
  ]},
  'O': { w: 60, cmds: [
    ...line([[15, T], [45, T], [60, 25], [60, 65], [45, B], [15, B], [0, 65], [0, 25], [15, T]]),
  ]},
  'P': { w: 55, cmds: [
    ...line([[0, B], [0, T], [40, T], [55, 22], [55, 38], [40, 47], [0, 47]]),
  ]},
  'Q': { w: 60, cmds: [
    ...line([[15, T], [45, T], [60, 25], [60, 65], [45, B], [15, B], [0, 65], [0, 25], [15, T]]),
    ...line([[38, 68], [62, 92]]),
  ]},
  'R': { w: 55, cmds: [
    ...line([[0, B], [0, T], [40, T], [55, 22], [55, 38], [40, 47], [0, 47]]),
    ...line([[28, 47], [55, B]]),
  ]},
  'S': { w: 50, cmds: [
    ...line([[50, 22], [40, T], [12, T], [0, 22], [0, 35], [12, 45], [40, 50], [50, 60], [50, 72], [40, B], [12, B], [0, 72]]),
  ]},
  'T': { w: 55, cmds: [
    ...line([[0, T], [55, T]]),
    ...line([[27, T], [27, B]]),
  ]},
  'U': { w: 55, cmds: [
    ...line([[0, T], [0, 65], [15, B], [40, B], [55, 65], [55, T]]),
  ]},
  'V': { w: 55, cmds: [
    ...line([[0, T], [27, B], [55, T]]),
  ]},
  'W': { w: 75, cmds: [
    ...line([[0, T], [15, B], [37, 35], [60, B], [75, T]]),
  ]},
  'X': { w: 55, cmds: [
    ...line([[0, T], [55, B]]),
    ...line([[55, T], [0, B]]),
  ]},
  'Y': { w: 55, cmds: [
    ...line([[0, T], [27, 50], [55, T]]),
    ...line([[27, 50], [27, B]]),
  ]},
  'Z': { w: 55, cmds: [
    ...line([[0, T], [55, T], [0, B], [55, B]]),
  ]},
  // digits
  '0': { w: 45, cmds: [
    ...line([[10, T], [35, T], [45, 25], [45, 65], [35, B], [10, B], [0, 65], [0, 25], [10, T]]),
    ...line([[10, B], [35, T]]),
  ]},
  '1': { w: 25, cmds: [
    ...line([[0, 25], [13, T], [13, B]]),
    ...line([[0, B], [25, B]]),
  ]},
  '2': { w: 45, cmds: [
    ...line([[0, 25], [10, T], [35, T], [45, 25], [45, 35], [0, B], [45, B]]),
  ]},
  '3': { w: 45, cmds: [
    ...line([[0, T], [45, T], [20, 47], [40, 47], [45, 55], [45, 72], [35, B], [10, B], [0, 72]]),
  ]},
  '4': { w: 45, cmds: [
    ...line([[35, T], [0, 55], [45, 55]]),
    ...line([[35, 30], [35, B]]),
  ]},
  '5': { w: 45, cmds: [
    ...line([[45, T], [0, T], [0, 45], [35, 45], [45, 55], [45, 72], [35, B], [10, B], [0, 72]]),
  ]},
  '6': { w: 45, cmds: [
    ...line([[45, 22], [35, T], [10, T], [0, 25], [0, 72], [10, B], [35, B], [45, 72], [45, 55], [35, 45], [0, 45]]),
  ]},
  '7': { w: 45, cmds: [
    ...line([[0, T], [45, T], [15, B]]),
  ]},
  '8': { w: 45, cmds: [
    ...line([[10, T], [35, T], [45, 22], [45, 38], [35, 47], [10, 47], [0, 55], [0, 72], [10, B], [35, B], [45, 72], [45, 55], [35, 47]]),
    ...line([[10, 47], [0, 38], [0, 22], [10, T]]),
  ]},
  '9': { w: 45, cmds: [
    ...line([[0, 72], [10, B], [35, B], [45, 72], [45, 25], [35, T], [10, T], [0, 25], [0, 38], [10, 47], [45, 47]]),
  ]},
  // punctuation
  '.': { w: 15, cmds: [
    ...line([[3, 75], [12, 75], [12, B], [3, B], [3, 75]]),
  ]},
  ',': { w: 15, cmds: [
    ...line([[3, 75], [12, 75], [12, B], [3, B], [3, 75]]),
    ...line([[12, B], [8, 90]]),
  ]},
  ':': { w: 15, cmds: [
    ...line([[3, 40], [12, 40], [12, 48], [3, 48], [3, 40]]),
    ...line([[3, 72], [12, 72], [12, B], [3, B], [3, 72]]),
  ]},
  '!': { w: 18, cmds: [
    ...line([[9, T], [9, 60]]),
    ...line([[6, 72], [12, 72], [12, B], [6, B], [6, 72]]),
  ]},
  '?': { w: 45, cmds: [
    ...line([[0, 25], [10, T], [35, T], [45, 25], [45, 35], [22, 50], [22, 62]]),
    ...line([[18, 72], [26, 72], [26, B], [18, B], [18, 72]]),
  ]},
  "'": { w: 12, cmds: [
    ...line([[6, T], [6, 30]]),
  ]},
  '-': { w: 30, cmds: [
    ...line([[0, 50], [30, 50]]),
  ]},
  '+': { w: 40, cmds: [
    ...line([[20, 30], [20, 70]]),
    ...line([[0, 50], [40, 50]]),
  ]},
  '/': { w: 30, cmds: [
    ...line([[30, T], [0, B]]),
  ]},
  '×': { w: 40, cmds: [
    ...line([[5, 30], [35, 70]]),
    ...line([[35, 30], [5, 70]]),
  ]},
};

// Fallback for lowercase — use uppercase (game UI is uppercase-oriented)
function getGlyph(ch: string): Glyph {
  const up = ch.toUpperCase();
  return GLYPHS[up] || GLYPHS[ch] || GLYPHS[' '];
}

export interface TextRenderOptions {
  x: number;
  y: number; // baseline y
  size: number; // em size in px
  color: string;
  strokeWidth?: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  outline?: string; // outline color
  outlineWidth?: number;
  shadow?: { color: string; dx: number; dy: number };
}

// Measure a string's rendered width in px
export function measureText(text: string, size: number, letterSpacing = 0): number {
  const scale = size / 100;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += getGlyph(text[i]).w * scale;
    if (i < text.length - 1) w += letterSpacing;
  }
  return w;
}

// Draw text on canvas using the custom typeface
export function drawText(ctx: CanvasRenderingContext2D, text: string, opts: TextRenderOptions) {
  const { size, color } = opts;
  const strokeWidth = opts.strokeWidth ?? Math.max(1, size * 0.09);
  const letterSpacing = opts.letterSpacing ?? size * 0.05;
  const scale = size / 100;
  const w = measureText(text, size, letterSpacing);
  let x = opts.x;
  if (opts.align === 'center') x -= w / 2;
  else if (opts.align === 'right') x -= w;
  const y = opts.y;

  // Shadow pass
  if (opts.shadow) {
    ctx.save();
    ctx.translate(opts.shadow.dx, opts.shadow.dy);
    drawTextPath(ctx, text, x, y, scale, letterSpacing);
    ctx.lineWidth = strokeWidth * 1.2;
    ctx.strokeStyle = opts.shadow.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // Outline pass
  if (opts.outline) {
    drawTextPath(ctx, text, x, y, scale, letterSpacing);
    ctx.lineWidth = strokeWidth + (opts.outlineWidth ?? Math.max(2, size * 0.15));
    ctx.strokeStyle = opts.outline;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Main pass
  drawTextPath(ctx, text, x, y, scale, letterSpacing);
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawTextPath(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, letterSpacing: number) {
  ctx.beginPath();
  let cx = x;
  const cyOffset = y - 80 * scale; // align to baseline
  for (let i = 0; i < text.length; i++) {
    const g = getGlyph(text[i]);
    for (const cmd of g.cmds) {
      if ('m' in cmd) ctx.moveTo(cx + cmd.m[0] * scale, cyOffset + cmd.m[1] * scale);
      else if ('l' in cmd) ctx.lineTo(cx + cmd.l[0] * scale, cyOffset + cmd.l[1] * scale);
      else if ('q' in cmd) ctx.quadraticCurveTo(cx + cmd.q[0] * scale, cyOffset + cmd.q[1] * scale, cx + cmd.q[2] * scale, cyOffset + cmd.q[3] * scale);
      else if ('c' in cmd) ctx.bezierCurveTo(cx + cmd.c[0] * scale, cyOffset + cmd.c[1] * scale, cx + cmd.c[2] * scale, cyOffset + cmd.c[3] * scale, cx + cmd.c[4] * scale, cyOffset + cmd.c[5] * scale);
    }
    cx += g.w * scale + letterSpacing;
  }
}

// Convenience: render a text label onto a DOM SVG string (for React components)
export function textToSvgPaths(text: string, size: number, letterSpacing?: number): { paths: string; width: number; height: number } {
  const ls = letterSpacing ?? size * 0.05;
  const scale = size / 100;
  const totalW = measureText(text, size, ls);
  const height = size;
  let cx = 0;
  const cyOffset = height * 0.8 - 80 * scale + 15 * scale;
  let paths = '';
  for (let i = 0; i < text.length; i++) {
    const g = getGlyph(text[i]);
    let d = '';
    for (const cmd of g.cmds) {
      if ('m' in cmd) d += `M${(cx + cmd.m[0] * scale).toFixed(2)},${(cyOffset + cmd.m[1] * scale).toFixed(2)} `;
      else if ('l' in cmd) d += `L${(cx + cmd.l[0] * scale).toFixed(2)},${(cyOffset + cmd.l[1] * scale).toFixed(2)} `;
    }
    if (d) paths += `<path d="${d.trim()}" />`;
    cx += g.w * scale + ls;
  }
  return { paths, width: totalW, height };
}

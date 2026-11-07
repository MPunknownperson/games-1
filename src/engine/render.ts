// PRESERVE ENGINE — Modular rendering system with 2D / 2.5D / 3D primitives.
// All shapes procedurally drawn on canvas: no external images.

export interface Vec3 { x: number; y: number; z: number; }
export interface Vec2 { x: number; y: number; }

// ---------- Isometric (2.5D) projection ----------
// World XYZ → screen. Y is up in world; Z is depth (into the scene).
export const ISO = {
  ax: 0.866, // cos(30°)
  ay: 0.5,   // sin(30°)
};

export function project(x: number, y: number, z: number): Vec2 {
  return {
    x: (x - z) * ISO.ax,
    y: (x + z) * ISO.ay - y,
  };
}

// A camera transforms world coords → screen coords with pan and zoom
export interface Camera {
  x: number; y: number; zoom: number;
  screenW: number; screenH: number;
}

export function worldToScreen(cam: Camera, worldX: number, worldY: number, worldZ: number): Vec2 {
  const p = project(worldX, worldY, worldZ);
  return {
    x: cam.screenW / 2 + (p.x - cam.x) * cam.zoom,
    y: cam.screenH / 2 + (p.y - cam.y) * cam.zoom,
  };
}

export function screenToWorldGround(cam: Camera, sx: number, sy: number): { x: number; z: number } {
  // Assume ground plane y=0.
  const px = (sx - cam.screenW / 2) / cam.zoom + cam.x;
  const py = (sy - cam.screenH / 2) / cam.zoom + cam.y;
  // Invert: px = (x - z) * ax; py = (x + z) * ay
  // → x = (px/ax + py/ay) / 2; z = (py/ay - px/ax) / 2
  const x = (px / ISO.ax + py / ISO.ay) / 2;
  const z = (py / ISO.ay - px / ISO.ax) / 2;
  return { x, z };
}

// ---------- Color utils ----------
export function shade(hex: string, amt: number): string {
  // amt in [-1,1]. -1 = black, +1 = white
  const c = parseHex(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const r = Math.round(c.r + (t - c.r) * p);
  const g = Math.round(c.g + (t - c.g) * p);
  const b = Math.round(c.b + (t - c.b) * p);
  return `rgb(${r},${g},${b})`;
}

export function withAlpha(hex: string, a: number): string {
  const c = parseHex(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ---------- 2.5D primitives ----------

// Draw an isometric block (rectangular box) with faces.
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number, y: number, z: number,
  w: number, h: number, d: number,
  color: string,
  outline = '#0d1220',
) {
  // Compute 8 corners
  const p000 = worldToScreen(cam, x, y, z);
  const p100 = worldToScreen(cam, x + w, y, z);
  const p010 = worldToScreen(cam, x, y + h, z);
  const p110 = worldToScreen(cam, x + w, y + h, z);
  const p001 = worldToScreen(cam, x, y, z + d);
  const p101 = worldToScreen(cam, x + w, y, z + d);
  const p011 = worldToScreen(cam, x, y + h, z + d);
  const p111 = worldToScreen(cam, x + w, y + h, z + d);

  const top = shade(color, 0.18);
  const right = shade(color, -0.12);
  const left = color;

  // Left face (visible: -x side is at high x screen? Actually left face facing camera-left)
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(p000.x, p000.y);
  ctx.lineTo(p010.x, p010.y);
  ctx.lineTo(p011.x, p011.y);
  ctx.lineTo(p001.x, p001.y);
  ctx.closePath();
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke(); }

  // Right face
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(p100.x, p100.y);
  ctx.lineTo(p110.x, p110.y);
  ctx.lineTo(p111.x, p111.y);
  ctx.lineTo(p101.x, p101.y);
  ctx.closePath();
  ctx.fill();
  if (outline) ctx.stroke();

  // Front face
  ctx.fillStyle = shade(color, -0.05);
  ctx.beginPath();
  ctx.moveTo(p000.x, p000.y);
  ctx.lineTo(p100.x, p100.y);
  ctx.lineTo(p110.x, p110.y);
  ctx.lineTo(p010.x, p010.y);
  ctx.closePath();
  ctx.fill();
  if (outline) ctx.stroke();

  // Top face
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(p010.x, p010.y);
  ctx.lineTo(p110.x, p110.y);
  ctx.lineTo(p111.x, p111.y);
  ctx.lineTo(p011.x, p011.y);
  ctx.closePath();
  ctx.fill();
  if (outline) ctx.stroke();
}

// Draw a cylinder (vertical) using top ellipse + rectangle + bottom ellipse
export function drawCylinder(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cx: number, y: number, cz: number,
  radius: number, height: number,
  color: string,
  outline = '#0d1220',
) {
  const base = worldToScreen(cam, cx, y, cz);
  const top = worldToScreen(cam, cx, y + height, cz);
  const rx = radius * cam.zoom;
  const ry = radius * cam.zoom * ISO.ay;
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(base.x - rx, base.y);
  ctx.lineTo(top.x - rx, top.y);
  ctx.ellipse(top.x, top.y, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(base.x + rx, base.y);
  ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke(); }
  // Top disk (lighter)
  ctx.fillStyle = shade(color, 0.22);
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (outline) ctx.stroke();
}

// Draw a sphere as a shaded oval (2.5D-friendly ball)
export function drawSphere(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cx: number, y: number, cz: number,
  radius: number,
  color: string,
  outline = '#0d1220',
) {
  const p = worldToScreen(cam, cx, y + radius, cz);
  const r = radius * cam.zoom;
  const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
  grad.addColorStop(0, shade(color, 0.4));
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke(); }
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x - r * 0.35, p.y - r * 0.4, r * 0.25, r * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

// Draw a pyramid (cone-like) block
export function drawPyramid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cx: number, y: number, cz: number,
  baseW: number, baseD: number, height: number,
  color: string,
  outline = '#0d1220',
) {
  const b00 = worldToScreen(cam, cx - baseW / 2, y, cz - baseD / 2);
  const b10 = worldToScreen(cam, cx + baseW / 2, y, cz - baseD / 2);
  const b01 = worldToScreen(cam, cx - baseW / 2, y, cz + baseD / 2);
  const b11 = worldToScreen(cam, cx + baseW / 2, y, cz + baseD / 2);
  const apex = worldToScreen(cam, cx, y + height, cz);
  // Front-left face
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b00.x, b00.y); ctx.lineTo(b01.x, b01.y); ctx.lineTo(apex.x, apex.y); ctx.closePath();
  ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke(); }
  // Front-right face
  ctx.fillStyle = shade(color, -0.12);
  ctx.beginPath();
  ctx.moveTo(b10.x, b10.y); ctx.lineTo(b11.x, b11.y); ctx.lineTo(apex.x, apex.y); ctx.closePath();
  ctx.fill(); if (outline) ctx.stroke();
  // Left face
  ctx.fillStyle = shade(color, -0.05);
  ctx.beginPath();
  ctx.moveTo(b00.x, b00.y); ctx.lineTo(b10.x, b10.y); ctx.lineTo(apex.x, apex.y); ctx.closePath();
  ctx.fill(); if (outline) ctx.stroke();
  // Back face
  ctx.fillStyle = shade(color, 0.1);
  ctx.beginPath();
  ctx.moveTo(b01.x, b01.y); ctx.lineTo(b11.x, b11.y); ctx.lineTo(apex.x, apex.y); ctx.closePath();
  ctx.fill(); if (outline) ctx.stroke();
}

// Draw a flat quad on the ground (tile) with color and outline
export function drawGroundQuad(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number, z: number, w: number, d: number,
  color: string,
  outline?: string,
) {
  const p00 = worldToScreen(cam, x, 0, z);
  const p10 = worldToScreen(cam, x + w, 0, z);
  const p01 = worldToScreen(cam, x, 0, z + d);
  const p11 = worldToScreen(cam, x + w, 0, z + d);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p00.x, p00.y); ctx.lineTo(p10.x, p10.y); ctx.lineTo(p11.x, p11.y); ctx.lineTo(p01.x, p01.y); ctx.closePath();
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }
}

// Draw a soft blob (organic 2.5D shape) using multiple radial ovals
export function drawBlob(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cx: number, y: number, cz: number,
  radius: number,
  color: string,
  seed = 0,
) {
  const p = worldToScreen(cam, cx, y + radius * 0.8, cz);
  const r = radius * cam.zoom;
  ctx.fillStyle = color;
  ctx.beginPath();
  const segs = 12;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const jitter = 1 + Math.sin(a * 3 + seed) * 0.1 + Math.cos(a * 5 + seed) * 0.06;
    const rx = r * jitter;
    const ry = r * jitter * 0.85;
    const px = p.x + Math.cos(a) * rx;
    const py = p.y + Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// Draw a soft contact shadow beneath (cx,cz). A radial falloff anchors objects
// to the ground far more convincingly than the previous flat ellipse.
export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cx: number, cz: number, radius: number,
  alpha = 0.35,
) {
  const p = worldToScreen(cam, cx, 0, cz);
  const rx = Math.max(1, radius * cam.zoom);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, Math.max(0.05, ISO.ay));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.45})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Atmosphere ----------

/** Declarative sky description consumed by {@link drawSky}. */
export interface SkySpec {
  sky: [string, string];
  sun?: { x: number; y: number; r: number; color: string; glow: string } | null;
  stars?: number;
  haze?: string;
}

/** Deterministic hash-based 0..1 value, so skies never flicker between frames. */
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Paint the sky: vertical gradient, optional star field and celestial body. */
export function drawSky(ctx: CanvasRenderingContext2D, cam: Camera, spec: SkySpec, time: number) {
  const g = ctx.createLinearGradient(0, 0, 0, cam.screenH * 0.85);
  g.addColorStop(0, spec.sky[0]);
  g.addColorStop(1, spec.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.screenW, cam.screenH);

  if (spec.stars && spec.stars > 0) {
    for (let i = 0; i < spec.stars; i++) {
      const x = hash01(i) * cam.screenW;
      const y = hash01(i + 7919) * cam.screenH * 0.6;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.5 + hash01(i + 31) * 1.5) + i));
      ctx.globalAlpha = twinkle * 0.9;
      ctx.fillStyle = '#e8eef8';
      const r = 0.7 + hash01(i + 17) * 1.3;
      ctx.fillRect(x, y, r, r);
    }
    ctx.globalAlpha = 1;
  }

  if (spec.sun) {
    const sx = cam.screenW * spec.sun.x;
    const sy = cam.screenH * spec.sun.y;
    const r = spec.sun.r;
    // Soft, restrained halo so the sky reads clean instead of smudged
    ctx.save();
    ctx.globalAlpha = 0.55;
    const halo = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 3.4);
    halo.addColorStop(0, spec.sun.glow);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - r * 3.4, sy - r * 3.4, r * 6.8, r * 6.8);
    ctx.restore();
    const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.78);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.55, spec.sun.color);
    core.addColorStop(1, withAlpha(spec.sun.color, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Horizon haze that separates the distant skyline from the play field. */
export function drawHaze(ctx: CanvasRenderingContext2D, cam: Camera, color: string) {
  const g = ctx.createLinearGradient(0, cam.screenH * 0.32, 0, cam.screenH * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.screenW, cam.screenH);
}

/** Screen-space vignette that frames the field and deepens the realm mood. */
export function drawVignette(ctx: CanvasRenderingContext2D, cam: Camera, v: [string, string]) {
  const g = ctx.createRadialGradient(
    cam.screenW / 2, cam.screenH * 0.46, Math.min(cam.screenW, cam.screenH) * 0.32,
    cam.screenW / 2, cam.screenH * 0.5, Math.max(cam.screenW, cam.screenH) * 0.8,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, withAlpha(v[0], 0.16));
  g.addColorStop(1, withAlpha(v[1], 0.52));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.screenW, cam.screenH);
}

// Draw a beveled panel with rounded corners (for UI in 2.5D style)
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
  radius = 12,
  bevel = 4,
  outline = '#0d1220',
) {
  // Bottom shadow bevel
  roundedRect(ctx, x, y + bevel, w, h, radius);
  ctx.fillStyle = shade(color, -0.35);
  ctx.fill();
  // Main panel
  roundedRect(ctx, x, y, w, h, radius);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shade(color, 0.15));
  grad.addColorStop(1, shade(color, -0.05));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner highlight
  roundedRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, radius - 3));
  ctx.strokeStyle = shade(color, 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Polygon fill helper
export function fillPolygon(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string, outline?: string, lineWidth = 1.5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

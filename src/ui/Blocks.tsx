// UI Blocks — modular, 2.5D-styled UI primitives. All CSS/SVG based, no images.
// This is the block-based UI framework for future modifications.
import { type CSSProperties, type ReactNode, type MouseEventHandler } from 'react';
import { GlyphText } from './GlyphText';

// ---------- Design tokens ----------
export const TOKENS = {
  color: {
    bg: '#0d1220',
    panel: '#1e2a3f',
    panelLight: '#2a3a55',
    panelDark: '#0a0f1a',
    ink: '#e2e8f0',
    inkMuted: '#94a3b8',
    inkDim: '#64748b',
    accent: '#fbbf24',
    accentAlt: '#fef3c7',
    good: '#4ade80',
    warn: '#f59e0b',
    bad: '#ef4444',
    prism: '#a78bfa',
    ice: '#38bdf8',
    outline: '#0d1220',
  },
  radius: { sm: 6, md: 10, lg: 14, xl: 20 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  shadow: {
    bevelDown: '0 4px 0 rgba(0,0,0,0.4), inset 0 -2px 0 rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.15)',
    bevelUp: '0 2px 0 rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.2)',
    lift: '0 8px 24px rgba(0,0,0,0.6)',
    glow: (c: string) => `0 0 24px ${c}66, 0 0 12px ${c}88`,
  },
};

// ---------- Panel ----------
interface PanelProps {
  children: ReactNode;
  color?: string;
  radius?: number;
  padding?: number | string;
  className?: string;
  style?: CSSProperties;
  bordered?: boolean;
  bevel?: 'up' | 'down' | 'none';
  glow?: string;
}
export function Panel({ children, color = TOKENS.color.panel, radius = TOKENS.radius.lg, padding = TOKENS.space.md, className, style, bordered = true, bevel = 'down', glow }: PanelProps) {
  const shadow = bevel === 'down' ? TOKENS.shadow.bevelDown : bevel === 'up' ? TOKENS.shadow.bevelUp : 'none';
  const glowShadow = glow ? `, ${TOKENS.shadow.glow(glow)}` : '';
  return (
    <div
      className={className}
      style={{
        background: `linear-gradient(180deg, ${lighten(color, 0.15)}, ${color})`,
        borderRadius: radius,
        padding,
        border: bordered ? `2px solid ${TOKENS.color.outline}` : 'none',
        boxShadow: `${shadow}${glowShadow}`,
        color: TOKENS.color.ink,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------- Button (glyph text inside) ----------
interface BtnProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: 'primary' | 'secondary' | 'good' | 'bad' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  block?: boolean;
}
export function Btn({ children, onClick, variant = 'secondary', size = 'md', disabled, glow, className, style, block }: BtnProps) {
  const palette: Record<string, { bg: string; ink: string; outline: string; accent: string }> = {
    primary:   { bg: '#f59e0b', ink: '#0d1220', outline: '#78350f', accent: '#fef3c7' },
    secondary: { bg: '#334155', ink: '#e2e8f0', outline: '#0d1220', accent: '#94a3b8' },
    good:      { bg: '#16a34a', ink: '#f0fdf4', outline: '#052e16', accent: '#86efac' },
    bad:       { bg: '#b91c1c', ink: '#fef2f2', outline: '#450a0a', accent: '#fecaca' },
    ghost:     { bg: 'transparent', ink: '#94a3b8', outline: 'transparent', accent: '#e2e8f0' },
  };
  const p = palette[variant];
  const height = size === 'sm' ? 32 : size === 'lg' ? 56 : 42;
  const glyphSize = size === 'sm' ? 14 : size === 'lg' ? 24 : 18;
  const padX = size === 'sm' ? 12 : size === 'lg' ? 24 : 18;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        height,
        padding: `0 ${padX}px`,
        border: variant === 'ghost' ? 'none' : `2px solid ${p.outline}`,
        borderRadius: TOKENS.radius.md,
        background: variant === 'ghost' ? 'transparent' : `linear-gradient(180deg, ${lighten(p.bg, 0.2)}, ${p.bg})`,
        color: p.ink,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        boxShadow: variant === 'ghost' ? 'none' : `0 3px 0 ${p.outline}, inset 0 -2px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25)${glow ? `, ${TOKENS.shadow.glow(p.accent)}` : ''}`,
        transition: 'transform 0.05s, box-shadow 0.1s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: block ? '100%' : undefined,
        userSelect: 'none',
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(2px)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
    >
      {typeof children === 'string' ? (
        <GlyphText color={p.ink} size={glyphSize} outline={p.outline} outlineWidth={2} letterSpacing={glyphSize * 0.08}>
          {children}
        </GlyphText>
      ) : (
        children
      )}
    </button>
  );
}

// ---------- Chip (small stat display) ----------
export function Chip({ icon, label, value, color = '#334155' }: { icon?: ReactNode; label?: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px 4px 8px',
      background: `linear-gradient(180deg, ${lighten(color, 0.15)}, ${color})`,
      border: `2px solid ${TOKENS.color.outline}`,
      borderRadius: TOKENS.radius.md,
      boxShadow: TOKENS.shadow.bevelDown,
      minHeight: 30,
    }}>
      {icon}
      {label && <GlyphText size={11} color="#cbd5e1" letterSpacing={1}>{label}</GlyphText>}
      <GlyphText size={16} color="#fef3c7" outline="#0d1220" outlineWidth={2} letterSpacing={1}>{value}</GlyphText>
    </div>
  );
}

// ---------- HBar (horizontal progress bar) ----------
export function HBar({ pct, color, width = 100, height = 10, showValue }: { pct: number; color?: string; width?: number; height?: number; showValue?: string }) {
  const c = color ?? (pct > 0.5 ? TOKENS.color.good : pct > 0.25 ? TOKENS.color.warn : TOKENS.color.bad);
  return (
    <div style={{ position: 'relative', width, height, background: '#0a0f1a', border: `2px solid ${TOKENS.color.outline}`, borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
        height: '100%',
        background: `linear-gradient(180deg, ${lighten(c, 0.25)}, ${c})`,
        boxShadow: `inset 0 -2px 0 ${darken(c, 0.3)}, inset 0 1px 0 rgba(255,255,255,0.4)`,
        transition: 'width 0.3s',
      }} />
      {showValue && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GlyphText size={height * 0.85} color="#fff" outline="#0d1220" outlineWidth={2} letterSpacing={1}>{showValue}</GlyphText>
        </div>
      )}
    </div>
  );
}

// ---------- Overlay ----------
export function Overlay({ children, onClose, blur = true, dark = 0.7 }: { children: ReactNode; onClose?: () => void; blur?: boolean; dark?: number }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: `rgba(0,0,0,${dark})`,
        backdropFilter: blur ? 'blur(6px)' : 'none',
        WebkitBackdropFilter: blur ? 'blur(6px)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 40,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', overflow: 'auto', animation: 'popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {children}
      </div>
    </div>
  );
}

// ---------- Utility color functions ----------
function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function lighten(hex: string, amt: number): string {
  const c = parseHex(hex);
  return `rgb(${Math.round(c.r + (255 - c.r) * amt)},${Math.round(c.g + (255 - c.g) * amt)},${Math.round(c.b + (255 - c.b) * amt)})`;
}
export function darken(hex: string, amt: number): string {
  const c = parseHex(hex);
  return `rgb(${Math.round(c.r * (1 - amt))},${Math.round(c.g * (1 - amt))},${Math.round(c.b * (1 - amt))})`;
}

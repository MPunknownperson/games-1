// UI Blocks — Cohesive, high-contrast game UI primitives.
// Built on the PreserveDisplay & PreserveSans custom font library and
// realm-harmonized palettes. Zero blur, zero overlapping brackets, crisp legibility.

import { type CSSProperties, type ReactNode, type MouseEventHandler } from 'react';
import { GlyphText } from './GlyphText';
import { FONT_BODY } from './typeface/fontLibrary';
import { useUiTheme } from './theme';

export const TOKENS = {
  color: {
    bg: '#0d1220',
    panel: '#182236',
    panelLight: '#24324d',
    panelDark: '#0b111d',
    ink: '#f8fafc',
    inkMuted: '#cbd5e1',
    inkDim: '#94a3b8',
    accent: '#fbbf24',
    accentAlt: '#fef3c7',
    good: '#4ade80',
    warn: '#fbbf24',
    bad: '#f87171',
    prism: '#a78bfa',
    ice: '#38bdf8',
    outline: '#0b111d',
  },
  radius: { sm: 6, md: 10, lg: 14, xl: 18 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
};

export type PanelTone = 'solid' | 'deep';

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
  tone?: PanelTone;
  rim?: boolean;
  ornate?: boolean;
}

export function Panel({
  children,
  color,
  radius = TOKENS.radius.lg,
  padding = TOKENS.space.md,
  className,
  style,
  glow,
  tone = 'solid',
  rim = true,
  ornate,
}: PanelProps) {
  const t = useUiTheme();
  const top = tone === 'deep' ? t.panelDeepTop : t.panelTop;
  const bottom = tone === 'deep' ? t.panelDeepBottom : t.panelBottom;
  const borderColor = ornate ? `${t.accent}88` : t.frame;

  return (
    <div
      className={className}
      style={{
        background: `linear-gradient(180deg, ${top}, ${bottom})`,
        borderRadius: radius,
        padding,
        border: `1.5px solid ${borderColor}`,
        boxShadow: [
          '0 10px 26px rgba(0,0,0,0.48)',
          rim ? `inset 0 1px 0 ${t.rim}44` : '',
          'inset 0 -2px 0 rgba(0,0,0,0.42)',
          ornate ? `inset 0 0 0 1px rgba(255,255,255,0.05)` : '',
          glow ? `0 0 22px ${glow}40` : '',
        ].filter(Boolean).join(', '),
        color: t.ink,
        fontFamily: FONT_BODY,
        position: 'relative',
        ...style,
      }}
    >
      {color && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            pointerEvents: 'none',
            boxShadow: `inset 0 0 20px ${color}18`,
          }}
        />
      )}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ---------- Button ----------
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
  title?: string;
}

export function Btn({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  glow,
  className,
  style,
  block,
  title,
}: BtnProps) {
  const t = useUiTheme();
  const height = size === 'sm' ? 34 : size === 'lg' ? 50 : 42;
  const textSize = size === 'sm' ? 13 : size === 'lg' ? 18 : 15;
  const padX = size === 'sm' ? 14 : size === 'lg' ? 24 : 18;

  const isAccent = variant === 'primary' || variant === 'good' || variant === 'bad';
  const accent =
    variant === 'primary' ? t.accent
      : variant === 'good' ? t.good
        : variant === 'bad' ? t.bad
          : t.accent;

  const bg = isAccent
    ? `linear-gradient(180deg, ${lighten(accent, 0.22)}, ${accent})`
    : variant === 'ghost'
      ? 'transparent'
      : `linear-gradient(180deg, ${lighten(t.panelTop, 0.08)}, ${t.panelBottom})`;

  const ink = isAccent ? '#0b111d' : variant === 'ghost' ? t.inkMuted : '#f8fafc';
  const border = isAccent
    ? `1.5px solid ${darken(accent, 0.38)}`
    : variant === 'ghost'
      ? '1.5px solid transparent'
      : `1.5px solid ${t.frame}`;

  const shadow = isAccent
    ? `0 3px 0 ${darken(accent, 0.48)}, inset 0 1px 0 rgba(255,255,255,0.45)${glow ? `, 0 0 18px ${accent}66` : ''}`
    : variant === 'ghost'
      ? 'none'
      : `0 2px 0 rgba(0,0,0,0.4), inset 0 1px 0 ${t.rim}38`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
      style={{
        height,
        padding: `0 ${padX}px`,
        border,
        borderRadius: TOKENS.radius.md,
        background: bg,
        color: ink,
        fontFamily: FONT_BODY,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.42 : 1,
        boxShadow: shadow,
        transition: 'filter 0.12s ease, transform 0.06s ease',
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
        <GlyphText color={ink} size={textSize}>{children}</GlyphText>
      ) : (
        children
      )}
    </button>
  );
}

// ---------- Chip (clean stat pill) ----------
export function Chip({
  icon,
  label,
  value,
  color,
  tone = 'deep',
}: {
  icon?: ReactNode;
  label?: string;
  value: string;
  color?: string;
  tone?: PanelTone;
}) {
  const t = useUiTheme();
  const top = tone === 'deep' ? t.panelDeepTop : t.panelTop;
  const bottom = tone === 'deep' ? t.panelDeepBottom : t.panelBottom;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '5px 12px',
      background: `linear-gradient(180deg, ${top}, ${bottom})`,
      border: `1.5px solid ${t.frame}`,
      borderRadius: TOKENS.radius.md,
      boxShadow: `0 2px 0 rgba(0,0,0,0.35), inset 0 1px 0 ${t.rim}28`,
      minHeight: 34,
      whiteSpace: 'nowrap',
    }}>
      {icon}
      {label && <GlyphText size={12} color={t.inkMuted} variant="body">{label}</GlyphText>}
      <GlyphText size={14} color={color ?? t.accent} raw>{value}</GlyphText>
    </div>
  );
}

// ---------- HBar (legible health/progress bar with external tabular readout) ----------
export function HBar({
  pct,
  color,
  width = 100,
  height = 10,
  showValue,
}: {
  pct: number;
  color?: string;
  width?: number | string;
  height?: number;
  showValue?: string;
}) {
  const t = useUiTheme();
  const p = Math.max(0, Math.min(1, pct));
  const c = color ?? (p > 0.5 ? t.good : p > 0.25 ? t.warn : t.bad);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        position: 'relative',
        width,
        height,
        background: '#060a12',
        border: `1.5px solid ${t.frame}`,
        borderRadius: height / 2,
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.65)',
      }}>
        <div style={{
          width: `${p * 100}%`,
          height: '100%',
          background: `linear-gradient(180deg, ${lighten(c, 0.35)}, ${c})`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 0 8px ${c}55`,
          transition: 'width 0.25s ease',
        }} />
      </div>
      {showValue && (
        <GlyphText size={13} color="#f8fafc" raw>{showValue}</GlyphText>
      )}
    </div>
  );
}

// ---------- Overlay ----------
export function Overlay({ children, onClose, dark }: { children: ReactNode; onClose?: () => void; dark?: number }) {
  const t = useUiTheme();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: dark !== undefined ? `rgba(4,8,16,${dark})` : t.scrim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        zIndex: 40,
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% 45%, transparent 25%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'auto',
          animation: 'popIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
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
  if (!hex.startsWith('#')) return hex;
  const c = parseHex(hex);
  return `rgb(${Math.round(c.r + (255 - c.r) * amt)},${Math.round(c.g + (255 - c.g) * amt)},${Math.round(c.b + (255 - c.b) * amt)})`;
}

export function darken(hex: string, amt: number): string {
  if (!hex.startsWith('#')) return hex;
  const c = parseHex(hex);
  return `rgb(${Math.round(c.r * (1 - amt))},${Math.round(c.g * (1 - amt))},${Math.round(c.b * (1 - amt))})`;
}

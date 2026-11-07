// GlyphText — Primary text component for PRESERVE EVERYTHING.
//
// Renders text using the game's custom-designed OpenType typeface family
// (PreserveDisplay for headings/buttons/badges, PreserveSans for body/stats).
// Automatically formats copy into natural Title Case or Sentence case (never
// all-caps), with clean contrast, legible minimum sizing, and tabular numbers.

import type { CSSProperties, ReactNode } from 'react';
import { FONT_DISPLAY, FONT_BODY, formatGameText, installFontLibrary } from './typeface/fontLibrary';

export interface GlyphTextProps {
  children: ReactNode;
  size?: number;
  color?: string;
  outline?: string;
  outlineWidth?: number;
  letterSpacing?: number;
  className?: string;
  align?: 'left' | 'center' | 'right';
  shadow?: { color: string; dx: number; dy: number };
  style?: CSSProperties;
  raw?: boolean;
  casing?: 'normal' | 'title' | 'sentence';
  variant?: 'display' | 'body';
}

const NUMERIC = /^[\d\s.,%+\-/:×g]+$/;

export function GlyphText({
  children,
  size = 14,
  color = '#f8fafc',
  outline,
  outlineWidth,
  letterSpacing,
  className,
  align = 'left',
  shadow,
  style,
  raw = false,
  casing,
  variant = 'display',
}: GlyphTextProps) {
  installFontLibrary();

  const px = Math.max(12, Math.round(size));
  const family = variant === 'body' ? FONT_BODY : FONT_DISPLAY;

  const textContent = typeof children === 'string' ? children : '';
  const isNumeric = textContent !== '' && NUMERIC.test(textContent.trim());
  const formattedText = textContent
    ? raw || isNumeric
      ? textContent
      : formatGameText(textContent, casing)
    : children;

  const shadows: string[] = [];
  if (outline && px >= 16) {
    const w = Math.min(2, Math.max(1, outlineWidth ? Math.round(outlineWidth * 0.35) : 1));
    shadows.push(`0 ${w}px 0 ${outline}`, `${w}px 0 0 ${outline}`, `-${w}px 0 0 ${outline}`, `0 -${w}px 0 ${outline}`);
  }
  if (shadow) {
    shadows.push(`${shadow.dx}px ${shadow.dy}px 2px ${shadow.color}`);
  } else if (px >= 16) {
    shadows.push('0 1px 3px rgba(0,0,0,0.55)');
  }

  const transform =
    align === 'center' ? 'translateX(-50%)' : align === 'right' ? 'translateX(-100%)' : undefined;

  return (
    <span
      className={`select-none ${isNumeric ? 'tabular-nums' : ''} ${className ?? ''}`.trim()}
      style={{
        display: 'inline-block',
        fontFamily: family,
        fontSize: px,
        fontWeight: variant === 'body' ? 500 : px >= 18 ? 700 : 600,
        lineHeight: variant === 'body' ? 1.5 : 1.25,
        color,
        letterSpacing: letterSpacing !== undefined ? `${Math.min(1.5, letterSpacing * 0.4)}px` : px >= 22 ? '0.02em' : '0.01em',
        textShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
        transform,
        whiteSpace: variant === 'body' ? 'normal' : undefined,
        ...style,
      }}
    >
      {formattedText}
    </span>
  );
}

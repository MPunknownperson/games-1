// PRESERVE TYPOGRAPHY COMPONENTS
// Semantic typography wrappers built on top of the dedicated font library.

import type { CSSProperties, ReactNode } from 'react';
import { TYPE_SCALE, type TextRole, installFontLibrary, formatGameText } from './fontLibrary';
import { useUiTheme } from '../theme';

interface TextProps {
  children: ReactNode;
  color?: string;
  className?: string;
  style?: CSSProperties;
  raw?: boolean;
  align?: 'left' | 'center' | 'right';
  scale?: number;
}

function useRoleStyle(role: TextRole, scale = 1) {
  installFontLibrary();
  const theme = useUiTheme();
  const token = TYPE_SCALE[role];
  const size = Math.max(11, Math.round(token.size * scale));

  const baseStyle: CSSProperties = {
    fontFamily: token.family,
    fontSize: size,
    fontWeight: token.weight,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    color: theme.ink,
  };

  return { baseStyle, token, theme };
}

export function HeroText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('hero', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'title') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

export function DisplayText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('display', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'title') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

export function TitleText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('title', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'title') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

export function HeadingText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('heading', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'title') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

export function SubheadingText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('subheading', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'title') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

export function BodyText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('body', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'sentence') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

export function LabelText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('label', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'title') : children;
  return (
    <span className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </span>
  );
}

export function StatText({ children, color, className, style, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('stat', scale);
  return (
    <span className={`tabular-nums ${className ?? ''}`} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {children}
    </span>
  );
}

export function CaptionText({ children, color, className, style, raw, align, scale = 1 }: TextProps) {
  const { baseStyle } = useRoleStyle('caption', scale);
  const text = typeof children === 'string' && !raw ? formatGameText(children, 'sentence') : children;
  return (
    <div className={className} style={{ ...baseStyle, color, textAlign: align, ...style }}>
      {text}
    </div>
  );
}

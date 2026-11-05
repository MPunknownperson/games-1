// GlyphText: renders the custom typeface as SVG for React UI.
import { useMemo } from 'react';
import { textToSvgPaths } from '../engine/typeface';

interface Props {
  children: string;
  size?: number;
  color?: string;
  stroke?: number;
  outline?: string;
  outlineWidth?: number;
  letterSpacing?: number;
  className?: string;
  align?: 'left' | 'center' | 'right';
  shadow?: { color: string; dx: number; dy: number };
  style?: React.CSSProperties;
}

export function GlyphText({
  children,
  size = 24,
  color = '#e2e8f0',
  stroke,
  outline,
  outlineWidth,
  letterSpacing,
  className,
  align = 'left',
  shadow,
  style,
}: Props) {
  const { paths, width, height } = useMemo(() => textToSvgPaths(children, size, letterSpacing), [children, size, letterSpacing]);
  const sw = stroke ?? Math.max(1.5, size * 0.09);
  const ow = outlineWidth ?? Math.max(3, size * 0.18);
  const totalW = width;
  const pad = ow + 2;
  return (
    <svg
      width={Math.ceil(totalW + pad * 2)}
      height={Math.ceil(height + pad * 2)}
      viewBox={`${-pad} ${-pad} ${totalW + pad * 2} ${height + pad * 2}`}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        overflow: 'visible',
        marginLeft: align === 'center' ? -totalW / 2 : align === 'right' ? -totalW : 0,
        ...style,
      }}
      aria-label={children}
    >
      {shadow && (
        <g
          transform={`translate(${shadow.dx},${shadow.dy})`}
          fill="none"
          stroke={shadow.color}
          strokeWidth={sw * 1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: paths }}
        />
      )}
      {outline && (
        <g
          fill="none"
          stroke={outline}
          strokeWidth={sw + ow}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: paths }}
        />
      )}
      <g
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: paths }}
      />
    </svg>
  );
}

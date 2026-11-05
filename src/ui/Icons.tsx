// Icons — all pure-SVG, code-generated. No emojis. 2.5D cartoon aesthetic.
// Each icon is a composable "block" and can be sized/colored.

interface IconProps { size?: number; color?: string; accent?: string; className?: string; }

function base(size = 24, className?: string) {
  return { width: size, height: size, viewBox: '0 0 32 32', className, style: { display: 'inline-block', verticalAlign: 'middle' as const } };
}

export function CoinIcon({ size = 24, color = '#fbbf24', accent = '#fef3c7', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <ellipse cx="16" cy="19" rx="12" ry="4" fill="#78350f" />
      <ellipse cx="16" cy="16" rx="12" ry="10" fill={color} stroke="#78350f" strokeWidth="1.5" />
      <ellipse cx="16" cy="13" rx="8" ry="6" fill={accent} opacity="0.7" />
      <path d="M13 12 L16 9 L19 12 L16 15 Z M13 20 L16 17 L19 20 L16 23 Z" fill="#78350f" opacity="0.5" />
      <text x="16" y="19" textAnchor="middle" fill="#78350f" fontSize="10" fontWeight="900" fontFamily="serif">◆</text>
    </svg>
  );
}

export function HeartIcon({ size = 24, color = '#ef4444', accent = '#fca5a5', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M16 27 C 6 20, 3 14, 6 9 C 9 4, 14 5, 16 9 C 18 5, 23 4, 26 9 C 29 14, 26 20, 16 27 Z" fill={color} stroke="#7f1d1d" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 9 C 9 8, 8 10, 9 12" stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon({ size = 24, color = '#fbbf24', accent = '#fef3c7', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="10" cy="16" r="6" fill={color} stroke="#78350f" strokeWidth="1.5" />
      <circle cx="10" cy="16" r="2" fill="#0d1220" />
      <rect x="14" y="14" width="14" height="4" fill={color} stroke="#78350f" strokeWidth="1.5" />
      <rect x="22" y="18" width="3" height="4" fill={color} stroke="#78350f" strokeWidth="1.5" />
      <rect x="26" y="18" width="3" height="4" fill={color} stroke="#78350f" strokeWidth="1.5" />
      <path d="M14 14 L28 14" stroke={accent} strokeWidth="1" />
    </svg>
  );
}

export function ChestIcon({ size = 24, color = '#a16207', accent = '#fbbf24', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 14 L4 26 L28 26 L28 14 Z" fill={color} stroke="#451a03" strokeWidth="1.5" />
      <path d="M4 14 Q 4 6, 16 6 Q 28 6, 28 14 L 28 16 L 4 16 Z" fill={color} stroke="#451a03" strokeWidth="1.5" />
      <rect x="14" y="12" width="4" height="8" fill={accent} stroke="#451a03" strokeWidth="1" />
      <circle cx="16" cy="18" r="1.5" fill="#451a03" />
      <line x1="4" y1="20" x2="28" y2="20" stroke="#451a03" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

export function CardIcon({ size = 24, color = '#7c3aed', accent = '#c4b5fd', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="6" y="4" width="20" height="24" rx="2" fill={color} stroke="#3b0764" strokeWidth="1.5" />
      <rect x="9" y="7" width="14" height="18" rx="1" fill={accent} opacity="0.4" />
      <circle cx="16" cy="13" r="3" fill={accent} />
      <path d="M12 20 L16 16 L20 20 L20 24 L12 24 Z" fill={accent} />
    </svg>
  );
}

export function ShieldIcon({ size = 24, color = '#38bdf8', accent = '#bae6fd', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M16 3 L28 7 L28 15 Q 28 24, 16 29 Q 4 24, 4 15 L 4 7 Z" fill={color} stroke="#0c4a6e" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 3 L28 7 L28 15 Q 28 24, 16 29 Z" fill={accent} opacity="0.3" />
      <path d="M11 15 L 15 19 L 22 11" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SwordIcon({ size = 24, color = '#94a3b8', accent = '#e2e8f0', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M16 3 L20 7 L18 22 L14 22 L12 7 Z" fill={color} stroke="#334155" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 7 L18 7" stroke="#334155" strokeWidth="1" />
      <rect x="9" y="22" width="14" height="3" fill="#78350f" stroke="#451a03" strokeWidth="1" />
      <rect x="14" y="25" width="4" height="6" fill="#78350f" stroke="#451a03" strokeWidth="1" />
      <path d="M16 4 L18 6 L15 22" stroke={accent} strokeWidth="1" fill="none" />
    </svg>
  );
}

export function PlayIcon({ size = 24, color = '#0d1220', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 6 L26 16 L8 26 Z" fill={color} stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
export function PauseIcon({ size = 24, color = '#e2e8f0', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="8" y="6" width="6" height="20" rx="1" fill={color} />
      <rect x="18" y="6" width="6" height="20" rx="1" fill={color} />
    </svg>
  );
}
export function CloseIcon({ size = 24, color = '#e2e8f0', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 8 L24 24 M24 8 L8 24" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
export function CrownIcon({ size = 24, color = '#fbbf24', accent = '#fef3c7', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 22 L6 12 L12 18 L16 8 L20 18 L26 12 L28 22 Z" fill={color} stroke="#78350f" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="4" y="22" width="24" height="4" fill={color} stroke="#78350f" strokeWidth="1.5" />
      <circle cx="6" cy="11" r="1.5" fill={accent} />
      <circle cx="16" cy="7" r="1.5" fill={accent} />
      <circle cx="26" cy="11" r="1.5" fill={accent} />
    </svg>
  );
}
export function StarIcon({ size = 24, color = '#fbbf24', accent = '#fef3c7', filled = true, className }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size, className)}>
      <path
        d="M16 3 L20 12 L30 13 L22 20 L25 30 L16 24 L7 30 L10 20 L2 13 L12 12 Z"
        fill={filled ? color : 'none'}
        stroke={filled ? '#78350f' : '#334155'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {filled && <path d="M16 3 L20 12 L30 13 L22 20 L25 30" fill={accent} opacity="0.35" />}
    </svg>
  );
}
export function SkullIcon({ size = 24, color = '#e2e8f0', className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 14 Q 6 5, 16 5 Q 26 5, 26 14 L 26 20 Q 26 22, 24 22 L 22 26 L 10 26 L 8 22 Q 6 22, 6 20 Z" fill={color} stroke="#334155" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="15" r="3" fill="#0d1220" />
      <circle cx="20" cy="15" r="3" fill="#0d1220" />
      <path d="M14 21 L 14 25 M 16 21 L 16 25 M 18 21 L 18 25" stroke="#0d1220" strokeWidth="1" />
    </svg>
  );
}
export function GearIcon({ size = 24, color = '#94a3b8', accent = '#e2e8f0', className }: IconProps) {
  const teeth = 8;
  const paths: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const x1 = 16 + Math.cos(a) * 11, y1 = 16 + Math.sin(a) * 11;
    const x2 = 16 + Math.cos(a + 0.15) * 13, y2 = 16 + Math.sin(a + 0.15) * 13;
    const x3 = 16 + Math.cos(a - 0.15) * 13, y3 = 16 + Math.sin(a - 0.15) * 13;
    paths.push(`M${x1},${y1} L${x2},${y2} L${x3},${y3} Z`);
  }
  return (
    <svg {...base(size, className)}>
      <circle cx="16" cy="16" r="11" fill={color} stroke="#334155" strokeWidth="1.5" />
      {paths.map((d, i) => <path key={i} d={d} fill={color} stroke="#334155" strokeWidth="1" />)}
      <circle cx="16" cy="16" r="5" fill={accent} stroke="#334155" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2" fill="#0d1220" />
    </svg>
  );
}

// Tower icons (miniature 2.5D versions for UI shop)
export function TowerIconArcher({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={{ display: 'inline-block' }}>
      <ellipse cx="20" cy="34" rx="12" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M8 30 L20 24 L32 30 L20 36 Z" fill="#166534" stroke="#0d1220" strokeWidth="1" />
      <path d="M14 30 L20 28 L20 12 L14 12 Z" fill="#4ade80" stroke="#0d1220" strokeWidth="1" />
      <path d="M20 12 L20 28 L26 30 L26 12 Z" fill="#22c55e" stroke="#0d1220" strokeWidth="1" />
      <circle cx="20" cy="10" r="5" fill="#a7f3d0" stroke="#0d1220" strokeWidth="1" />
      <path d="M15 7 Q 20 3, 25 7" stroke="#166534" strokeWidth="2" fill="none" />
    </svg>
  );
}
export function TowerIconMortar({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={{ display: 'inline-block' }}>
      <ellipse cx="20" cy="34" rx="13" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M6 32 L20 24 L34 32 L20 36 Z" fill="#7f1d1d" stroke="#0d1220" strokeWidth="1" />
      <path d="M12 30 L20 26 L20 18 L12 22 Z" fill="#f87171" stroke="#0d1220" strokeWidth="1" />
      <path d="M20 18 L28 22 L28 30 L20 26 Z" fill="#ef4444" stroke="#0d1220" strokeWidth="1" />
      <rect x="16" y="10" width="16" height="8" rx="2" transform="rotate(-25 24 14)" fill="#450a0a" stroke="#0d1220" strokeWidth="1" />
      <circle cx="31" cy="9" r="3" fill="#fecaca" stroke="#0d1220" strokeWidth="1" />
    </svg>
  );
}
export function TowerIconChill({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={{ display: 'inline-block' }}>
      <ellipse cx="20" cy="34" rx="12" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M8 32 L20 26 L32 32 L20 36 Z" fill="#0c4a6e" stroke="#0d1220" strokeWidth="1" />
      <path d="M12 30 L20 4 L28 30 Z" fill="#38bdf8" stroke="#0d1220" strokeWidth="1" />
      <path d="M20 4 L28 30 L20 30 Z" fill="#0284c7" stroke="#0d1220" strokeWidth="1" />
      <circle cx="20" cy="7" r="3" fill="#bae6fd" stroke="#0d1220" strokeWidth="1" />
    </svg>
  );
}
export function TowerIconPrism({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={{ display: 'inline-block' }}>
      <ellipse cx="20" cy="34" rx="12" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M8 32 L20 26 L32 32 L20 36 Z" fill="#3730a3" stroke="#0d1220" strokeWidth="1" />
      <rect x="18" y="14" width="4" height="14" fill="#a78bfa" stroke="#0d1220" strokeWidth="1" />
      <polygon points="20,4 28,10 26,18 14,18 12,10" fill="#c4b5fd" stroke="#0d1220" strokeWidth="1" />
      <polygon points="20,4 28,10 26,18" fill="#a78bfa" opacity="0.7" />
      <circle cx="20" cy="11" r="2" fill="#ede9fe" />
    </svg>
  );
}
export function TowerIconStorm({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={{ display: 'inline-block' }}>
      <ellipse cx="20" cy="34" rx="13" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M6 32 L20 26 L34 32 L20 36 Z" fill="#78350f" stroke="#0d1220" strokeWidth="1" />
      <rect x="10" y="14" width="4" height="16" fill="#a16207" stroke="#0d1220" strokeWidth="1" />
      <rect x="26" y="14" width="4" height="16" fill="#a16207" stroke="#0d1220" strokeWidth="1" />
      <circle cx="20" cy="10" r="6" fill="#fbbf24" stroke="#0d1220" strokeWidth="1.5" />
      <path d="M18 6 L15 12 L19 11 L17 16" stroke="#0d1220" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// Logo mark — the game's "P" preserve emblem, 2.5D style
export function LogoMark({ size = 96, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} style={{ display: 'inline-block' }}>
      <defs>
        <linearGradient id="lgShield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#166534" />
        </linearGradient>
        <linearGradient id="lgP" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Shield base */}
      <path d="M64 8 L110 22 L110 60 Q 110 100, 64 118 Q 18 100, 18 60 L 18 22 Z"
        fill="url(#lgShield)" stroke="#0d1220" strokeWidth="4" strokeLinejoin="round" />
      {/* Bevel */}
      <path d="M64 14 L104 26 L104 60 Q 104 96, 64 112 Q 24 96, 24 60 L 24 26 Z"
        fill="none" stroke="#a7f3d0" strokeWidth="2" opacity="0.6" />
      {/* Inner P glyph */}
      <path d="M44 30 L44 96 M 44 30 L 78 30 L 92 42 L 92 60 L 78 72 L 44 72"
        fill="none" stroke="#0d1220" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 30 L44 96 M 44 30 L 78 30 L 92 42 L 92 60 L 78 72 L 44 72"
        fill="none" stroke="url(#lgP)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {/* Corner rivets */}
      {[[30, 30], [98, 30], [30, 62], [98, 62]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="#0d1220" opacity="0.6" />
      ))}
    </svg>
  );
}

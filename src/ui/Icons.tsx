interface IconProps { size?: number; className?: string; }

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

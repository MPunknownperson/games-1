// PUZZLES — 7 mini-games to earn Citadel Keys.
// Supports both click-to-place and drag-and-drop, with crisp SVG vector art
// and PreserveDisplay / PreserveSans typography.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PuzzleKind } from '../engine/game';
import { audio } from '../engine/audio';
import { Btn, Panel, TOKENS } from './Blocks';
import { useUiTheme } from './theme';
import { GlyphText } from './GlyphText';

interface Props { kind: PuzzleKind; onSolve: () => void; onFail: () => void; onClose: () => void; }

const TITLES: Record<PuzzleKind, string> = {
  sigil: 'Align the Sigil',
  oracle: 'Read the Oracle',
  riddle: 'Answer the Verse',
  echo: 'Recall the Echo',
  pulse: 'Catch the Pulse',
  shift: 'Shift the Tiles',
  gear: 'Turn the Gear',
};

export function PuzzleModal({ kind, onSolve, onFail, onClose }: Props) {
  const t = useUiTheme();
  return (
    <Panel color={TOKENS.color.prism} padding={22} radius={18} style={{ maxWidth: 540, width: '100%' }} glow={TOKENS.color.prism}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <GlyphText size={24} color={t.accent}>
          {TITLES[kind]}
        </GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
      </div>
      <div style={{
        minHeight: 260,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(180deg, ${t.panelDeepTop}, ${t.panelDeepBottom})`,
        borderRadius: 12,
        padding: 20,
        border: `1.5px solid ${t.frame}`,
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.45)',
      }}>
        {kind === 'sigil' && <Sigil onSolve={onSolve} onFail={onFail} />}
        {kind === 'oracle' && <Oracle onSolve={onSolve} onFail={onFail} />}
        {kind === 'riddle' && <Riddle onSolve={onSolve} onFail={onFail} />}
        {kind === 'echo' && <Echo onSolve={onSolve} onFail={onFail} />}
        {kind === 'pulse' && <Pulse onSolve={onSolve} onFail={onFail} />}
        {kind === 'shift' && <Shift onSolve={onSolve} onFail={onFail} />}
        {kind === 'gear' && <Gear onSolve={onSolve} onFail={onFail} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <GlyphText size={13} color={t.inkMuted} variant="body">
          Complete the trial to forge a Citadel Key
        </GlyphText>
        <GlyphText size={12} color={t.accent}>+1 Key Reward</GlyphText>
      </div>
    </Panel>
  );
}

// 1. SIGIL — align 3 rune shapes with their outlines (click or drag)
function Sigil({ onSolve }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const shapes = useMemo(() => ['triangle', 'square', 'pent'] as const, []);
  const colors: Record<string, string> = { triangle: '#4ade80', square: '#f87171', pent: '#a78bfa' };
  const [placed, setPlaced] = useState<Record<string, string | null>>({ triangle: null, square: null, pent: null });
  const [selected, setSelected] = useState<string | null>(null);

  function placeInto(slot: string, shapeName?: string | null) {
    const piece = shapeName ?? selected;
    if (!piece) return;
    const np: Record<string, string | null> = { ...placed };
    for (const k of Object.keys(np)) if (np[k] === piece) np[k] = null;
    np[slot] = piece;
    setPlaced(np);
    setSelected(null);
    audio.tick();
    if (Object.keys(np).every((k) => np[k] === k)) {
      audio.success();
      setTimeout(onSolve, 450);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
      <GlyphText size={14} color={t.ink} variant="body">
        Drag or click each rune shape into its matching socket
      </GlyphText>
      <div style={{ display: 'flex', gap: 18 }}>
        {shapes.map((s) => {
          const matched = placed[s] === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => placeInto(s)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => placeInto(s)}
              style={{
                width: 84, height: 84,
                border: `2px dashed ${matched ? '#4ade80' : selected ? t.accent : '#64748b'}`,
                borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: matched ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.03)',
                cursor: selected ? 'pointer' : 'default',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <ShapeSvg name={s} size={54} filled={matched} color={matched ? colors[s] : '#94a3b8'} />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
        {shapes.map((s) => {
          const isPlaced = Object.values(placed).includes(s);
          const isSel = selected === s;
          return (
            <button
              key={s}
              type="button"
              disabled={isPlaced}
              draggable={!isPlaced}
              onClick={() => { audio.tick(); setSelected(isSel ? null : s); }}
              onDragStart={() => setSelected(s)}
              style={{
                width: 72, height: 72, borderRadius: 12,
                background: isSel ? 'rgba(251,191,36,0.16)' : `linear-gradient(180deg, ${t.panelTop}, ${t.panelBottom})`,
                border: `2px solid ${isSel ? t.accent : t.frame}`,
                opacity: isPlaced ? 0.25 : 1,
                cursor: isPlaced ? 'default' : 'grab',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isSel ? `0 0 14px ${t.accent}55` : '0 3px 0 rgba(0,0,0,0.4)',
              }}
            >
              <ShapeSvg name={s} size={48} filled color={colors[s]} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ShapeSvg({ name, size, filled, color }: { name: 'triangle' | 'square' | 'pent'; size: number; filled?: boolean; color?: string }) {
  const c = color ?? '#94a3b8';
  const stroke = '#0d1220';
  return (
    <svg width={size} height={size} viewBox="0 0 60 60">
      {name === 'triangle' && (
        <path d="M30 7 L53 49 L7 49 Z" fill={filled ? c : 'none'} stroke={filled ? stroke : c} strokeWidth={filled ? 2.5 : 3} strokeLinejoin="round" />
      )}
      {name === 'square' && (
        <rect x="9" y="9" width="42" height="42" rx="5" fill={filled ? c : 'none'} stroke={filled ? stroke : c} strokeWidth={filled ? 2.5 : 3} />
      )}
      {name === 'pent' && (
        <path d="M30 6 L54 24 L45 52 L15 52 L6 24 Z" fill={filled ? c : 'none'} stroke={filled ? stroke : c} strokeWidth={filled ? 2.5 : 3} strokeLinejoin="round" />
      )}
    </svg>
  );
}

// 2. ORACLE — pick the symbol matching the prophecy
function Oracle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const options = useMemo(() => {
    const all = [
      { sym: 'sun', name: 'Dawn', meaning: 'A new beginning rises' },
      { sym: 'moon', name: 'Dusk', meaning: 'Reflect and renew' },
      { sym: 'star', name: 'Fate', meaning: 'Paths align in silence' },
      { sym: 'flame', name: 'Pyre', meaning: 'Change forged in fire' },
    ] as const;
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return { all, target: shuffled[0] };
  }, []);
  const [picked, setPicked] = useState<number | null>(null);

  function pick(i: number) {
    setPicked(i);
    if (options.all[i].name === options.target.name) { audio.success(); setTimeout(onSolve, 450); }
    else { audio.err(); setTimeout(onFail, 750); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <GlyphText size={13} color={t.inkMuted} variant="body">The Oracle speaks:</GlyphText>
      <GlyphText size={19} color={t.accent}>
        {`"${options.target.meaning}"`}
      </GlyphText>
      <GlyphText size={13} color={t.ink} variant="body">Choose the matching sigil:</GlyphText>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
        {options.all.map((c, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={picked !== null}
            style={{
              width: 84, height: 100, borderRadius: 12, padding: 8,
              background: picked === i
                ? (c.name === options.target.name ? 'rgba(74,222,128,0.28)' : 'rgba(239,68,68,0.28)')
                : `linear-gradient(180deg, ${t.panelTop}, ${t.panelBottom})`,
              border: `2px solid ${picked === i ? (c.name === options.target.name ? t.good : t.bad) : t.frame}`,
              cursor: picked === null ? 'pointer' : 'default',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
            }}
          >
            <OracleSym s={c.sym} />
            <GlyphText size={13} color={t.ink}>{c.name}</GlyphText>
          </button>
        ))}
      </div>
    </div>
  );
}

function OracleSym({ s }: { s: 'sun' | 'moon' | 'star' | 'flame' }) {
  return (
    <svg width="44" height="44" viewBox="0 0 40 40">
      {s === 'sun' && (
        <>
          <circle cx="20" cy="20" r="8" fill="#fbbf24" stroke="#78350f" strokeWidth="1.5" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={20 + Math.cos(a) * 11} y1={20 + Math.sin(a) * 11} x2={20 + Math.cos(a) * 17} y2={20 + Math.sin(a) * 17} stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />;
          })}
        </>
      )}
      {s === 'moon' && (
        <path d="M26 8 A 12 12 0 1 0 26 32 A 9 9 0 1 1 26 8 Z" fill="#e2e8f0" stroke="#334155" strokeWidth="1.5" />
      )}
      {s === 'star' && (
        <path d="M20 4 L24 15 L35 16 L26 23 L29 34 L20 28 L11 34 L14 23 L5 16 L16 15 Z" fill="#a78bfa" stroke="#3b0764" strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {s === 'flame' && (
        <path d="M20 6 Q 12 12, 14 22 Q 12 26, 15 30 Q 20 36, 25 30 Q 28 26, 26 22 Q 28 12, 20 6 Z" fill="#f97316" stroke="#7c2d12" strokeWidth="1.5" strokeLinejoin="round" />
      )}
    </svg>
  );
}

// 3. RIDDLE
function Riddle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const q = useMemo(() => {
    const qs = [
      { text: 'I have no voice, yet tell all tales; I have no legs, yet chart the trails. What am I?', answers: ['A Map', 'A Sword', 'A Torch', 'A Key'], correct: 0 },
      { text: 'Earned by valor, spent on towers and walls; gained from every foe that falls. What am I?', answers: ['Timber', 'Gold', 'Iron', 'Honor'], correct: 1 },
      { text: 'I guard the path, yet never march; I strike from afar through stone and arch. What am I?', answers: ['A Knight', 'A Tower', 'A Dragon', 'A Rampart'], correct: 1 },
      { text: 'Three teeth I bear, yet never bite; I turn the lock that frees the light. What am I?', answers: ['A Comb', 'A Key', 'A Chisel', 'A Coin'], correct: 1 },
      { text: 'Born of storm, I arc from cloud; I strike with flash, fierce and loud. What am I?', answers: ['Rain', 'Lightning', 'Thunder', 'Gale'], correct: 1 },
    ];
    return qs[Math.floor(Math.random() * qs.length)];
  }, []);
  const [picked, setPicked] = useState<number | null>(null);

  function pick(i: number) {
    setPicked(i);
    if (i === q.correct) { audio.success(); setTimeout(onSolve, 450); }
    else { audio.err(); setTimeout(onFail, 750); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', maxWidth: 420 }}>
      <GlyphText size={15} color={t.ink} variant="body" style={{ textAlign: 'center' }}>
        {q.text}
      </GlyphText>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', marginTop: 6 }}>
        {q.answers.map((a, i) => (
          <Btn
            key={i}
            onClick={() => pick(i)}
            disabled={picked !== null}
            variant={picked === i ? (i === q.correct ? 'good' : 'bad') : 'secondary'}
            size="md"
            block
          >
            {a}
          </Btn>
        ))}
      </div>
    </div>
  );
}

// 4. ECHO — sequence memory
function Echo({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const pads = useMemo(() => [
    { color: '#ef4444', id: 0 }, { color: '#3b82f6', id: 1 }, { color: '#22c55e', id: 2 }, { color: '#eab308', id: 3 },
  ], []);
  const [sequence] = useState(() => Array.from({ length: 4 }, () => Math.floor(Math.random() * 4)));
  const [phase, setPhase] = useState<'show' | 'input' | 'done'>('show');
  const [inputIdx, setInputIdx] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== 'show') return;
    let i = 0;
    const step = () => {
      if (i >= sequence.length) { setPhase('input'); return; }
      setFlashId(sequence[i]);
      audio.tick();
      setTimeout(() => { setFlashId(null); i++; setTimeout(step, 200); }, 480);
    };
    const timer = setTimeout(step, 450);
    return () => clearTimeout(timer);
  }, [phase, sequence]);

  function press(id: number) {
    if (phase !== 'input') return;
    setFlashId(id);
    audio.tick();
    setTimeout(() => setFlashId(null), 180);
    if (sequence[inputIdx] !== id) { audio.err(); setPhase('done'); setTimeout(onFail, 500); return; }
    if (inputIdx + 1 >= sequence.length) { setPhase('done'); audio.success(); setTimeout(onSolve, 450); }
    else setInputIdx(inputIdx + 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <GlyphText size={14} color={phase === 'input' ? t.accent : t.inkMuted} variant="body">
        {phase === 'show' ? 'Watch the sequence carefully...' : phase === 'input' ? `Repeat the pattern (${inputIdx + 1} of ${sequence.length})` : 'Complete!'}
      </GlyphText>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {pads.map((p) => (
          <button
            key={p.id}
            onMouseDown={() => press(p.id)}
            onTouchStart={(e) => { e.preventDefault(); press(p.id); }}
            disabled={phase !== 'input'}
            style={{
              width: 94, height: 94, borderRadius: 14, border: `3px solid ${p.color}`,
              background: flashId === p.id ? p.color : `${p.color}2e`,
              boxShadow: flashId === p.id ? `0 0 32px ${p.color}` : 'inset 0 2px 6px rgba(0,0,0,0.4)',
              opacity: phase === 'input' ? 1 : 0.72,
              cursor: phase === 'input' ? 'pointer' : 'default',
              transition: 'all 0.1s',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// 5. PULSE — timing bar
function Pulse({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const [pos, setPos] = useState(0);
  const dirRef = useRef(1);
  const [done, setDone] = useState(false);
  const [attempts, setAttempts] = useState(2);

  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setPos((p) => {
        let np = p + dirRef.current * 0.85 * dt;
        if (np > 1) { np = 1; dirRef.current = -1; }
        if (np < 0) { np = 0; dirRef.current = 1; }
        return np;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function hit() {
    if (done) return;
    const good = pos >= 0.44 && pos <= 0.56;
    if (good) { setDone(true); audio.success(); setTimeout(onSolve, 450); }
    else {
      const rem = attempts - 1;
      setAttempts(rem);
      audio.err();
      if (rem <= 0) { setDone(true); setTimeout(onFail, 500); }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', width: '100%' }}>
      <GlyphText size={14} color={t.ink} variant="body">Strike when the marker enters the green zone</GlyphText>
      <div style={{ position: 'relative', width: 320, maxWidth: '100%', height: 42, background: t.panelDeepBottom, border: `2px solid ${t.frame}`, borderRadius: 10, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '44%', width: '12%', background: 'rgba(74,222,128,0.3)', borderLeft: '2px solid #4ade80', borderRight: '2px solid #4ade80' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos * 100}%`, width: 6, background: '#fbbf24', transform: 'translateX(-50%)', boxShadow: '0 0 12px #fbbf24', borderRadius: 3 }} />
      </div>
      <Btn variant="primary" size="lg" onClick={hit} disabled={done}>Strike</Btn>
      <GlyphText size={13} color={t.inkMuted} variant="body">{`Attempts remaining: ${attempts}`}</GlyphText>
    </div>
  );
}

// 6. SHIFT — 3x3 sliding puzzle
function Shift({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const size = 3;
  const [tiles, setTiles] = useState<number[]>(() => {
    const arr: number[] = Array.from({ length: size * size }, (_, i) => i);
    let blank = size * size - 1;
    for (let i = 0; i < 24; i++) {
      const neighbors: number[] = [];
      const r = Math.floor(blank / size), c = blank % size;
      if (r > 0) neighbors.push(blank - size);
      if (r < size - 1) neighbors.push(blank + size);
      if (c > 0) neighbors.push(blank - 1);
      if (c < size - 1) neighbors.push(blank + 1);
      const n = neighbors[Math.floor(Math.random() * neighbors.length)];
      [arr[blank], arr[n]] = [arr[n], arr[blank]];
      blank = n;
    }
    return arr;
  });
  const [moves, setMoves] = useState(0);
  const blankIdx = tiles.indexOf(size * size - 1);

  function click(i: number) {
    const br = Math.floor(blankIdx / size), bc = blankIdx % size;
    const r = Math.floor(i / size), c = i % size;
    if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return;
    const nt = [...tiles];
    [nt[blankIdx], nt[i]] = [nt[i], nt[blankIdx]];
    setTiles(nt); setMoves(moves + 1); audio.tick();
    if (nt.every((v, idx) => v === idx)) { audio.success(); setTimeout(onSolve, 400); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <GlyphText size={14} color={t.ink} variant="body">{`Order the numbered tiles 1 to 8 (Moves: ${moves})`}</GlyphText>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 6, background: t.panelDeepBottom, padding: 8, borderRadius: 10, border: `1.5px solid ${t.frame}` }}>
        {tiles.map((v, i) => {
          const isBlank = v === size * size - 1;
          const inPlace = v === i;
          return (
            <button
              key={i}
              onClick={() => click(i)}
              disabled={isBlank}
              style={{
                width: 64, height: 64, borderRadius: 8,
                background: isBlank ? 'transparent' : `linear-gradient(180deg, ${t.panelTop}, ${t.panelBottom})`,
                border: isBlank ? 'none' : `2px solid ${inPlace ? '#4ade80' : t.frame}`,
                cursor: isBlank ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isBlank ? 'none' : '0 3px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
            >
              {!isBlank && <GlyphText size={24} color={inPlace ? '#86efac' : '#fef3c7'} raw>{String(v + 1)}</GlyphText>}
            </button>
          );
        })}
      </div>
      <Btn variant="ghost" size="sm" onClick={onFail}>Forfeit Trial</Btn>
    </div>
  );
}

// 7. GEAR — turn dial to align with target notch
function Gear({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const t = useUiTheme();
  const target = useMemo(() => Math.floor(Math.random() * 12), []);
  const [angle, setAngle] = useState(() => (target + 3 + Math.floor(Math.random() * 6)) % 12);
  const [attempts, setAttempts] = useState(3);
  function turn(d: number) { setAngle((a) => (a + d + 12) % 12); audio.tick(); }
  function confirm() {
    if (angle === target) { audio.success(); setTimeout(onSolve, 400); }
    else {
      audio.err(); const n = attempts - 1; setAttempts(n);
      if (n <= 0) setTimeout(onFail, 500);
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <GlyphText size={14} color={t.ink} variant="body">Rotate the dial to align with the golden notch</GlyphText>
      <svg width="176" height="176" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill={t.panelDeepBottom} stroke={t.frame} strokeWidth="3" />
        <circle cx="100" cy="100" r="80" fill="none" stroke={t.edge} strokeWidth="1.5" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 100 + Math.cos(a) * 72; const y = 100 + Math.sin(a) * 72;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={i === target ? 9 : 4} fill={i === target ? '#fbbf24' : '#64748b'} stroke={i === target ? '#78350f' : 'none'} strokeWidth="1.5" />
              {i === target && <path d={`M${x - 4},${y} L${x},${y - 4} L${x + 4},${y} L${x},${y + 4} Z`} fill="#fef3c7" />}
            </g>
          );
        })}
        <g transform={`rotate(${(angle / 12) * 360} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="32" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
          <polygon points="100,24 94,37 106,37" fill="#fef3c7" stroke="#78350f" strokeWidth="1.5" />
        </g>
        <circle cx="100" cy="100" r="11" fill="#fbbf24" stroke="#78350f" strokeWidth="2" />
      </svg>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Btn variant="secondary" size="sm" onClick={() => turn(-1)}>Turn Left</Btn>
        <Btn variant="primary" size="md" onClick={confirm}>Unlock</Btn>
        <Btn variant="secondary" size="sm" onClick={() => turn(1)}>Turn Right</Btn>
      </div>
      <GlyphText size={13} color={t.inkMuted} variant="body">{`Attempts remaining: ${attempts}`}</GlyphText>
    </div>
  );
}

// PUZZLES — 7 types of mini-games. All visuals code-generated (SVG/CSS).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PuzzleKind } from '../engine/game';
import { audio } from '../engine/audio';
import { Btn, Panel, TOKENS } from './Blocks';
import { GlyphText } from './GlyphText';

interface Props { kind: PuzzleKind; onSolve: () => void; onFail: () => void; onClose: () => void; }

const TITLES: Record<PuzzleKind, string> = {
  sigil: 'ALIGN THE SIGIL',
  oracle: 'READ THE ORACLE',
  riddle: 'ANSWER THE VERSE',
  echo: 'RECALL THE ECHO',
  pulse: 'CATCH THE PULSE',
  shift: 'SHIFT THE TILES',
  gear: 'TURN THE GEAR',
};

export function PuzzleModal({ kind, onSolve, onFail, onClose }: Props) {
  return (
    <Panel color={TOKENS.color.panel} padding={20} radius={18} style={{ maxWidth: 560, width: '100%' }} glow={TOKENS.color.prism}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <GlyphText size={26} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={4}>
          {TITLES[kind]}
        </GlyphText>
      </div>
      <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', background: TOKENS.color.panelDark, borderRadius: 12, padding: 16, border: `2px solid ${TOKENS.color.outline}` }}>
        {kind === 'sigil' && <Sigil onSolve={onSolve} onFail={onFail} />}
        {kind === 'oracle' && <Oracle onSolve={onSolve} onFail={onFail} />}
        {kind === 'riddle' && <Riddle onSolve={onSolve} onFail={onFail} />}
        {kind === 'echo' && <Echo onSolve={onSolve} onFail={onFail} />}
        {kind === 'pulse' && <Pulse onSolve={onSolve} onFail={onFail} />}
        {kind === 'shift' && <Shift onSolve={onSolve} onFail={onFail} />}
        {kind === 'gear' && <Gear onSolve={onSolve} onFail={onFail} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <GlyphText size={11} color={TOKENS.color.inkMuted}>SOLVE TO EARN A KEY</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}>CLOSE</Btn>
      </div>
    </Panel>
  );
}

// 1. SIGIL — align 3 rune shapes with their outlines by drag
function Sigil({ onSolve }: { onSolve: () => void; onFail: () => void }) {
  const shapes = useMemo(() => ['triangle', 'square', 'pent'] as const, []);
  const [placed, setPlaced] = useState<Record<string, string | null>>({ triangle: null, square: null, pent: null });
  const [drag, setDrag] = useState<string | null>(null);

  function drop(slot: string) {
    if (!drag) return;
    const np: Record<string, string | null> = { ...placed };
    for (const k of Object.keys(np)) if (np[k] === drag) np[k] = null;
    np[slot] = drag;
    setPlaced(np);
    setDrag(null);
    audio.tick();
    if (Object.keys(np).every((k) => np[k] === k)) { audio.success(); setTimeout(onSolve, 500); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <GlyphText size={13} color={TOKENS.color.ink}>DRAG EACH SHAPE TO ITS OUTLINE</GlyphText>
      <div style={{ display: 'flex', gap: 16 }}>
        {shapes.map((s) => (
          <div
            key={s}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(s)}
            onTouchEnd={() => { if (drag) drop(s); }}
            style={{ width: 80, height: 80, border: '2px dashed #64748b', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: placed[s] === s ? 'rgba(74,222,128,0.15)' : 'transparent' }}
          >
            <ShapeSvg name={s} size={54} filled={placed[s] === s} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        {shapes.map((s) => {
          const isPlaced = Object.values(placed).includes(s);
          return (
            <div
              key={s}
              draggable={!isPlaced}
              onDragStart={() => setDrag(s)}
              onTouchStart={() => setDrag(s)}
              style={{ opacity: isPlaced ? 0.25 : 1, cursor: isPlaced ? 'default' : 'grab', touchAction: 'none' }}
            >
              <ShapeSvg name={s} size={54} filled color={['#4ade80', '#f87171', '#a78bfa'][shapes.indexOf(s)]} />
            </div>
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
        <path d="M30 5 L55 50 L5 50 Z" fill={filled ? c : 'none'} stroke={filled ? stroke : c} strokeWidth={filled ? 2 : 3} strokeLinejoin="round" />
      )}
      {name === 'square' && (
        <rect x="8" y="8" width="44" height="44" rx="4" fill={filled ? c : 'none'} stroke={filled ? stroke : c} strokeWidth={filled ? 2 : 3} />
      )}
      {name === 'pent' && (
        <path d="M30 5 L55 25 L45 55 L15 55 L5 25 Z" fill={filled ? c : 'none'} stroke={filled ? stroke : c} strokeWidth={filled ? 2 : 3} strokeLinejoin="round" />
      )}
    </svg>
  );
}

// 2. ORACLE — pick the symbol matching the prophecy
function Oracle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const options = useMemo(() => {
    const all = [
      { sym: 'sun', name: 'DAWN', meaning: 'A NEW BEGINNING RISES' },
      { sym: 'moon', name: 'DUSK', meaning: 'REFLECT AND RENEW' },
      { sym: 'star', name: 'FATE', meaning: 'PATHS ALIGN IN SILENCE' },
      { sym: 'flame', name: 'PYRE', meaning: 'CHANGE FORGED IN FIRE' },
    ] as const;
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return { all, target: shuffled[0] };
  }, []);
  const [picked, setPicked] = useState<number | null>(null);

  function pick(i: number) {
    setPicked(i);
    if (options.all[i].name === options.target.name) { audio.success(); setTimeout(onSolve, 500); }
    else { audio.err(); setTimeout(onFail, 800); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <GlyphText size={13} color={TOKENS.color.inkMuted}>THE ORACLE SPEAKS</GlyphText>
      <GlyphText size={16} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={3}>
        {`"${options.target.meaning}"`}
      </GlyphText>
      <GlyphText size={12} color={TOKENS.color.ink}>WHICH SYMBOL?</GlyphText>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {options.all.map((c, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={picked !== null}
            style={{
              width: 74, height: 92, borderRadius: 10, padding: 6,
              background: picked === i ? (c.name === options.target.name ? '#166534' : '#7f1d1d') : '#0a0f1a',
              border: `2px solid ${picked === i ? (c.name === options.target.name ? '#4ade80' : '#ef4444') : '#334155'}`,
              cursor: picked === null ? 'pointer' : 'default',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            <OracleSym s={c.sym} />
            <GlyphText size={10} color="#cbd5e1">{c.name}</GlyphText>
          </button>
        ))}
      </div>
    </div>
  );
}
function OracleSym({ s }: { s: 'sun' | 'moon' | 'star' | 'flame' }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
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
  const q = useMemo(() => {
    const qs = [
      { text: 'I HAVE NO VOICE BUT TELL ALL TALES; I HAVE NO LEGS BUT NEVER FAIL. WHAT AM I?', answers: ['A MAP', 'A SWORD', 'A FIRE', 'A KEY'], correct: 0 },
      { text: 'I AM EARNED BY COURAGE, SPENT BY WAR. YOU GAIN ME FROM THE ONES YOU FLOOR. WHAT AM I?', answers: ['WOOD', 'GOLD', 'IRON', 'BLOOD'], correct: 1 },
      { text: 'I GUARD THE PATH BUT NEVER MARCH; I STRIKE FROM FAR WITH SILENT ART. WHAT AM I?', answers: ['A KNIGHT', 'A TOWER', 'A DRAGON', 'A WALL'], correct: 1 },
      { text: 'THREE TEETH I HAVE, YET NEVER BITE; I TURN THE LOCK THAT HIDES THE LIGHT. WHAT AM I?', answers: ['A COMB', 'A KEY', 'A NAIL', 'A COIN'], correct: 1 },
      { text: 'BORN OF STORM, I LEAP FROM CLOUD; I STRIKE ONCE THEN AM NEVER LOUD. WHAT AM I?', answers: ['RAIN', 'LIGHTNING', 'THUNDER', 'WIND'], correct: 1 },
    ];
    return qs[Math.floor(Math.random() * qs.length)];
  }, []);
  const [picked, setPicked] = useState<number | null>(null);

  function pick(i: number) {
    setPicked(i);
    if (i === q.correct) { audio.success(); setTimeout(onSolve, 500); }
    else { audio.err(); setTimeout(onFail, 800); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', maxWidth: 400 }}>
      <GlyphText size={14} color={TOKENS.color.ink} outline={TOKENS.color.outline} outlineWidth={2} letterSpacing={1}>
        {q.text}
      </GlyphText>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginTop: 8 }}>
        {q.answers.map((a, i) => (
          <Btn
            key={i}
            onClick={() => pick(i)}
            disabled={picked !== null}
            variant={picked === i ? (i === q.correct ? 'good' : 'bad') : 'secondary'}
            size="sm"
            block
          >
            {a}
          </Btn>
        ))}
      </div>
    </div>
  );
}

// 4. ECHO — Simon-like sequence memory
function Echo({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
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
      setTimeout(() => { setFlashId(null); i++; setTimeout(step, 200); }, 500);
    };
    const t = setTimeout(step, 500);
    return () => clearTimeout(t);
  }, [phase, sequence]);

  function press(id: number) {
    if (phase !== 'input') return;
    setFlashId(id);
    audio.tick();
    setTimeout(() => setFlashId(null), 200);
    if (sequence[inputIdx] !== id) { audio.err(); setPhase('done'); setTimeout(onFail, 500); return; }
    if (inputIdx + 1 >= sequence.length) { setPhase('done'); audio.success(); setTimeout(onSolve, 500); }
    else setInputIdx(inputIdx + 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <GlyphText size={13} color={TOKENS.color.ink}>{phase === 'show' ? 'WATCH...' : phase === 'input' ? 'REPEAT!' : '...'}</GlyphText>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {pads.map((p) => (
          <button
            key={p.id}
            onMouseDown={() => press(p.id)}
            onTouchStart={(e) => { e.preventDefault(); press(p.id); }}
            disabled={phase !== 'input'}
            style={{
              width: 96, height: 96, borderRadius: 14, border: `3px solid ${p.color}`,
              background: flashId === p.id ? p.color : `${p.color}33`,
              boxShadow: flashId === p.id ? `0 0 40px ${p.color}` : 'none',
              opacity: phase === 'input' ? 1 : 0.7,
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
  const [pos, setPos] = useState(0);
  const dirRef = useRef(1);
  const [done, setDone] = useState(false);
  const attRef = useRef(2);

  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      setPos((p) => {
        let np = p + dirRef.current * 0.9 * dt;
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
    const good = pos > 0.45 && pos < 0.55;
    if (good) { setDone(true); audio.success(); setTimeout(onSolve, 500); }
    else {
      attRef.current--; audio.err();
      if (attRef.current <= 0) { setDone(true); setTimeout(onFail, 500); }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: '100%' }}>
      <GlyphText size={13} color={TOKENS.color.ink}>STRIKE ON THE GREEN LINE</GlyphText>
      <div style={{ position: 'relative', width: 320, height: 40, background: '#0a0f1a', border: `3px solid ${TOKENS.color.outline}`, borderRadius: 8 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '45%', width: '10%', background: 'linear-gradient(180deg, rgba(74,222,128,0.4), rgba(74,222,128,0.2))', borderLeft: '2px solid #4ade80', borderRight: '2px solid #4ade80' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos * 100}%`, width: 6, background: '#fbbf24', transform: 'translateX(-50%)', boxShadow: '0 0 12px #fbbf24' }} />
      </div>
      <Btn variant="primary" size="lg" onClick={hit} disabled={done}>STRIKE</Btn>
      <GlyphText size={11} color={TOKENS.color.inkMuted}>{`ATTEMPTS: ${attRef.current}`}</GlyphText>
    </div>
  );
}

// 6. SHIFT — 3x3 sliding puzzle
function Shift({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const size = 3;
  const [tiles, setTiles] = useState<number[]>(() => {
    const t: number[] = Array.from({ length: size * size }, (_, i) => i);
    let blank = size * size - 1;
    for (let i = 0; i < 30; i++) {
      const neighbors: number[] = [];
      const r = Math.floor(blank / size), c = blank % size;
      if (r > 0) neighbors.push(blank - size);
      if (r < size - 1) neighbors.push(blank + size);
      if (c > 0) neighbors.push(blank - 1);
      if (c < size - 1) neighbors.push(blank + 1);
      const n = neighbors[Math.floor(Math.random() * neighbors.length)];
      [t[blank], t[n]] = [t[n], t[blank]];
      blank = n;
    }
    return t;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <GlyphText size={12} color={TOKENS.color.ink}>{`RESTORE THE ATLAS. MOVES: ${moves}`}</GlyphText>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 4, background: '#0a0f1a', padding: 6, borderRadius: 8, border: `2px solid ${TOKENS.color.outline}` }}>
        {tiles.map((v, i) => (
          <button
            key={i}
            onClick={() => click(i)}
            style={{
              width: 64, height: 64, borderRadius: 6,
              background: v === size * size - 1 ? 'transparent' : 'linear-gradient(180deg, #475569, #334155)',
              border: v === size * size - 1 ? 'none' : `2px solid #0d1220`,
              cursor: v === size * size - 1 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: v === size * size - 1 ? 'none' : 'inset 0 -2px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            {v !== size * size - 1 && <GlyphText size={24} color="#fef3c7" outline="#0d1220" outlineWidth={3}>{String(v + 1)}</GlyphText>}
          </button>
        ))}
      </div>
      <Btn variant="ghost" size="sm" onClick={onFail}>GIVE UP</Btn>
    </div>
  );
}

// 7. GEAR — turn dial to align with target notch
function Gear({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const target = useMemo(() => Math.floor(Math.random() * 12), []);
  const [angle, setAngle] = useState(Math.floor(Math.random() * 12));
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <GlyphText size={13} color={TOKENS.color.ink}>ALIGN THE POINTER TO THE MARK</GlyphText>
      <svg width="180" height="180" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="#0a0f1a" stroke={TOKENS.color.outline} strokeWidth="3" />
        <circle cx="100" cy="100" r="82" fill="none" stroke="#334155" strokeWidth="2" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 100 + Math.cos(a) * 74; const y = 100 + Math.sin(a) * 74;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={i === target ? 8 : 3} fill={i === target ? '#fbbf24' : '#64748b'} stroke={i === target ? '#78350f' : 'none'} strokeWidth="1.5" />
              {i === target && <path d={`M${x - 3},${y} L${x},${y - 3} L${x + 3},${y} L${x},${y + 3} Z`} fill="#fef3c7" />}
            </g>
          );
        })}
        <g transform={`rotate(${(angle / 12) * 360} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="30" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
          <polygon points="100,25 96,35 104,35" fill="#fef3c7" stroke="#78350f" strokeWidth="1.5" />
        </g>
        <circle cx="100" cy="100" r="10" fill="#fbbf24" stroke="#78350f" strokeWidth="2" />
      </svg>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn variant="secondary" size="sm" onClick={() => turn(-1)}>LEFT</Btn>
        <Btn variant="primary" size="md" onClick={confirm}>UNLOCK</Btn>
        <Btn variant="secondary" size="sm" onClick={() => turn(1)}>RIGHT</Btn>
      </div>
      <GlyphText size={11} color={TOKENS.color.inkMuted}>{`ATTEMPTS: ${attempts}`}</GlyphText>
    </div>
  );
}

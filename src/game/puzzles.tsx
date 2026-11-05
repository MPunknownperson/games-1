// Puzzle mini-games. Each takes { onSolve, onFail } and renders self-contained UI.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PuzzleKind } from './types';
import { audio } from './audio';

interface PuzzleProps {
  kind: PuzzleKind;
  onSolve: () => void;
  onFail: () => void;
}

const TITLES: Record<PuzzleKind, string> = {
  jigsaw: 'Snap the Sigil',
  tarot: 'Read the Cards',
  riddle: 'The Warden\'s Riddle',
  memory: 'Recall the Sequence',
  timing: 'Time the Glyph',
  slider: 'Slide the Tiles',
  dial: 'Turn the Lock Dial',
};

export function PuzzleContainer({ kind, onSolve, onFail }: PuzzleProps) {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xl mx-auto">
      <h3 className="text-2xl font-bold text-amber-200 tracking-wider" style={{ fontFamily: 'serif' }}>
        {TITLES[kind]}
      </h3>
      <div className="w-full rounded-xl bg-slate-900/80 border-2 border-amber-500/40 p-6 min-h-[320px] flex items-center justify-center">
        {kind === 'jigsaw' && <JigsawPuzzle onSolve={onSolve} onFail={onFail} />}
        {kind === 'tarot' && <TarotPuzzle onSolve={onSolve} onFail={onFail} />}
        {kind === 'riddle' && <RiddlePuzzle onSolve={onSolve} onFail={onFail} />}
        {kind === 'memory' && <MemoryPuzzle onSolve={onSolve} onFail={onFail} />}
        {kind === 'timing' && <TimingPuzzle onSolve={onSolve} onFail={onFail} />}
        {kind === 'slider' && <SliderPuzzle onSolve={onSolve} onFail={onFail} />}
        {kind === 'dial' && <DialPuzzle onSolve={onSolve} onFail={onFail} />}
      </div>
      <p className="text-xs text-slate-400 text-center">Solve the puzzle to earn a Key.</p>
    </div>
  );
}

// 1) JIGSAW — drag 3 pieces to positions on a sigil grid
function JigsawPuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const slots = useMemo(() => [0, 1, 2], []);
  const [placed, setPlaced] = useState<Record<number, number | null>>({ 0: null, 1: null, 2: null });
  const [dragId, setDragId] = useState<number | null>(null);
  const pieces = [0, 1, 2];
  const colors = ['#86efac', '#fca5a5', '#7dd3fc'];
  const icons = ['🌙', '☀️', '⭐'];

  function drop(slot: number) {
    if (dragId === null) return;
    const np = { ...placed };
    // remove from old slot
    for (const k of Object.keys(np)) if (np[+k] === dragId) np[+k] = null;
    np[slot] = dragId;
    setPlaced(np);
    setDragId(null);
    audio.puzzleTick();
    const done = slots.every((s) => np[s] === s);
    if (done) { audio.success(); setTimeout(onSolve, 600); }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-slate-300 text-sm">Drag each piece onto its matching slot.</p>
      <div className="flex gap-4 mb-2">
        {slots.map((s) => (
          <div
            key={s}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(s)}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center text-3xl"
            style={{ background: placed[s] === s ? colors[s] + '44' : 'rgba(0,0,0,0.3)' }}
          >
            {placed[s] === s ? icons[s] : <span className="text-slate-600 text-xs">SLOT {s + 1}</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        {pieces.map((p) => {
          const isPlaced = Object.values(placed).includes(p);
          return (
            <div
              key={p}
              draggable={!isPlaced}
              onDragStart={() => setDragId(p)}
              onTouchStart={() => setDragId(p)}
              onTouchEnd={() => {
                // Snap to first empty slot for touch
                if (dragId === null) return;
                const firstEmpty = slots.find((s) => placed[s] === null);
                if (firstEmpty !== undefined) drop(firstEmpty);
              }}
              className={`w-16 h-16 rounded-lg flex items-center justify-center text-2xl cursor-grab active:cursor-grabbing select-none ${isPlaced ? 'opacity-30 pointer-events-none' : ''}`}
              style={{ background: colors[p], color: '#0b0f1a', fontWeight: 'bold' }}
            >
              {icons[p]}
            </div>
          );
        })}
      </div>
      <button onClick={onFail} className="text-xs text-slate-500 mt-2 hover:text-slate-300">Give up</button>
    </div>
  );
}

// 2) TAROT — pick the card matching the hint
function TarotPuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const options = useMemo(() => {
    const all = [
      { sym: '⚔️', name: 'Sword', meaning: 'Conflict and courage' },
      { sym: '🏆', name: 'Cup', meaning: 'Emotion and love' },
      { sym: '💎', name: 'Pentacle', meaning: 'Wealth and craft' },
      { sym: '🪄', name: 'Wand', meaning: 'Will and creation' },
    ];
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return { all, target: shuffled[0] };
  }, []);
  const [picked, setPicked] = useState<number | null>(null);

  function pick(i: number) {
    setPicked(i);
    if (options.all[i].name === options.target.name) {
      audio.success();
      setTimeout(onSolve, 600);
    } else {
      audio.error();
      setTimeout(onFail, 800);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-slate-300 text-sm text-center">The spread reveals:</p>
      <p className="text-amber-200 text-center italic">"{options.target.meaning}"</p>
      <p className="text-slate-400 text-sm">Which card is signified?</p>
      <div className="flex gap-3 flex-wrap justify-center">
        {options.all.map((c, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={picked !== null}
            className={`w-20 h-28 rounded-lg border-2 flex flex-col items-center justify-center gap-1 text-2xl transition-all hover:scale-105 ${picked === i ? (c.name === options.target.name ? 'border-emerald-400 bg-emerald-900/40' : 'border-red-400 bg-red-900/40') : 'border-slate-600 bg-slate-800'}`}
          >
            <span>{c.sym}</span>
            <span className="text-[10px] text-slate-300">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 3) RIDDLE — multiple choice
function RiddlePuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const q = useMemo(() => {
    const qs = [
      {
        text: 'I have no voice but tell all tales; I have no legs but never fail. The warden reads me as he sails through gates of time on endless trails. What am I?',
        answers: ['A map', 'A sword', 'A fire', 'A key'],
        correct: 0,
      },
      {
        text: 'I am earned by courage, spent by war, stashed and saved but never stored. You gain me from the ones you floor, and spend on what you place before. What am I?',
        answers: ['Wood', 'Gold', 'Iron', 'Blood'],
        correct: 1,
      },
      {
        text: 'I guard the path but never march; I slay from far with arcane art. You build me high on cobble arch, and I shall do the warden\'s part. What am I?',
        answers: ['A knight', 'A tower', 'A dragon', 'A wall'],
        correct: 1,
      },
      {
        text: 'Three teeth I have, yet never bite; I turn the lock that hides the light. Once turned true, my chest takes flight, and spills forth wonder, gold, and might. What am I?',
        answers: ['A comb', 'A key', 'A nail', 'A coin'],
        correct: 1,
      },
    ];
    return qs[Math.floor(Math.random() * qs.length)];
  }, []);
  const [picked, setPicked] = useState<number | null>(null);

  function pick(i: number) {
    setPicked(i);
    if (i === q.correct) { audio.success(); setTimeout(onSolve, 600); }
    else { audio.error(); setTimeout(onFail, 800); }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-slate-200 text-sm italic text-center px-4 leading-relaxed">"{q.text}"</p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {q.answers.map((a, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={picked !== null}
            className={`py-2 px-3 rounded-lg border-2 text-sm transition ${picked === i ? (i === q.correct ? 'border-emerald-400 bg-emerald-900/40' : 'border-red-400 bg-red-900/40') : 'border-slate-600 bg-slate-800 hover:border-amber-400'}`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

// 4) MEMORY — Simon-style sequence
function MemoryPuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const pads = useMemo(() => [
    { color: '#ef4444', id: 0 }, { color: '#3b82f6', id: 1 }, { color: '#22c55e', id: 2 }, { color: '#eab308', id: 3 },
  ], []);
  const [sequence] = useState(() => Array.from({ length: 4 }, () => Math.floor(Math.random() * 4)));
  const [phase, setPhase] = useState<'show' | 'input' | 'done'>('show');
  const [, setShowIdx] = useState(-1);
  const [inputIdx, setInputIdx] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== 'show') return;
    let i = 0;
    const step = () => {
      if (i >= sequence.length) { setPhase('input'); setShowIdx(-1); return; }
      setShowIdx(i);
      setFlashId(sequence[i]);
      audio.puzzleTick();
      setTimeout(() => { setFlashId(null); i++; setTimeout(step, 200); }, 500);
    };
    const t = setTimeout(step, 500);
    return () => clearTimeout(t);
  }, [phase, sequence]);

  function press(id: number) {
    if (phase !== 'input') return;
    setFlashId(id);
    audio.puzzleTick();
    setTimeout(() => setFlashId(null), 200);
    if (sequence[inputIdx] !== id) {
      audio.error();
      setPhase('done');
      setTimeout(onFail, 600);
      return;
    }
    if (inputIdx + 1 >= sequence.length) {
      setPhase('done');
      audio.success();
      setTimeout(onSolve, 500);
    } else setInputIdx(inputIdx + 1);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-slate-300 text-sm">{phase === 'show' ? 'Watch...' : phase === 'input' ? 'Repeat the pattern!' : '...'}</p>
      <div className="grid grid-cols-2 gap-3">
        {pads.map((p) => (
          <button
            key={p.id}
            onMouseDown={() => press(p.id)}
            onTouchStart={(e) => { e.preventDefault(); press(p.id); }}
            disabled={phase !== 'input'}
            className="w-24 h-24 rounded-xl border-2 transition-all active:scale-95"
            style={{
              background: flashId === p.id ? p.color : p.color + '33',
              borderColor: p.color,
              boxShadow: flashId === p.id ? `0 0 30px ${p.color}` : 'none',
              opacity: phase === 'input' ? 1 : 0.7,
              cursor: phase === 'input' ? 'pointer' : 'default',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// 5) TIMING — click/tap when indicator is in the green zone
function TimingPuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState(1);
  const [done, setDone] = useState(false);
  const attemptsRef = useRef(2);

  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setPos((p) => {
        let np = p + dir * 0.9 * dt;
        if (np > 1) { np = 1; setDir(-1); }
        if (np < 0) { np = 0; setDir(1); }
        return np;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dir]);

  function hit() {
    if (done) return;
    const inZone = pos > 0.45 && pos < 0.55;
    if (inZone) {
      setDone(true);
      audio.success();
      setTimeout(onSolve, 500);
    } else {
      attemptsRef.current--;
      audio.error();
      if (attemptsRef.current <= 0) { setDone(true); setTimeout(onFail, 500); }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-slate-300 text-sm">Tap when the glyph aligns with the green zone.</p>
      <div ref={barRef} className="relative w-full h-12 rounded-lg bg-slate-800 border border-slate-600 overflow-hidden">
        <div className="absolute top-0 bottom-0 left-[45%] w-[10%] bg-emerald-500/50 border-x-2 border-emerald-400" />
        <div
          className="absolute top-0 bottom-0 w-2 bg-amber-300"
          style={{ left: `${pos * 100}%`, transform: 'translateX(-50%)', boxShadow: '0 0 10px #fde047' }}
        />
      </div>
      <button
        onClick={hit}
        disabled={done}
        className="px-8 py-3 rounded-lg bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 active:scale-95"
      >
        STRIKE
      </button>
      <p className="text-xs text-slate-400">Attempts left: {attemptsRef.current}</p>
    </div>
  );
}

// 6) SLIDER — 3x3 sliding tile puzzle (click adjacent to blank)
function SliderPuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const size = 3;
  const [tiles, setTiles] = useState<number[]>(() => {
    // Start from a solved puzzle and make random moves so it's solvable
    const t: number[] = Array.from({ length: size * size }, (_, i) => i);
    let blank = size * size - 1;
    for (let i = 0; i < 40; i++) {
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
    const adj = (Math.abs(r - br) + Math.abs(c - bc)) === 1;
    if (!adj) return;
    const nt = [...tiles];
    [nt[blankIdx], nt[i]] = [nt[i], nt[blankIdx]];
    setTiles(nt);
    setMoves(moves + 1);
    audio.puzzleTick();
    if (nt.every((v, idx) => v === idx)) {
      audio.success();
      setTimeout(onSolve, 400);
    }
  }

  const symbols = ['🌲', '🏔️', '🌙', '🗡️', '🛡️', '👑', '🔮', '🗝️', ''];
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-slate-300 text-sm">Slide tiles to restore the atlas. Moves: {moves}</p>
      <div className="grid grid-cols-3 gap-1 bg-slate-800 p-2 rounded-lg">
        {tiles.map((v, i) => (
          <button
            key={i}
            onClick={() => click(i)}
            className={`w-16 h-16 rounded flex items-center justify-center text-2xl transition-all ${v === size * size - 1 ? 'bg-transparent' : 'bg-slate-700 hover:bg-slate-600 active:scale-95'}`}
          >
            {v === size * size - 1 ? '' : symbols[v]}
          </button>
        ))}
      </div>
      <button onClick={onFail} className="text-xs text-slate-500 hover:text-slate-300">Give up</button>
    </div>
  );
}

// 7) DIAL — rotate dial to target angle (click +/- or drag)
function DialPuzzle({ onSolve, onFail }: { onSolve: () => void; onFail: () => void }) {
  const target = useMemo(() => Math.floor(Math.random() * 12), []);
  const [angle, setAngle] = useState(Math.floor(Math.random() * 12));
  const [attempts, setAttempts] = useState(3);

  function turn(delta: number) {
    setAngle((a) => (a + delta + 12) % 12);
    audio.puzzleTick();
  }

  function confirm() {
    if (angle === target) {
      audio.success(); setTimeout(onSolve, 400);
    } else {
      audio.error();
      const n = attempts - 1;
      setAttempts(n);
      if (n <= 0) setTimeout(onFail, 500);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-slate-300 text-sm">Align the dial to the rune's position.</p>
      <div className="relative w-48 h-48 rounded-full bg-slate-800 border-4 border-amber-700 flex items-center justify-center">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return (
            <div
              key={i}
              className="absolute w-6 h-6 flex items-center justify-center text-xs"
              style={{
                left: `${50 + Math.cos(a) * 44}%`,
                top: `${50 + Math.sin(a) * 44}%`,
                transform: 'translate(-50%, -50%)',
                color: i === target ? '#fbbf24' : '#64748b',
                fontWeight: i === target ? 'bold' : 'normal',
              }}
            >
              {i === target ? '✦' : '·'}
            </div>
          );
        })}
        <div
          className="absolute w-2 h-20 bg-amber-400 rounded origin-bottom"
          style={{ transform: `rotate(${(angle / 12) * 360}deg) translateY(-40px)`, boxShadow: '0 0 12px #fbbf24' }}
        />
        <div className="w-6 h-6 rounded-full bg-amber-300 absolute" />
      </div>
      <div className="flex gap-2 items-center">
        <button onClick={() => turn(-1)} className="w-10 h-10 rounded bg-slate-700 hover:bg-slate-600 text-xl">◀</button>
        <button onClick={confirm} className="px-4 py-2 rounded bg-amber-500 text-slate-900 font-bold hover:bg-amber-400">UNLOCK</button>
        <button onClick={() => turn(1)} className="w-10 h-10 rounded bg-slate-700 hover:bg-slate-600 text-xl">▶</button>
      </div>
      <p className="text-xs text-slate-400">Attempts: {attempts}</p>
    </div>
  );
}

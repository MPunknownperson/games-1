/// <reference types="vite/client" />
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audio } from './engine/audio';
import { LogoMark } from './ui/Icons';
import { ITEMS, type ItemType } from './world/items';
import { QUESTS } from './world/story';
import { BUILDINGS, SandboxWorld, type HudView, type StructureKind, type WorldSave } from './world/simulation';
import { WorldRenderer } from './world/renderer';

const SAVE_KEY = 'preserve-everything-world-v2';
type Mode = 'title' | 'intro' | 'play';
type Tab = 'journal' | 'pack' | 'character' | 'map' | 'system';
const STRUCTURES: StructureKind[] = ['archer', 'ward', 'barricade', 'outpost'];

function readSave(): WorldSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WorldSave;
    return s.version === 2 && Array.isArray(s.actors) ? s : null;
  } catch { return null; }
}
function writeSave(world: SandboxWorld) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(world.snapshot())); } catch { /* storage unavailable */ }
}
const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export default function App() {
  const [world, setWorld] = useState(() => { const s = readSave(); return s ? new SandboxWorld(s.seed, s) : new SandboxWorld(4217); });
  const [hasSave, setHasSave] = useState(() => !!readSave());
  const [mode, setMode] = useState<Mode>('title');
  const [menu, setMenu] = useState<Tab | null>(null);
  const [hud, setHud] = useState<HudView>(() => world.hud());
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [locked, setLocked] = useState(false);
  const [touch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const modeRef = useRef(mode);
  const menuRef = useRef(menu);
  const dialogueRef = useRef(false);
  const fpsRef = useRef(60);
  modeRef.current = mode;
  menuRef.current = menu;
  dialogueRef.current = !!hud.dialogue;

  // ---------------------------------------------------------------- renderer & loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let r: WorldRenderer;
    try { r = new WorldRenderer(canvas, world); } catch { setError('This browser could not start WebGL, which the world needs to render.'); return; }
    rendererRef.current = r;
    if (import.meta.env.DEV) (window as unknown as { __world: SandboxWorld }).__world = world;
    if (modeRef.current === 'intro') r.startIntro(); else r.mode = modeRef.current;
    let raf = 0, last = performance.now(), hudTimer = 0, saveTimer = 0, lastHud = '', frames = 0, fpsTimer = 0;
    const tick = (now: number) => {
      const frameTime = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      const dt = Math.min(0.05, frameTime);
      const m = modeRef.current;
      if (m === 'play' && !menuRef.current) {
        const k = keys.current;
        const fwd = Number(k.has('w')) - Number(k.has('s')) - stick.current.y;
        const strafe = Number(k.has('d')) - Number(k.has('a')) + stick.current.x;
        const f = r.forward();
        world.input = { x: f.x * fwd - f.z * strafe, z: f.z * fwd + f.x * strafe, sprint: k.has('shift') };
        if (k.has('arrowleft')) r.orbit(-dt * 700, 0);
        if (k.has('arrowright')) r.orbit(dt * 700, 0);
        // Fixed-size sub-steps keep the world running at real speed even when frames are slow.
        for (let left = frameTime; left > 1e-4; left -= 0.05) world.update(Math.min(0.05, left));
        const preview = world.buildPreview();
        r.setGhost(world.placing, preview?.point ?? null, !!preview && preview.valid && preview.affordable);
        saveTimer += dt;
        if (saveTimer > 15) { saveTimer = 0; writeSave(world); }
      } else if (m !== 'play') {
        world.input = { x: 0, z: 0, sprint: false };
        for (let left = frameTime; left > 1e-4; left -= 0.05) world.update(Math.min(0.05, left));
      }
      r.render(m === 'play' && menuRef.current ? 0 : frameTime);
      if (m === 'intro' && r.mode === 'play') { modeRef.current = 'play'; setMode('play'); world.say('The road home. Mara will be waiting in the square.', undefined, 5); }
      frames++; fpsTimer += frameTime;
      if (fpsTimer > 1) { fpsRef.current = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0; }
      hudTimer += frameTime;
      if (hudTimer > 0.1 && m === 'play') {
        hudTimer = 0;
        const h = world.hud();
        const key = JSON.stringify(h);
        if (key !== lastHud) {
          if (h.dialogue && !dialogueRef.current) document.exitPointerLock?.();
          lastHud = key;
          setHud(h);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const leave = () => { if (modeRef.current === 'play') writeSave(world); };
    window.addEventListener('pagehide', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pagehide', leave);
      r.dispose();
      rendererRef.current = null;
    };
  }, [world]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (mode === 'intro') r.startIntro();
    else if (mode === 'play' && r.mode === 'title') { r.mode = 'play'; r.yaw = world.player.facing + Math.PI; }
    else if (mode === 'title') r.mode = 'title';
  }, [mode, world]);

  // ---------------------------------------------------------------- input
  useEffect(() => {
    const canvas = canvasRef.current;
    const onLock = () => {
      const isLocked = document.pointerLockElement === canvas;
      setLocked(isLocked);
      if (!isLocked && modeRef.current === 'play' && !menuRef.current && !dialogueRef.current) setMenu('system');
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) rendererRef.current?.orbit(e.movementX, e.movementY);
      else if (e.buttons & 2 && modeRef.current === 'play') rendererRef.current?.orbit(e.movementX, e.movementY);
    };
    document.addEventListener('pointerlockchange', onLock);
    document.addEventListener('mousemove', onMove);
    return () => { document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('mousemove', onMove); };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'tab' || key === ' ' || key.startsWith('arrow')) e.preventDefault();
      if (mode === 'intro') { rendererRef.current?.skipIntro(); return; }
      if (mode !== 'play') return;
      if (menu) { if (key === 'escape' || key === 'tab') setMenu(null); return; }
      const dialogue = world.dialogue;
      if (dialogue) {
        const n = Number(key);
        const view = world.dialogueView();
        if (n >= 1 && view && n <= view.options.length) { world.choose(view.options[n - 1].id); audio.tick(); }
        if (key === 'escape') world.closeDialogue();
        setHud(world.hud());
        return;
      }
      keys.current.add(key);
      if (e.repeat) return;
      if (world.placing) {
        const n = Number(key);
        if (n >= 1 && n <= STRUCTURES.length) { world.placing = STRUCTURES[n - 1]; return; }
        if (key === 'escape' || key === 'b') { world.placing = null; rendererRef.current?.setGhost(null, null, false); return; }
      }
      switch (key) {
        case 'escape': setMenu('system'); document.exitPointerLock?.(); break;
        case 'v': world.toggleSneak(); break;
        case '1': world.castSpell('mending'); break;
        case '2': world.castSpell('bolt'); break;
        case 'tab': setMenu('journal'); document.exitPointerLock?.(); break;
        case 'e': if (world.interact()) { document.exitPointerLock?.(); audio.uiOpen(); } else audio.tick(); break;
        case 'f': world.secondary(); break;
        case 'g': world.throwHeld(); break;
        case ' ': world.jump(); break;
        case 'c': world.dodge(); break;
        case 'j': world.attack(); break;
        case 'b': world.placing = world.placing ? null : 'archer'; if (!world.placing) rendererRef.current?.setGhost(null, null, false); break;
      }
      setHud(world.hud());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [mode, menu, world]);

  const onCanvasDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === 'intro') { rendererRef.current?.skipIntro(); return; }
    if (mode !== 'play' || menu || world.dialogue || touch) return;
    const canvas = canvasRef.current!;
    if (document.pointerLockElement !== canvas) { if (e.button === 0) canvas.requestPointerLock?.(); return; }
    if (e.button === 0) { world.attack(); audio.click(); }
    if (e.button === 2) world.dodge();
  };

  // ---------------------------------------------------------------- flow
  async function beginNew() {
    await audio.unlock().catch(() => {});
    audio.setMuted(muted, muted);
    audio.startBgm('meadow');
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    const w = new SandboxWorld(Math.floor(Math.random() * 1e6) + 1);
    modeRef.current = 'intro';
    setMode('intro');
    setHud(w.hud());
    setWorld(w);
  }
  async function resume() {
    await audio.unlock().catch(() => {});
    audio.setMuted(muted, muted);
    audio.startBgm('meadow');
    setHud(world.hud());
    setMode('play');
  }
  function toTitle() {
    writeSave(world);
    setHasSave(true);
    setMenu(null);
    world.placing = null;
    rendererRef.current?.setGhost(null, null, false);
    document.exitPointerLock?.();
    audio.stopBgm();
    setMode('title');
  }
  function toggleSound() { setMuted((m) => { audio.setMuted(!m, !m); return !m; }); }
  const refresh = () => setHud(world.hud());

  return (
    <main className={`shell mode-${mode}`} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="view" onMouseDown={onCanvasDown}
        onWheel={(e) => { if (mode === 'play') rendererRef.current?.zoom(e.deltaY * 0.006); }} />
      {error && <div className="fatal"><h2>The world could not be drawn</h2><p>{error}</p></div>}

      {mode === 'title' && !error && (
        <section className="title">
          <div className="title-veil" />
          <div className="title-block">
            <LogoMark size={58} />
            <h1>Preserve<br />Everything</h1>
            <p className="title-place">The First Meadow</p>
            <nav className="title-menu">
              {hasSave && <button onClick={resume}>Continue</button>}
              <button onClick={beginNew}>{hasSave ? 'Begin anew' : 'Begin'}</button>
              <button onClick={() => setShowControls(true)}>Controls</button>
              <button onClick={toggleSound}>Sound {muted ? 'off' : 'on'}</button>
            </nav>
          </div>
          <p className="title-foot">The valley is live behind this screen. Everything in it keeps going without you.</p>
          {showControls && <Sheet title="Controls" onClose={() => setShowControls(false)}><ControlsList /></Sheet>}
        </section>
      )}

      {mode === 'intro' && (
        <section className="intro">
          <p className="intro-line one">Three winters the light has held.</p>
          <p className="intro-line two">This spring, the wilds began to build.</p>
          <span className="intro-skip">any key to skip</span>
        </section>
      )}

      {mode === 'play' && !error && (
        <>
          {!hud.dialogue && !menu && <Compass world={world} rendererRef={rendererRef} />}
          {hud.waveActive && !hud.dialogue && <p className="wave">The wilds are coming &middot; {hud.waveEnemies}</p>}
          {hud.target && !hud.dialogue && (
            <div className="target"><span>{hud.target.name}</span><i><b style={{ width: `${(hud.target.hp / hud.target.maxHp) * 100}%` }} /></i></div>
          )}
          {hud.notice && !hud.dialogue && <p className="notice">{hud.notice}</p>}
          <Vitals hud={hud} />
          {hud.subtitle && !hud.dialogue && (
            <p className="subtitle">{hud.subtitle.speaker && <span>{hud.subtitle.speaker}</span>}{hud.subtitle.text}</p>
          )}
          {hud.prompt && !hud.dialogue && !menu && (
            <p className="prompt">
              <span><kbd>E</kbd><em className={hud.prompt.crime ? 'crime' : ''}>{hud.prompt.primary}</em></span>
              {hud.prompt.secondary && <span><kbd>{hud.holding ? 'G' : 'F'}</kbd><em>{hud.prompt.secondary}</em></span>}
              <strong>{hud.prompt.name}</strong>
            </p>
          )}
          {hud.placing && <Plans world={world} kind={hud.placing} />}
          {hud.dialogue && <Dialogue world={world} onChange={refresh} />}
          {!locked && !touch && !hud.dialogue && !menu && !hud.defeated && <p className="hint-click">Click to take control</p>}
          {touch && !menu && !hud.dialogue && <TouchControls world={world} stick={stick} rendererRef={rendererRef} onChange={refresh} />}
          {hud.defeated && !menu && (
            <div className="fallen">
              <p>You have fallen.</p>
              <button onClick={() => { world.recover(); refresh(); }}>Wake</button>
            </div>
          )}
          {menu && (
            <Menu tab={menu} setTab={setMenu} world={world} onChange={refresh} muted={muted} onToggleSound={toggleSound} onQuit={toTitle}
              onSave={() => { writeSave(world); setHasSave(true); }} fps={fpsRef} rendererRef={rendererRef} />
          )}
        </>
      )}
    </main>
  );
}

// ------------------------------------------------------------------ HUD pieces
function Compass({ world, rendererRef }: { world: SandboxWorld; rendererRef: React.RefObject<WorldRenderer | null> }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, n = 0;
    let marker = world.questTarget();
    const marks = [
      { a: Math.PI, el: 'n' }, { a: Math.PI / 2, el: 'e' }, { a: 0, el: 's' }, { a: -Math.PI / 2, el: 'w' },
      ...Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * Math.PI * 2 + Math.PI / 16, el: `t${i}` })),
    ];
    const loop = () => {
      const r = rendererRef.current, root = strip.current;
      if (r && root) {
        const heading = r.heading();
        const w = root.clientWidth / 2;
        const place = (el: HTMLElement | null, angle: number) => {
          if (!el) return;
          const rel = angleDelta(heading, angle);
          const vis = Math.abs(rel) < Math.PI / 2;
          el.style.opacity = vis ? String(1 - Math.abs(rel) / (Math.PI / 2)) : '0';
          el.style.transform = `translateX(${(rel / (Math.PI / 2)) * w}px)`;
        };
        for (const m of marks) place(root.querySelector<HTMLElement>(`[data-k="${m.el}"]`), m.a);
        if (++n % 15 === 0) marker = world.questTarget();
        const p = world.player;
        const q = root.querySelector<HTMLElement>('[data-k="quest"]');
        if (marker) place(q, Math.atan2(marker.x - p.x, marker.z - p.z)); else if (q) q.style.opacity = '0';
        place(root.querySelector<HTMLElement>('[data-k="home"]'), Math.atan2(world.citadel.x - p.x, world.citadel.z - p.z));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world, rendererRef]);
  return (
    <div className="compass" ref={strip} aria-hidden>
      {['n', 'e', 's', 'w'].map((k) => <span key={k} data-k={k} className="cardinal">{k.toUpperCase()}</span>)}
      {Array.from({ length: 16 }, (_, i) => <span key={i} data-k={`t${i}`} className="tick" />)}
      <span data-k="home" className="mark-home" />
      <span data-k="quest" className="mark-quest" />
    </div>
  );
}

function Vitals({ hud }: { hud: HudView }) {
  const show = hud.combat || hud.hp < hud.maxHp || hud.stamina < hud.maxStamina || hud.bounty > 0 || hud.spellsKnown > 0;
  return (
    <div className={`vitals ${show ? 'on' : ''}`}>
      {hud.bounty > 0 && <p className="bounty">Wanted &middot; {hud.bounty} crowns</p>}
      {hud.sneaking && <p className="bounty">Crouching</p>}
      <i className="bar hp"><b style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }} /></i>
      <i className={`bar st ${hud.stamina < hud.maxStamina ? '' : 'full'}`}><b style={{ width: `${(hud.stamina / hud.maxStamina) * 100}%` }} /></i>
      {hud.spellsKnown > 0 && <i className="bar fc"><b style={{ width: `${(hud.focus / Math.max(1, hud.maxFocus)) * 100}%` }} /></i>}
    </div>
  );
}

function Plans({ world, kind }: { world: SandboxWorld; kind: StructureKind }) {
  const b = BUILDINGS[kind];
  return (
    <div className="plans">
      <p className="plans-name">{b.name}<span>{b.description}</span></p>
      <p className="plans-cost">{b.wood} timber, {b.stone} stone, {b.gold} crowns &nbsp;&middot;&nbsp; you carry {world.stock.wood}, {world.stock.stone}, {world.stock.gold}</p>
      <p className="plans-keys">{STRUCTURES.map((s, i) => <span key={s} className={s === kind ? 'on' : ''}>{i + 1} {BUILDINGS[s].name}</span>)}<span>E build</span><span>B put away</span></p>
    </div>
  );
}

function Dialogue({ world, onChange }: { world: SandboxWorld; onChange: () => void }) {
  const view = world.dialogueView();
  const [message, setMessage] = useState('');
  if (!view) return null;
  if (view.shop) {
    const buy = world.shopList(), sell = world.sellList();
    return (
      <section className="dialogue shop">
        <p className="speaker">{view.speaker}</p>
        <div className="shop-cols">
          <div><h3>Buy</h3>{buy.map((e) => <button key={e.id} onClick={() => { setMessage(world.buy(e.id)); onChange(); }}><span>{e.name}<small>{e.detail}</small></span><b>{e.price}</b></button>)}</div>
          <div><h3>Sell</h3>{sell.length ? sell.map((e) => <button key={e.id} onClick={() => { setMessage(world.sell(e.id)); onChange(); }}><span>{e.name}<small>you have {e.count}</small></span><b>{e.price}</b></button>) : <p className="empty">Nothing he wants.</p>}</div>
        </div>
        <p className="shop-foot"><span>{message || `${world.stock.gold} crowns in your purse`}</span><button onClick={() => { world.choose('work'); world.dialogue!.shop = false; setMessage(''); onChange(); }}>Done trading</button></p>
      </section>
    );
  }
  return (
    <section className="dialogue">
      <p className="speaker">{view.speaker}</p>
      <p className="line">{view.line}</p>
      <ol>{view.options.map((o, i) => <li key={o.id}><button onClick={() => { world.choose(o.id); audio.tick(); onChange(); }}><span>{i + 1}</span>{o.text}</button></li>)}</ol>
    </section>
  );
}

function TouchControls({ world, stick, rendererRef, onChange }: { world: SandboxWorld; stick: React.MutableRefObject<{ x: number; y: number }>; rendererRef: React.RefObject<WorldRenderer | null>; onChange: () => void }) {
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const look = useRef<{ x: number; y: number; id: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  return (
    <div className="touch"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.clientX < window.innerWidth * 0.45 && !origin.current) origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        else if (!look.current) look.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        if (origin.current?.id === e.pointerId) {
          const dx = Math.max(-50, Math.min(50, e.clientX - origin.current.x)), dy = Math.max(-50, Math.min(50, e.clientY - origin.current.y));
          stick.current = { x: dx / 50, y: dy / 50 };
          setKnob({ x: dx, y: dy });
        } else if (look.current?.id === e.pointerId) {
          rendererRef.current?.orbit((e.clientX - look.current.x) * 1.6, (e.clientY - look.current.y) * 1.2);
          look.current = { ...look.current, x: e.clientX, y: e.clientY };
        }
      }}
      onPointerUp={(e) => {
        if (origin.current?.id === e.pointerId) { origin.current = null; stick.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 }); }
        if (look.current?.id === e.pointerId) look.current = null;
      }}>
      <div className="stick"><i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div>
      <div className="touch-buttons">
        <button onClick={() => { world.attack(); onChange(); }}>Strike</button>
        <button onClick={() => { world.interact(); onChange(); }}>Use</button>
        <button onClick={() => { world.secondary(); onChange(); }}>Lift</button>
        <button onClick={() => { world.jump(); onChange(); }}>Jump</button>
        <button onClick={() => { world.dodge(); onChange(); }}>Roll</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ menu
function Menu(props: {
  tab: Tab; setTab: (t: Tab | null) => void; world: SandboxWorld; onChange: () => void; muted: boolean; onToggleSound: () => void;
  onQuit: () => void; onSave: () => void; fps: React.MutableRefObject<number>; rendererRef: React.RefObject<WorldRenderer | null>;
}) {
  const { tab, setTab, world } = props;
  const tabs: [Tab, string][] = [['journal', 'Journal'], ['pack', 'Pack'], ['character', 'Character'], ['map', 'Map'], ['system', 'Paused']];
  return (
    <div className="menu">
      <header>
        <LogoMark size={30} />
        <nav>{tabs.map(([t, label]) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>)}</nav>
        <span className="menu-time">Day {world.hud().day}, {world.hud().time}</span>
        <button className="menu-close" onClick={() => setTab(null)}>Return</button>
      </header>
      <div className="menu-body">
        {tab === 'journal' && <Journal world={world} onChange={props.onChange} />}
        {tab === 'pack' && <Pack world={world} onChange={props.onChange} />}
        {tab === 'character' && <Character world={world} />}
        {tab === 'map' && <WorldMap world={world} />}
        {tab === 'system' && <SystemPage {...props} />}
      </div>
    </div>
  );
}

function Journal({ world, onChange }: { world: SandboxWorld; onChange: () => void }) {
  const ids = Object.keys(world.quests);
  const active = ids.filter((id) => world.quests[id].status === 'active');
  const done = ids.filter((id) => world.quests[id].status === 'done');
  const [sel, setSel] = useState(world.tracked);
  const q = world.quests[sel];
  return (
    <div className="journal">
      <aside>
        <h4>Underway</h4>
        {active.map((id) => <button key={id} className={id === sel ? 'on' : ''} onClick={() => setSel(id)}>{QUESTS[id].title}{world.tracked === id && <small>followed</small>}</button>)}
        {done.length > 0 && <h4>Finished</h4>}
        {done.map((id) => <button key={id} className={`done ${id === sel ? 'on' : ''}`} onClick={() => setSel(id)}>{QUESTS[id].title}</button>)}
      </aside>
      {q && (
        <article>
          <h2>{QUESTS[sel].title}</h2>
          <p className="entry">{world.journalText(sel)}</p>
          {q.log.length > 1 && <div className="earlier">{q.log.slice(0, -1).reverse().map((t, i) => <p key={i}>{t}</p>)}</div>}
          {q.status === 'active' && world.tracked !== sel && <button className="text-btn" onClick={() => { world.tracked = sel; onChange(); }}>Follow this on the compass</button>}
        </article>
      )}
    </div>
  );
}

const SKILL_LABELS: [string, string][] = [['blade', 'Blade'], ['guard', 'Guard'], ['stealth', 'Stealth'], ['lockpick', 'Lockpicking'], ['speech', 'Speech'], ['magic', 'Magic']];

function Character({ world }: { world: SandboxWorld }) {
  const p = world.player;
  const spells = (p.spells ?? []).map((id) => (id === 'bolt' ? 'Spark bolt (2)' : 'Mending (1)'));
  return (
    <div className="pack">
      <p className="purse">The Guardian &middot; level {world.level}</p>
      <p className="weapon">{world.weaponLevel > 1 ? 'Iron blade' : "Guardian's sword"}{(p.armor ?? 0) > 0 ? ", warden's coat" : ''} &middot; focus {Math.floor(p.focus ?? 0)} of {p.maxFocus ?? 0}</p>
      <div className="char-grid">
        <section>
          <h4>Attributes</h4>
          <dl className="controls">
            <div><dt>Might</dt><dd>{p.attrs?.might}</dd></div>
            <div><dt>Agility</dt><dd>{p.attrs?.agility}</dd></div>
            <div><dt>Will</dt><dd>{p.attrs?.will}</dd></div>
          </dl>
        </section>
        <section>
          <h4>Skills</h4>
          {SKILL_LABELS.map(([key, label]) => {
            const value = Math.floor(p.skills?.[key as keyof typeof p.skills] ?? 0);
            return <div className="skill" key={key}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><em>{value}</em></div>;
          })}
        </section>
        <section>
          <h4>Spells</h4>
          {spells.length ? spells.map((sp) => <p className="spell" key={sp}>{sp}</p>) : <p className="spell none">None learned. Old books still teach.</p>}
        </section>
      </div>
    </div>
  );
}

function Pack({ world, onChange }: { world: SandboxWorld; onChange: () => void }) {
  const [reading, setReading] = useState('');
  const entries = (Object.entries(world.pack) as [ItemType, number][]).filter(([, n]) => n > 0);
  return (
    <div className="pack">
      <p className="purse">{world.stock.gold} crowns &nbsp;&middot;&nbsp; {world.stock.wood} timber &nbsp;&middot;&nbsp; {world.stock.stone} stone{world.stock.essence > 0 && <> &nbsp;&middot;&nbsp; {world.stock.essence} essence</>}</p>
      <p className="weapon">{world.weaponLevel > 1 ? 'Iron blade' : "Guardian's sword"}, worn at the hip.</p>
      <ul>
        {entries.length === 0 && <li className="empty">Your pack is empty.</li>}
        {entries.map(([type, n]) => {
          const def = ITEMS[type];
          return (
            <li key={type}>
              <div><strong>{def.name}{n > 1 && <span> &times;{n}</span>}</strong><small>{def.desc}</small></div>
              {(def.heal || def.read) && <button onClick={() => { setReading(world.usePack(type)); onChange(); }}>{def.read ? 'Read' : 'Eat'}</button>}
              <button onClick={() => { world.dropFromPack(type); onChange(); }}>Drop</button>
            </li>
          );
        })}
      </ul>
      {reading && <blockquote>{reading}</blockquote>}
    </div>
  );
}

function WorldMap({ world }: { world: SandboxWorld }) {
  const s = (n: number) => ((n + 90) / 180) * 600;
  const p = world.player;
  const q = world.questTarget();
  const places: [string, number, number][] = [['The Citadel', 0, -8], ['Storehouse', -31, 8], ['Old mill', -44, 36], ['Watch post', 3, 28], ['Echo stones', 27, -19], ['Standing stones', -11, 7]];
  for (const c of world.actors.filter((a) => a.kind === 'camp' && a.alive)) places.push([c.faction === 'wild' ? c.name : 'Field camp', c.x, c.z]);
  return (
    <svg className="map" viewBox="0 0 600 600" role="img" aria-label="Map of the First Meadow">
      <rect width="600" height="600" fill="#cfc4a6" />
      <g fill="#b7ad8d" opacity="0.6">
        <ellipse cx="120" cy="140" rx="110" ry="70" /><ellipse cx="480" cy="460" rx="120" ry="80" /><ellipse cx="470" cy="120" rx="90" ry="60" /><ellipse cx="110" cy="470" rx="80" ry="90" />
      </g>
      <g stroke="#9a8a68" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d={`M${s(1)} ${s(6)} L${s(2)} ${s(70)}`} /><path d={`M${s(-6)} ${s(5)} L${s(-27)} ${s(8)} L${s(-42)} ${s(33)}`} /><path d={`M${s(9)} ${s(-2)} L${s(24)} ${s(-17)}`} />
      </g>
      <circle cx={s(0)} cy={s(-2)} r="42" fill="#bdb193" stroke="#8d8063" strokeWidth="1.5" />
      {places.map(([name, x, z]) => (
        <g key={name + x}><circle cx={s(x)} cy={s(z)} r="4" fill="#4a3f2e" /><text x={s(x) + 8} y={s(z) + 4}>{name}</text></g>
      ))}
      {q && <rect x={s(q.x) - 5} y={s(q.z) - 5} width="10" height="10" fill="#8d3f2c" transform={`rotate(45 ${s(q.x)} ${s(q.z)})`} />}
      <g transform={`translate(${s(p.x)} ${s(p.z)}) rotate(${(-p.facing * 180) / Math.PI + 180})`}><path d="M0 -9 L6 7 L0 3 L-6 7 Z" fill="#1f2a26" /></g>
      <text x="572" y="34" className="north">N</text>
    </svg>
  );
}

function SystemPage({ world, onQuit, onSave, muted, onToggleSound, setTab, fps, rendererRef, onChange }: Parameters<typeof Menu>[0]) {
  const [lines, setLines] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  return (
    <div className="system">
      <div className="system-actions">
        <button onClick={() => setTab(null)}>Resume</button>
        <button onClick={() => { onSave(); setSaved(true); }}>{saved ? 'Saved' : 'Save'}</button>
        <button onClick={onToggleSound}>Sound {muted ? 'off' : 'on'}</button>
        <button onClick={onQuit}>Save and leave to title</button>
      </div>
      <div className="system-cols">
        <section><h4>Controls</h4><ControlsList /></section>
        <section>
          <h4>Engine</h4>
          <p className="stats">{(() => { const s = world.stats(); const r = rendererRef.current?.info(); return `${fps.current} fps · ${r?.calls ?? 0} draw calls · ${s.actors} actors · ${s.items} objects (${s.awake} moving) · ${s.colliders} colliders`; })()}</p>
          <div className="dev">
            <button onClick={() => { const issues = world.verify(); setLines(issues.length ? issues.map((i) => `${i.rule}: ${i.detail}`) : ['All world invariants hold.']); }}>Verify world</button>
            <button onClick={() => { const r = world.autoRepair(); setLines(r.fixes.length || r.remaining.length ? [...r.fixes, ...r.remaining.map((i) => `Needs attention: ${i.detail}`)] : ['Nothing to repair.']); onChange(); }}>Auto-repair</button>
            <button onClick={() => { world.stock.wood += 10; world.stock.stone += 10; world.stock.gold += 100; onChange(); setLines(['Added 10 timber, 10 stone and 100 crowns.']); }}>Grant supplies</button>
          </div>
          {lines.length > 0 && <pre>{lines.join('\n')}</pre>}
        </section>
      </div>
    </div>
  );
}

function ControlsList() {
  const rows: [string, string][] = [
    ['W A S D', 'Move'], ['Mouse', 'Look (click the world to take control)'], ['Shift', 'Run'], ['Space', 'Jump'], ['Left click', 'Strike, or throw what you hold'],
    ['Right click / C', 'Roll'], ['E', 'Talk, take, use, sit'], ['F', 'Lift or set down; look closer'], ['G', 'Throw'], ['V', 'Crouch and move quietly'], ['1 / 2', 'Cast Mending / Spark bolt, once learned'], ['B', 'Building plans'], ['Tab', 'Journal'], ['Esc', 'Pause'],
  ];
  return <dl className="controls">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label={title}><h2>{title}</h2>{children}<button className="text-btn" onClick={onClose}>Close</button></div>
    </div>
  );
}

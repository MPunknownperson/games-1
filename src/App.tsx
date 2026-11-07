// PRESERVE EVERYTHING — Main Application & Tactical Game HUD.
/// <reference types="vite/client" />
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from './engine/audio';
import { sdk } from './engine/sdk';
import { loadSave, writeSave, type SaveData } from './engine/storage';
import {
  Game,
  createDioramaGame,
  generateStage,
  pickWorld,
  makeCamera,
  fitCamera,
  renderWorld,
  type Card,
  type Chest,
  type Tower,
  type TargetingMode,
} from './engine/game';
import { TOWERS, THEMES, type TowerKind, type ThemeKind } from './engine/blocks';
import { GlyphText } from './ui/GlyphText';
import { FONT_BODY } from './ui/typeface/fontLibrary';
import { Btn, Panel, Overlay, TOKENS } from './ui/Blocks';
import { UiThemeProvider, uiPaletteFor, useUiTheme, HOME_PALETTE } from './ui/theme';
import {
  CoinIcon,
  KeyIcon,
  ChestIcon,
  CardIcon,
  PlayIcon,
  PauseIcon,
  CloseIcon,
  CrownIcon,
  StarIcon,
  SkullIcon,
  GearIcon,
  TowerIconArcher,
  TowerIconMortar,
  TowerIconChill,
  TowerIconPrism,
  TowerIconStorm,
} from './ui/Icons';
import { PuzzleModal } from './ui/Puzzles';
import { DevTools, DEV_ENEMY_KINDS, type TestResult } from './engine/devtools';

type Screen =
  | 'title'
  | 'playing'
  | 'paused'
  | 'victory'
  | 'defeat'
  | 'puzzle'
  | 'chest'
  | 'ad-count'
  | 'ad-play'
  | 'howto'
  | 'legal'
  | 'settings'
  | 'scores';

const TOWER_ICONS: Record<TowerKind, (p: { size?: number }) => any> = {
  archer: TowerIconArcher,
  mortar: TowerIconMortar,
  chill: TowerIconChill,
  prism: TowerIconPrism,
  storm: TowerIconStorm,
};

const RARITY_COLOR: Record<string, string> = {
  common: '#94a3b8',
  rare: '#38bdf8',
  epic: '#a78bfa',
  legendary: '#fbbf24',
};

const TARGET_LABELS: Record<TargetingMode, string> = {
  first: 'First in Path',
  strongest: 'Highest HP',
  last: 'Rearguard',
};

export default function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [screen, setScreen] = useState<Screen>('title');
  const [legalTab, setLegalTab] = useState<'copyright' | 'terms' | 'privacy'>('copyright');
  const [gold, setGold] = useState(0);
  const [hp, setHp] = useState({ hp: 0, max: 1 });
  const [waveInfo, setWaveInfo] = useState({ cur: 0, total: 0 });
  const [selectedKind, setSelectedKind] = useState<TowerKind | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [speedMult, setSpeedMult] = useState(1);
  const [stageLabel, setStageLabel] = useState({ round: 1, minor: 1, theme: '' });
  const [themeKind, setThemeKind] = useState<ThemeKind | null>(null);
  const [puzzleCard, setPuzzleCard] = useState<Card | null>(null);
  const [chest, setChest] = useState<Chest | null>(null);
  const [chestReward, setChestReward] = useState<string | null>(null);
  const [adCount, setAdCount] = useState(3);
  const [session, setSession] = useState({ kills: 0, gold: 0, chests: 0, cards: 0, mvp: '' });
  const [reviveUsed, setReviveUsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [invTick, setInvTick] = useState(0);
  const [screenSize, setScreenSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [live, setLive] = useState({ foes: 0, streak: 0 });

  // Development tools (dev build only)
  const [devOpen, setDevOpen] = useState(false);
  const [devTick, setDevTick] = useState(0);
  const [devTests, setDevTests] = useState<TestResult[] | null>(null);
  const devRef = useRef<DevTools | null>(null);
  const bumpDev = useCallback(() => setDevTick((x) => x + 1), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const dioramaRef = useRef<Game | null>(null);
  const cameraRef = useRef(makeCamera(1280, 720));
  const rafRef = useRef(0);
  const shakeRef = useRef({ amt: 0, life: 0 });
  const audioStartedRef = useRef(false);
  const nextStageRef = useRef<{ round: number; minor: number; gold: number; inv: { chests: Chest[]; cards: Card[]; keys: number } } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { writeSave(save); }, [save]);
  useEffect(() => { sdk.init().catch(() => {}); }, []);
  useEffect(() => { audio.setMuted(save.muteSfx, save.muteBgm); audio.setMasterVol(save.masterVolume); }, [save.muteSfx, save.muteBgm, save.masterVolume]);

  const showToast = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const ensureAudio = useCallback(async () => {
    if (audioStartedRef.current) return;
    await audio.unlock();
    audioStartedRef.current = true;
  }, []);

  const startRun = useCallback(async (opts: { fresh?: boolean; round?: number; minor?: number; carryGold?: number; carryInv?: { chests: Chest[]; cards: Card[]; keys: number } } = {}) => {
    await ensureAudio();
    const seed = Math.floor(Math.random() * 1e9);
    let round = 1, minor = 1;
    let inv = { chests: [] as Chest[], cards: [] as Card[], keys: 0 };
    let carryGold: number | undefined;
    if (opts.round !== undefined) round = opts.round;
    if (opts.minor !== undefined) minor = opts.minor;
    if (opts.carryInv) inv = opts.carryInv;
    if (opts.carryGold !== undefined) carryGold = opts.carryGold;
    if (opts.fresh) {
      round = 1; minor = 1; inv = { chests: [], cards: [], keys: 0 }; carryGold = undefined;
      setSave((s) => ({ ...s, currentRun: undefined }));
    } else if (opts.round === undefined && save.currentRun) {
      round = save.currentRun.round; minor = save.currentRun.minor; inv = save.currentRun.inventory;
    }
    const stage = generateStage(round, minor, seed);
    const game = new Game({
      onGoldChange: setGold,
      onHpChange: (h, max) => setHp({ hp: h, max }),
      onWaveChange: (c, t) => setWaveInfo({ cur: c, total: t }),
      onLoot: (t) => {
        if (t === 'chest') showToast('Treasure Chest Dropped');
        if (t === 'card') showToast('Puzzle Card Dropped');
        setInvTick((x) => x + 1);
      },
      onStateChange: (s) => {
        if (s === 'victory') handleVictory();
        else if (s === 'defeat') handleDefeat();
      },
      onShake: (a) => { shakeRef.current = { amt: a, life: 0.5 }; audio.boom(); },
    });
    game.load(stage, inv, carryGold);
    gameRef.current = game;
    if (import.meta.env.DEV) devRef.current = new DevTools(game);
    setSelectedKind(null);
    setSelectedId(null);
    setSpeedMult(1);
    game.speedMult = 1;
    setStageLabel({ round: stage.round, minor: stage.minor, theme: THEMES[stage.theme].name });
    setThemeKind(stage.theme);
    setReviveUsed(false);
    setInvTick((x) => x + 1);
    setScreen('playing');
    sdk.gameplayStart();
    sdk.loadingEnd();
    audio.startBgm(stage.theme);
    audio.setTension(0);
  }, [ensureAudio, save.currentRun, showToast]);

  const handleVictory = useCallback(() => {
    const g = gameRef.current; if (!g) return;
    sdk.gameplayStop(); audio.stopBgm(); audio.victory();
    let mvp = 'None';
    if (g.mvpId) {
      const m = g.towers.find((t) => t.id === g.mvpId);
      if (m) mvp = `${TOWERS[m.kind].name} (Lv ${m.level})`;
    }
    setSession({ kills: g.kills, gold: g.goldEarned, chests: g.chestsFound, cards: g.cardsFound, mvp });
    const isMajor = g.stage.minor === 6;
    const nextMinor = isMajor ? 1 : g.stage.minor + 1;
    const nextRound = isMajor ? g.stage.round + 1 : g.stage.round;
    setSave((s) => ({
      ...s,
      bestRound: Math.max(s.bestRound, nextRound),
      totalGold: s.totalGold + g.goldEarned,
      totalKills: s.totalKills + g.kills,
      bestScore: Math.max(s.bestScore, g.kills * 10 + g.goldEarned),
      currentRun: {
        round: nextRound, minor: nextMinor, gold: g.gold, inventory: g.inventory, seed: s.currentRun?.seed ?? Math.floor(Math.random() * 1e9),
      },
      highScores: [{ name: 'Defender', score: g.kills * 10 + g.goldEarned, round: nextRound, when: Date.now() }, ...s.highScores].sort((a, b) => b.score - a.score).slice(0, 10),
    }));
    setScreen('victory');
  }, []);

  const handleDefeat = useCallback(() => {
    const g = gameRef.current; if (!g) return;
    sdk.gameplayStop(); audio.stopBgm(); audio.defeat();
    setSession({ kills: g.kills, gold: Math.floor(g.gold * 0.5), chests: g.chestsFound, cards: g.cardsFound, mvp: '' });
    setScreen('defeat');
  }, []);

  const triggerInterstitial = useCallback(async () => {
    setScreen('ad-count');
    for (let i = 3; i > 0; i--) {
      setAdCount(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    audio.stopBgm(); audio.setMuted(audio.mutedSfx, true);
    setScreen('ad-play');
    try { await sdk.showInterstitialAd(); } catch {}
    audio.setMuted(audio.mutedSfx, audio.mutedBgm);
    const n = nextStageRef.current;
    if (n) startRun({ round: n.round, minor: n.minor, carryGold: n.gold, carryInv: n.inv });
    else startRun({});
  }, [startRun]);

  const goToNext = useCallback(() => {
    const g = gameRef.current; if (!g) return;
    const isMajor = g.stage.minor === 6;
    const nextMinor = isMajor ? 1 : g.stage.minor + 1;
    const nextRound = isMajor ? g.stage.round + 1 : g.stage.round;
    nextStageRef.current = { round: nextRound, minor: nextMinor, gold: g.gold, inv: g.inventory };
    if (isMajor) triggerInterstitial();
    else startRun({ round: nextRound, minor: nextMinor, carryGold: g.gold, carryInv: g.inventory });
  }, [startRun, triggerInterstitial]);

  const restart = useCallback(() => {
    setSave((s) => ({ ...s, currentRun: undefined }));
    startRun({ fresh: true });
  }, [startRun]);

  const doRevive = useCallback(async () => {
    if (reviveUsed) return;
    audio.setMuted(audio.mutedSfx, true);
    const r = await sdk.showRewardedAd();
    audio.setMuted(audio.mutedSfx, audio.mutedBgm);
    if (r.rewarded) {
      const g = gameRef.current;
      if (g) {
        g.hp = Math.floor(g.maxHp * 0.3);
        setHp({ hp: g.hp, max: g.maxHp });
        setReviveUsed(true); g.paused = false;
        setScreen('playing');
        audio.startBgm(g.stage.theme);
        sdk.gameplayStart();
        showToast('Citadel Revived at 30% HP');
      }
    } else showToast('Ad Not Completed');
  }, [reviveUsed, showToast]);

  // Keyboard controls (case-accurate Escape & P)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (import.meta.env.DEV && e.key === '`') { setDevOpen((o) => !o); e.preventDefault(); return; }
      if (screen === 'playing') {
        if (e.key === 'Escape') {
          if (selectedKind) { setSelectedKind(null); audio.click(); return; }
          if (selectedId !== null) { setSelectedId(null); audio.click(); return; }
          setScreen('paused');
          if (gameRef.current) gameRef.current.paused = true;
          audio.uiOpen();
          return;
        }
        if (e.key === 'p' || e.key === 'P') {
          setScreen('paused');
          if (gameRef.current) gameRef.current.paused = true;
          audio.uiOpen();
          return;
        }
        if (e.key === ' ') {
          e.preventDefault();
          gameRef.current?.startNextWave();
          return;
        }
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 5) {
          const arr: TowerKind[] = ['archer', 'mortar', 'chill', 'prism', 'storm'].filter((k) =>
            save.unlockedTowers.includes(k as TowerKind),
          ) as TowerKind[];
          if (arr[n - 1]) {
            audio.click();
            setSelectedKind((cur) => (cur === arr[n - 1] ? null : arr[n - 1]));
            setSelectedId(null);
          }
        }
      } else if (screen === 'paused' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        setScreen('playing');
        if (gameRef.current) gameRef.current.paused = false;
        audio.uiClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, selectedKind, selectedId, save.unlockedTowers]);

  // Resize
  useEffect(() => {
    const onResize = () => setScreenSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(screenSize.w * dpr);
    canvas.height = Math.floor(screenSize.h * dpr);
    canvas.style.width = screenSize.w + 'px';
    canvas.style.height = screenSize.h + 'px';
    const cam = cameraRef.current;
    cam.screenW = screenSize.w; cam.screenH = screenSize.h;
    fitCamera(cam);
  }, [screenSize]);

  // Main render & simulation loop (renders live 2.5D diorama on title screen too!)
  useEffect(() => {
    if (!dioramaRef.current) dioramaRef.current = createDioramaGame();
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const g = gameRef.current;
          if (g && screen !== 'title') {
            g.selectedKind = selectedKind;
            g.selectedTowerId = selectedId;
            if (screen === 'playing') g.update(dt);
            let shakeX = 0, shakeY = 0;
            if (shakeRef.current.life > 0) {
              const s = shakeRef.current.life * shakeRef.current.amt;
              shakeX = (Math.random() - 0.5) * s;
              shakeY = (Math.random() - 0.5) * s;
              shakeRef.current.life -= dt;
            }
            ctx.save();
            ctx.translate(shakeX, shakeY);
            renderWorld(ctx, g, cameraRef.current, t / 1000);
            ctx.restore();
          } else if (dioramaRef.current) {
            const dio = dioramaRef.current;
            dio.update(dt);
            const cam = cameraRef.current;
            const oldX = cam.x, oldY = cam.y;
            cam.x = (cam.screenW > 750 ? -2.25 : 0) + Math.sin(t / 6000) * 0.12;
            cam.y = Math.cos(t / 7000) * 0.05;
            renderWorld(ctx, dio, cam, t / 1000);
            cam.x = oldX; cam.y = oldY;
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, selectedKind, selectedId]);

  // Live HUD counters (foes left, combo streak) — polled so readouts stay fresh
  useEffect(() => {
    if (screen !== 'playing' && screen !== 'paused') { setLive({ foes: 0, streak: 0 }); return; }
    const id = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      setLive({ foes: g.enemies.length + g.spawnQueue.length, streak: g.streak });
    }, 250);
    return () => clearInterval(id);
  }, [screen]);

  // Canvas input
  const onPointer = useCallback((cx: number, cy: number, shift: boolean) => {
    if (screen !== 'playing') return;
    const g = gameRef.current; if (!g) return;
    const world = pickWorld(cameraRef.current, cx, cy);
    if (selectedKind) {
      const ok = g.place(selectedKind, world.x, world.z);
      if (ok && !shift) setSelectedKind(null);
    } else {
      let hit: number | null = null; let best = 0.75;
      for (const t of g.towers) {
        const d = Math.hypot(t.x - world.x, t.z - world.z);
        if (d < best) { best = d; hit = t.id; }
      }
      setSelectedId(hit);
    }
  }, [screen, selectedKind]);

  const onMove = useCallback((cx: number, cy: number) => {
    const g = gameRef.current; if (!g) return;
    const w = pickWorld(cameraRef.current, cx, cy);
    g.hoverX = w.x; g.hoverZ = w.z;
  }, []);

  // Card / chest interaction
  const openCard = useCallback((c: Card) => {
    ensureAudio(); audio.uiOpen();
    setPuzzleCard(c); setScreen('puzzle');
    if (gameRef.current) gameRef.current.paused = true;
  }, [ensureAudio]);

  const solvePuzzle = useCallback(() => {
    if (!puzzleCard || !gameRef.current) return;
    gameRef.current.inventory.cards = gameRef.current.inventory.cards.filter((c) => c.id !== puzzleCard.id);
    gameRef.current.inventory.keys += 1;
    audio.key();
    setPuzzleCard(null);
    gameRef.current.paused = false;
    setScreen('playing');
    setInvTick((x) => x + 1);
    showToast('Citadel Key Earned');
    sdk.happyTime();
  }, [puzzleCard, showToast]);

  const failPuzzle = useCallback(() => {
    audio.uiClose();
    setPuzzleCard(null);
    if (gameRef.current) gameRef.current.paused = false;
    setScreen('playing');
    showToast('Trial Failed — Card Retained');
  }, [showToast]);

  const closePuzzle = useCallback(() => {
    audio.uiClose();
    setPuzzleCard(null);
    if (gameRef.current) gameRef.current.paused = false;
    setScreen('playing');
  }, []);

  const openChest = useCallback((c: Chest) => {
    const g = gameRef.current; if (!g) return;
    if (g.inventory.keys < 1) { audio.err(); showToast('Requires 1 Key — Solve a Card First'); return; }
    ensureAudio(); audio.uiOpen(); audio.chestOpen();
    g.inventory.keys -= 1;
    g.inventory.chests = g.inventory.chests.filter((x) => x.id !== c.id);
    const roll = Math.random();
    let text = '';
    if (roll < 0.35) {
      const amt = 40 + Math.floor(Math.random() * 120) * ({ common: 1, rare: 2, epic: 3, legendary: 5 } as any)[c.rarity];
      g.gold += amt; setGold(g.gold);
      text = `+${amt} Gold Crowns`;
    } else if (roll < 0.7) {
      const all: TowerKind[] = ['prism', 'storm', 'archer', 'mortar', 'chill'];
      const t = all[Math.floor(Math.random() * all.length)];
      if (!save.unlockedTowers.includes(t)) {
        setSave((s) => ({ ...s, unlockedTowers: Array.from(new Set([...s.unlockedTowers, t])) }));
        text = `Blueprint Unlocked: ${TOWERS[t].name}`;
      } else {
        const bonus = 60; g.gold += bonus; setGold(g.gold);
        text = `Duplicate Blueprint (+${bonus} Gold)`;
      }
    } else if (roll < 0.9) {
      text = 'Ancient Realm Pass Acquired';
    } else {
      text = 'Legendary Relic Unearthed';
    }
    setChest(c); setChestReward(text); setScreen('chest');
    setInvTick((x) => x + 1);
  }, [ensureAudio, showToast, save.unlockedTowers]);

  const closeChest = useCallback(() => {
    setChest(null); setChestReward(null);
    if (gameRef.current) gameRef.current.paused = false;
    setScreen('playing'); audio.uiClose();
  }, []);

  const upgradeSel = useCallback(() => {
    if (!gameRef.current || selectedId === null) return;
    if (gameRef.current.upgrade(selectedId)) setInvTick((x) => x + 1);
  }, [selectedId]);

  const sellSel = useCallback(() => {
    if (!gameRef.current || selectedId === null) return;
    gameRef.current.sell(selectedId);
    setSelectedId(null);
  }, [selectedId]);

  const cycleTargetSel = useCallback(() => {
    if (!gameRef.current || selectedId === null) return;
    gameRef.current.cycleTargeting(selectedId);
    setInvTick((x) => x + 1);
  }, [selectedId]);

  const startWave = useCallback(() => { gameRef.current?.startNextWave(); }, []);

  const togglePause = useCallback(() => {
    if (screen === 'playing') {
      setScreen('paused');
      if (gameRef.current) gameRef.current.paused = true;
      audio.uiOpen();
    } else if (screen === 'paused') {
      setScreen('playing');
      if (gameRef.current) gameRef.current.paused = false;
      audio.uiClose();
    }
  }, [screen]);

  const selectSpeed = useCallback((s: number) => {
    setSpeedMult(s);
    if (gameRef.current) gameRef.current.speedMult = s;
    audio.click();
  }, []);

  const inv = gameRef.current?.inventory ?? { chests: [] as Chest[], cards: [] as Card[], keys: 0 };
  void invTick;

  const palette = useMemo(
    () => (screen === 'title' ? HOME_PALETTE : themeKind ? uiPaletteFor(themeKind) : HOME_PALETTE),
    [screen, themeKind],
  );

  const selectedTower = useMemo(() => {
    const g = gameRef.current;
    if (!g || selectedId === null) return null;
    return g.towers.find((t) => t.id === selectedId) ?? null;
  }, [selectedId, gold, invTick]);

  const exitToTitle = useCallback(() => {
    setThemeKind(null);
    setScreen('title');
    audio.stopBgm();
  }, []);

  return (
    <UiThemeProvider value={palette}>
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: TOKENS.color.bg,
          color: TOKENS.color.ink,
          overflow: 'hidden',
          fontFamily: FONT_BODY,
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes popIn { 0% { opacity: 0; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }
          @keyframes floatUp { 0% { opacity: 0; transform: translate(-50%, -8px); } 100% { opacity: 1; transform: translate(-50%, 0); } }
          @keyframes pulseGlow { 0%,100% { filter: drop-shadow(0 0 8px rgba(251,191,36,0.55)); } 50% { filter: drop-shadow(0 0 20px rgba(251,191,36,0.95)); } }
          @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes rise { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          button:active:not(:disabled) { transform: translateY(1px); }
        `}</style>

        {/* 2.5D Isometric World Canvas */}
        <canvas
          ref={canvasRef}
          onClick={(e) => onPointer(e.clientX, e.clientY, e.shiftKey)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (selectedKind) { setSelectedKind(null); audio.click(); }
            else if (selectedId !== null) { setSelectedId(null); audio.click(); }
          }}
          onMouseMove={(e) => onMove(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            if (e.changedTouches.length === 0) return;
            e.preventDefault();
            const t = e.changedTouches[0];
            onMove(t.clientX, t.clientY);
            onPointer(t.clientX, t.clientY, false);
          }}
          onTouchMove={(e) => { const t = e.changedTouches[0]; if (t) onMove(t.clientX, t.clientY); }}
          style={{ position: 'absolute', inset: 0, cursor: selectedKind ? 'crosshair' : 'default', touchAction: 'none' }}
        />

        {/* Top Command Bar */}
        {screen !== 'title' && screen !== 'ad-count' && screen !== 'ad-play' && (
          <TopHud
            gold={gold}
            hp={hp}
            keys={inv.keys}
            inv={inv}
            openCard={openCard}
            openChest={openChest}
            stageLabel={stageLabel}
            waveInfo={waveInfo}
            streak={live.streak}
            onPause={togglePause}
            onHowTo={() => {
              if (gameRef.current) gameRef.current.paused = true;
              setScreen('howto');
              audio.click();
            }}
            onSelectSpeed={selectSpeed}
            speedMult={speedMult}
            paused={screen === 'paused'}
          />
        )}

        {/* Placement Mode Banner */}
        {screen === 'playing' && selectedKind && (
          <div className="placement-note">
            <strong>{TOWERS[selectedKind].name}</strong> <span>Choose a highlighted tile</span>
            <button onClick={() => setSelectedKind(null)}>Cancel</button>
          </div>
        )}

        {/* Bottom Build Dock */}
        {screen === 'playing' && (
          <BottomShop
            unlocked={save.unlockedTowers}
            gold={gold}
            selectedKind={selectedKind}
            setSelectedKind={setSelectedKind}
            setSelectedId={setSelectedId}
            waveActive={gameRef.current?.waveActive ?? false}
            enemiesLeft={live.foes}
            waveInfo={waveInfo}
            onStartWave={startWave}
          />
        )}

        {/* Selected Tower Inspector */}
        {selectedTower && screen === 'playing' && gameRef.current && (
          <div className="tower-inspector-position">
            <TowerPanel
              tower={selectedTower}
              game={gameRef.current}
              gold={gold}
              onClose={() => setSelectedId(null)}
              onUpgrade={upgradeSel}
              onSell={sellSel}
              onCycleTarget={cycleTargetSel}
            />
          </div>
        )}

        {/* Floating Event Toast */}
        {toast && (
          <div className="game-toast" role="status">{toast}</div>
        )}

        {/* Dev Tools Suite (Dev Build Only, toggle with `) */}
        {import.meta.env.DEV && devOpen && gameRef.current && devRef.current && (
          <DevPanel
            key={devTick}
            dev={devRef.current}
            tests={devTests}
            onRunTests={() => { setDevTests(devRef.current!.runSelfTests()); bumpDev(); }}
            onAction={() => bumpDev()}
            onClose={() => setDevOpen(false)}
          />
        )}

        {/* Screens & Modals */}
        {screen === 'title' && (
          <TitleScreen
            save={save}
            onStart={() => {
              audio.click();
              sdk.loadingStart();
              sdk.loadingProgress(0.5);
              setTimeout(() => startRun({ fresh: true }), 150);
            }}
            onContinue={() => startRun({})}
            onHowTo={() => { audio.click(); setScreen('howto'); }}
            onLegal={() => { audio.click(); setScreen('legal'); }}
            onScores={() => { audio.click(); setScreen('scores'); }}
            onSettings={() => { audio.click(); setScreen('settings'); }}
            onMute={() => setSave((s) => ({ ...s, muteSfx: !s.muteSfx, muteBgm: !s.muteBgm }))}
          />
        )}

        {screen === 'paused' && (
          <PauseScreen
            onResume={togglePause}
            onHowTo={() => setScreen('howto')}
            onAbandon={() => {
              setSave((s) => ({ ...s, currentRun: undefined }));
              gameRef.current = null;
              exitToTitle();
            }}
            onSettings={() => setScreen('settings')}
          />
        )}

        {screen === 'victory' && (
          <VictoryScreen
            session={session}
            hpPct={hp.hp / hp.max}
            isMajor={gameRef.current?.stage.minor === 6}
            onNext={goToNext}
            onExit={exitToTitle}
          />
        )}

        {screen === 'defeat' && (
          <DefeatScreen
            session={session}
            waves={waveInfo}
            reviveUsed={reviveUsed}
            onRevive={doRevive}
            onRetry={restart}
            onExit={() => {
              setSave((s) => ({ ...s, currentRun: undefined }));
              gameRef.current = null;
              exitToTitle();
            }}
          />
        )}

        {screen === 'puzzle' && puzzleCard && (
          <Overlay onClose={closePuzzle}>
            <PuzzleModal kind={puzzleCard.kind} onSolve={solvePuzzle} onFail={failPuzzle} onClose={closePuzzle} />
          </Overlay>
        )}

        {screen === 'chest' && chest && (
          <Overlay onClose={closeChest}>
            <ChestReveal chest={chest} reward={chestReward ?? ''} onClaim={closeChest} />
          </Overlay>
        )}

        {screen === 'ad-count' && <AdCountScreen count={adCount} />}
        {screen === 'ad-play' && <AdPlayScreen />}

        {screen === 'howto' && (
          <Overlay onClose={() => {
            if (gameRef.current) { gameRef.current.paused = false; setScreen('playing'); }
            else setScreen('title');
            audio.click();
          }}>
            <HowToScreen onClose={() => {
              if (gameRef.current) { gameRef.current.paused = false; setScreen('playing'); }
              else setScreen('title');
              audio.click();
            }} />
          </Overlay>
        )}

        {screen === 'legal' && (
          <Overlay onClose={() => { setScreen('title'); audio.click(); }}>
            <LegalScreen tab={legalTab} setTab={setLegalTab} onClose={() => { setScreen('title'); audio.click(); }} />
          </Overlay>
        )}

        {screen === 'settings' && (
          <Overlay onClose={() => { setScreen(gameRef.current ? 'paused' : 'title'); audio.click(); }}>
            <SettingsScreen save={save} setSave={setSave} onClose={() => { setScreen(gameRef.current ? 'paused' : 'title'); audio.click(); }} />
          </Overlay>
        )}

        {screen === 'scores' && (
          <Overlay onClose={() => { setScreen('title'); audio.click(); }}>
            <ScoresScreen save={save} onClose={() => { setScreen('title'); audio.click(); }} />
          </Overlay>
        )}
      </div>
    </UiThemeProvider>
  );
}

// ================== TITLE SCREEN ==================
interface TitleScreenProps {
  save: SaveData;
  onStart: () => void;
  onContinue: () => void;
  onHowTo: () => void;
  onLegal: () => void;
  onScores: () => void;
  onSettings: () => void;
  onMute: () => void;
}

function TitleScreen({ save, onStart, onContinue, onHowTo, onLegal, onScores, onSettings, onMute }: TitleScreenProps) {
  return (
    <div className="title-scene">
      <div className="title-content">
        <div className="title-wordmark" aria-label="Preserve Everything">
          <span>Preserve</span>
          <span>Everything<span className="title-period">.</span></span>
        </div>
        <p className="title-subtitle">Hold the last light. Build your defense.</p>
        <div className="title-actions">
          <button className="title-start" onClick={onStart}>Begin journey <span aria-hidden>↗</span></button>
          {save.currentRun && <button className="title-continue" onClick={onContinue}>{`Continue round ${save.currentRun.round}, stage ${save.currentRun.minor}`} <span aria-hidden>→</span></button>}
        </div>
        <nav className="title-nav" aria-label="Game menu">
          <button onClick={onHowTo}>How to play</button>
          <button onClick={onScores}>Records</button>
          <button onClick={onSettings}>Settings</button>
        </nav>
      </div>
      <div className="title-utility">
        <span>Citadel defense / Infinite realms</span>
        <div><button onClick={onMute}>{save.muteSfx ? 'Sound off' : 'Sound on'}</button><button onClick={onLegal}>Legal</button></div>
      </div>
    </div>
  );
}

// ================== TOP COMMAND BAR (HUD) ==================
interface TopHudProps {
  gold: number;
  hp: { hp: number; max: number };
  keys: number;
  inv: { chests: Chest[]; cards: Card[]; keys: number };
  openCard: (c: Card) => void;
  openChest: (c: Chest) => void;
  stageLabel: { round: number; minor: number; theme: string };
  waveInfo: { cur: number; total: number };
  streak: number;
  onPause: () => void;
  onHowTo: () => void;
  onSelectSpeed: (s: number) => void;
  speedMult: number;
  paused: boolean;
}

function TopHud({ gold, hp, keys, inv, openCard, openChest, stageLabel, waveInfo, streak, onPause, onHowTo, onSelectSpeed, speedMult, paused }: TopHudProps) {
  const t = useUiTheme();
  return (
    <header className="battle-hud" style={{ '--realm-accent': t.accent } as React.CSSProperties}>
      <div className="battle-hud__left">
        <div className="citadel-health" aria-label={`Citadel health ${hp.hp} of ${hp.max}`}>
          <div className="citadel-health__label"><span>Citadel</span><strong>{hp.hp}<small> / {hp.max}</small></strong></div>
          <div className="citadel-health__track"><i style={{ width: `${Math.max(0, Math.min(100, hp.hp / hp.max * 100))}%`, background: hp.hp / hp.max < .3 ? '#ec6b5e' : '#a8c9ab' }} /></div>
        </div>
        <div className="hud-resource"><CoinIcon size={18} /><strong>{gold}</strong></div>
        <div className="hud-resource"><KeyIcon size={18} /><strong>{keys}</strong></div>
        {(inv.cards.length > 0 || inv.chests.length > 0) && <div className="hud-loot">
          {inv.cards.slice(0, 4).map(c => <button key={c.id} title={`${c.kind} card: solve for a key`} onClick={() => openCard(c)}><CardIcon size={25} color={RARITY_COLOR[c.rarity]} /></button>)}
          {inv.chests.slice(0, 4).map(c => <button key={c.id} title={`${c.rarity} chest: open with a key`} onClick={() => openChest(c)}><ChestIcon size={25} accent={RARITY_COLOR[c.rarity]} /></button>)}
          {inv.cards.length + inv.chests.length > 8 && <span>+{inv.cards.length + inv.chests.length - 8}</span>}
        </div>}
      </div>
      <div className="battle-hud__center">
        <span className="realm-name">{stageLabel.theme}</span>
        <span className="realm-progress">Round {stageLabel.round} / Stage {stageLabel.minor} <b>·</b> Wave {Math.max(1, waveInfo.cur)} of {waveInfo.total}</span>
        {streak >= 3 && <span className="realm-combo">{streak} chain</span>}
      </div>
      <div className="battle-hud__right">
        <div className="speed-select" aria-label="Game speed">{[1,2,3].map(n => <button key={n} aria-pressed={speedMult === n} onClick={() => onSelectSpeed(n)}>{n}×</button>)}</div>
        <button className="hud-control" onClick={onHowTo} aria-label="How to play" title="How to play">?</button>
        <button className="hud-control" onClick={onPause} aria-label={paused ? 'Resume' : 'Pause'} title="Pause (Esc)">{paused ? <PlayIcon size={16} color="currentColor" /> : <PauseIcon size={16} color="currentColor" />}</button>
      </div>
    </header>
  );
}

// ================== BOTTOM BUILD DOCK ==================
interface BottomShopProps {
  unlocked: TowerKind[];
  gold: number;
  selectedKind: TowerKind | null;
  setSelectedKind: (k: TowerKind | null) => void;
  setSelectedId: (id: number | null) => void;
  waveActive: boolean;
  enemiesLeft: number;
  waveInfo: { cur: number; total: number };
  onStartWave: () => void;
}

function BottomShop({ unlocked, gold, selectedKind, setSelectedKind, setSelectedId, waveActive, enemiesLeft, waveInfo, onStartWave }: BottomShopProps) {
  const [hoveredKind, setHoveredKind] = useState<TowerKind | null>(null);
  const preview = hoveredKind ? TOWERS[hoveredKind] : null;
  return (
    <div className="build-area">
      {preview && <div className="build-hint"><strong style={{ color: preview.color }}>{preview.name}</strong><span>{preview.desc}</span><span>{preview.damage} damage / {preview.range} range</span></div>}
      <div className="build-rail" role="toolbar" aria-label="Build towers">
        <div className="build-rail__label">Build</div>
        <div className="build-rail__tools">
          {(['archer','mortar','chill','prism','storm'] as TowerKind[]).filter(k => unlocked.includes(k)).map((k,i) => {
            const def=TOWERS[k], Icon=TOWER_ICONS[k], affordable=gold>=def.cost, selected=selectedKind===k;
            return <button key={k} className="build-tool" data-selected={selected} disabled={!affordable} aria-pressed={selected} title={`${def.name}: ${def.desc}. Costs ${def.cost} gold.`} onMouseEnter={() => setHoveredKind(k)} onMouseLeave={() => setHoveredKind(null)} onFocus={() => setHoveredKind(k)} onBlur={() => setHoveredKind(null)} onClick={() => {audio.click(); setSelectedKind(selected ? null : k); setSelectedId(null);}} style={{ '--tool-color': def.color } as React.CSSProperties}>
              <small className="build-tool__key">{i+1}</small><Icon size={34} />
              <span className="build-tool__name">{def.name}</span><span className="build-tool__cost">{def.cost}g</span>
            </button>;
          })}
        </div>
        <button className="send-wave" disabled={waveActive} onClick={onStartWave}>
          <span className="send-wave__icon"><PlayIcon size={16} color="currentColor" /></span>
          <span>{waveActive ? `${enemiesLeft} incoming` : `Send wave ${Math.max(1, waveInfo.cur+1)}`}</span>
        </button>
      </div>
    </div>
  );
}

// ================== TOWER INSPECTOR PANEL ==================
interface TowerPanelProps {
  tower: Tower;
  game: Game;
  gold: number;
  onClose: () => void;
  onUpgrade: () => void;
  onSell: () => void;
  onCycleTarget: () => void;
}

function TowerPanel({ tower, game, gold, onClose, onUpgrade, onSell, onCycleTarget }: TowerPanelProps) {
  const t = useUiTheme();
  const def = TOWERS[tower.kind];
  const st = game.towerStats(tower);
  const cost = game.upgradeCost(tower);
  const refund = Math.floor(
    (def.cost + Array.from({ length: tower.level - 1 }, (_, j) => Math.floor(def.cost * (0.6 + (j + 1) * 0.5))).reduce((a, b) => a + b, 0)) * 0.65,
  );
  const mode: TargetingMode = tower.targeting ?? def.targeting ?? 'first';
  const IconComp = TOWER_ICONS[tower.kind];

  return (
    <Panel padding={16} ornate style={{ width: 268 }} glow={def.color}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconComp size={34} />
          <div>
            <GlyphText size={18} color={def.color}>{def.name}</GlyphText>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {[1, 2, 3, 4].map((lv) => (
                <span
                  key={lv}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: lv <= tower.level ? t.accent : 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(0,0,0,0.4)',
                  }}
                />
              ))}
              <span style={{ fontSize: 12, color: t.inkMuted, marginLeft: 4 }}>{`Lv ${tower.level}/4`}</span>
            </div>
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={onClose} style={{ width: 30, padding: 0 }}>×</Btn>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        background: t.panelDeepBottom,
        borderRadius: 10,
        border: `1px solid ${t.frame}`,
        marginBottom: 10,
      }}>
        <StatRow label="Damage" value={String(Math.floor(st.damage))} />
        <StatRow label="Range" value={st.range.toFixed(1)} />
        <StatRow label="Attack Rate" value={`${st.fireRate.toFixed(1)}/s`} />
        {st.splash && <StatRow label="Splash Radius" value={st.splash.toFixed(1)} />}
        {st.slow && <StatRow label="Frost Slow" value={`${Math.floor(st.slow * 100)}%`} />}
        {st.chain && <StatRow label="Chain Targets" value={String(st.chain)} />}
        <StatRow label="Total Kills" value={String(tower.kills)} />
      </div>

      {/* Targeting Priority Toggle */}
      <button
        type="button"
        onClick={onCycleTarget}
        title="Click to cycle tower AI targeting priority"
        style={{
          width: '100%',
          padding: '6px 10px',
          marginBottom: 10,
          borderRadius: 8,
          background: t.panelDeepTop,
          border: `1px solid ${t.frame}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <GlyphText size={12} color={t.inkMuted} variant="body">Target Priority</GlyphText>
        <GlyphText size={12} color={t.accent}>{TARGET_LABELS[mode]}</GlyphText>
      </button>

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="good" size="sm" onClick={onUpgrade} disabled={tower.level >= 4 || gold < cost} block>
          {tower.level >= 4 ? 'Max Level' : `Upgrade (${cost}g)`}
        </Btn>
        <Btn variant="bad" size="sm" onClick={onSell} style={{ whiteSpace: 'nowrap' }}>
          {`Sell (+${refund}g)`}
        </Btn>
      </div>
    </Panel>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const t = useUiTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <GlyphText size={12} color={t.inkMuted} variant="body">{label}</GlyphText>
      <GlyphText size={13} color={t.ink} raw>{value}</GlyphText>
    </div>
  );
}

// ================== PAUSE SCREEN ==================
interface PauseScreenProps {
  onResume: () => void;
  onHowTo: () => void;
  onAbandon: () => void;
  onSettings: () => void;
}

function PauseScreen({ onResume, onHowTo, onAbandon, onSettings }: PauseScreenProps) {
  return (
    <Overlay onClose={onResume}>
      <Panel padding={26} ornate style={{ minWidth: 320, textAlign: 'center' }}>
        <div style={{ marginBottom: 18 }}>
          <GlyphText size={30} color={TOKENS.color.accent}>
            Game Paused
          </GlyphText>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn variant="good" size="md" onClick={onResume} block>Resume Battle</Btn>
          <Btn variant="secondary" size="md" onClick={onHowTo} block>How to Play</Btn>
          <Btn variant="secondary" size="md" onClick={onSettings} block>Settings</Btn>
          <Btn variant="bad" size="md" onClick={onAbandon} block>Abandon Run</Btn>
        </div>
      </Panel>
    </Overlay>
  );
}

// ================== VICTORY SCREEN ==================
interface VictoryScreenProps {
  session: { kills: number; gold: number; chests: number; cards: number; mvp: string };
  hpPct: number;
  isMajor: boolean;
  onNext: () => void;
  onExit: () => void;
}

function VictoryScreen({ session, hpPct, isMajor, onNext, onExit }: VictoryScreenProps) {
  const stars = hpPct > 0.66 ? 3 : hpPct > 0.33 ? 2 : 1;
  return (
    <Overlay onClose={undefined}>
      <Panel padding={26} ornate glow={TOKENS.color.accent} style={{ width: 380, textAlign: 'center' }}>
        <div style={{ animation: 'pulseGlow 2s infinite' }}>
          <CrownIcon size={60} />
        </div>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <GlyphText size={34} color={TOKENS.color.accent}>
            Victory Achieved!
          </GlyphText>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ opacity: i < stars ? 1 : 0.25, animation: i < stars ? 'pulseGlow 2s infinite' : 'none' }}>
              <StarIcon size={36} filled={i < stars} />
            </div>
          ))}
        </div>

        <Panel tone="deep" padding={14} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatLine label="Enemies Defeated" value={String(session.kills)} />
            <StatLine label="Gold Earned" value={`+${session.gold} Gold`} accent />
            <StatLine label="Chests Found" value={String(session.chests)} />
            <StatLine label="Puzzle Cards Found" value={String(session.cards)} />
            <StatLine label="MVP Tower" value={session.mvp || 'None'} />
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn variant="primary" size="lg" onClick={onNext} glow block>
            {isMajor ? 'Enter Next Realm' : 'Advance to Next Stage'}
          </Btn>
          <Btn variant="secondary" size="sm" onClick={onExit} block>
            Return to Title
          </Btn>
        </div>
      </Panel>
    </Overlay>
  );
}

function StatLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const t = useUiTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <GlyphText size={13} color={t.inkMuted} variant="body">{label}</GlyphText>
      <GlyphText size={14} color={accent ? t.accent : t.ink} raw>{value}</GlyphText>
    </div>
  );
}

// ================== DEFEAT SCREEN ==================
interface DefeatScreenProps {
  session: { kills: number; gold: number; chests: number; cards: number; mvp: string };
  waves: { cur: number; total: number };
  reviveUsed: boolean;
  onRevive: () => void;
  onRetry: () => void;
  onExit: () => void;
}

function DefeatScreen({ session, waves, reviveUsed, onRevive, onRetry, onExit }: DefeatScreenProps) {
  return (
    <Overlay onClose={undefined}>
      <Panel padding={26} ornate glow={TOKENS.color.bad} style={{ width: 380, textAlign: 'center' }}>
        <SkullIcon size={60} color="#f87171" />
        <div style={{ marginTop: 8, marginBottom: 6 }}>
          <GlyphText size={34} color={TOKENS.color.bad}>
            Citadel Fallen
          </GlyphText>
        </div>
        <div style={{ marginBottom: 14 }}>
          <GlyphText size={14} color={TOKENS.color.inkMuted} variant="body">
            The enemy breached your defenses
          </GlyphText>
        </div>

        <Panel tone="deep" padding={14} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatLine label="Waves Survived" value={`${waves.cur} of ${waves.total}`} />
            <StatLine label="Enemies Defeated" value={String(session.kills)} accent />
            <StatLine label="Gold Retained" value={`${session.gold} Gold`} />
          </div>
        </Panel>

        {!reviveUsed && (
          <div style={{ marginBottom: 10 }}>
            <Btn variant="primary" size="md" onClick={onRevive} glow block>
              Watch Ad to Revive (30% HP)
            </Btn>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="good" size="md" onClick={onRetry} block>Retry Stage</Btn>
          <Btn variant="secondary" size="md" onClick={onExit} block>Title Menu</Btn>
        </div>
      </Panel>
    </Overlay>
  );
}

// ================== CHEST REVEAL ==================
interface ChestRevealProps {
  chest: Chest;
  reward: string;
  onClaim: () => void;
}

function ChestReveal({ chest, reward, onClaim }: ChestRevealProps) {
  const rarityTitle = chest.rarity.charAt(0).toUpperCase() + chest.rarity.slice(1);
  return (
    <Panel padding={26} ornate glow={RARITY_COLOR[chest.rarity]} style={{ width: 360, textAlign: 'center' }}>
      <div style={{ animation: 'rise 0.35s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ animation: 'pulseGlow 2s infinite' }}>
          <ChestIcon size={80} accent={RARITY_COLOR[chest.rarity]} />
        </div>
        <GlyphText size={24} color={RARITY_COLOR[chest.rarity]}>
          {`${rarityTitle} Chest Opened`}
        </GlyphText>
        <Panel tone="deep" padding={16} style={{ width: '100%' }}>
          <GlyphText size={17} color={TOKENS.color.accent} raw>
            {reward}
          </GlyphText>
        </Panel>
        <Btn variant="primary" size="md" onClick={onClaim} glow style={{ minWidth: 150 }}>
          Claim Reward
        </Btn>
      </div>
    </Panel>
  );
}

// ================== AD SCREENS ==================
function AdCountScreen({ count }: { count: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#050811', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 16 }}>
      <GlyphText size={18} color={TOKENS.color.inkMuted}>Realm Intermission</GlyphText>
      <div style={{ transform: `scale(${1 + (3 - count) * 0.05})`, transition: 'transform 0.3s' }}>
        <GlyphText size={96} color={TOKENS.color.accent} raw>{String(count)}</GlyphText>
      </div>
      <GlyphText size={14} color={TOKENS.color.inkDim} variant="body">Preparing next realm...</GlyphText>
    </div>
  );
}

function AdPlayScreen() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#050811', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 16 }}>
      <GlyphText size={16} color={TOKENS.color.inkMuted}>Sponsored Break</GlyphText>
      <div style={{ animation: 'spinSlow 1.5s linear infinite' }}>
        <GearIcon size={64} />
      </div>
      <GlyphText size={13} color={TOKENS.color.inkDim} variant="body">Your campaign progress is saved</GlyphText>
    </div>
  );
}

// ================== HOW TO PLAY ==================
function HowToScreen({ onClose }: { onClose: () => void }) {
  const sections: [string, string][] = [
    ['Objective', 'Defend the Citadel at the end of the path across every enemy wave. If Citadel health reaches zero, the realm falls.'],
    ['Building Towers', 'Select a tower blueprint from the bottom dock and click any highlighted grass tile beside the path. Click a placed tower to inspect, upgrade, change target priority, or sell it.'],
    ['Waves & Combos', 'Press Start Wave (or Spacebar) to summon the next wave. Defeating enemies rapidly builds a Kill-Streak Combo that awards bonus gold crowns.'],
    ['Puzzle Cards & Keys', 'Slain foes occasionally drop puzzle cards. Click a card in the top bar to complete a short trial and earn a Citadel Key.'],
    ['Treasure Chests', 'Use Citadel Keys to unlock sealed treasure chests for gold crowns, new tower blueprints, and rare relics.'],
    ['Realms & Bosses', 'Every 6 stages completes a realm, advancing into new terrain, weather, and boss encounters.'],
    ['Controls', 'Keys 1–5 select tower blueprints · Right-click or Esc cancels placement · Spacebar starts waves · 1×/2×/3× adjusts battle speed.'],
  ];
  return (
    <Panel padding={24} ornate style={{ maxWidth: 540, maxHeight: '85vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>How to Play</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map(([title, body]) => (
          <div key={title} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 10 }}>
            <GlyphText size={15} color={TOKENS.color.accent}>{title}</GlyphText>
            <div style={{ marginTop: 4 }}>
              <GlyphText size={13} color={TOKENS.color.ink} variant="body">{body}</GlyphText>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ================== LEGAL & COMPLIANCE ==================
function LegalScreen({ tab, setTab, onClose }: { tab: 'copyright' | 'terms' | 'privacy'; setTab: (t: 'copyright' | 'terms' | 'privacy') => void; onClose: () => void }) {
  return (
    <Panel padding={24} ornate style={{ maxWidth: 540, maxHeight: '85vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>Legal & Compliance</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Btn variant={tab === 'copyright' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('copyright')}>Copyright</Btn>
        <Btn variant={tab === 'terms' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('terms')}>Terms of Use</Btn>
        <Btn variant={tab === 'privacy' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('privacy')}>Privacy</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'copyright' && (
          <>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              {`Preserve Everything © ${new Date().getFullYear()}. All original artwork, procedural code, user interface, audio synthesis, and lore are the original authorship of the game creators.`}
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              Visuals are rendered procedurally at runtime via HTML5 Canvas, SVG icons, and our custom-designed PreserveDisplay and PreserveSans OpenType fonts.
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              Built with React, Vite, TypeScript, and Tailwind CSS (MIT Licenses). Audio is synthesized dynamically via the Web Audio API with zero external audio assets.
            </GlyphText>
          </>
        )}
        {tab === 'terms' && (
          <>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              By playing Preserve Everything you agree that the game is provided "as is" without warranty. Commercial scraping, reproduction, or redistribution of original game code and designs is prohibited.
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              Gameplay is free. Voluntary rewarded ads may be offered by hosting platforms. This game does not serve unsolicited ads in standalone play. All ad offers are strictly opt-in.
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              Game saves and high scores are stored locally in your browser storage and are never transmitted to external servers by this game.
            </GlyphText>
          </>
        )}
        {tab === 'privacy' && (
          <>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              GDPR and CCPA Compliance: Preserve Everything stores only non-identifiable local preference data on your device: unlocked towers, best round, total kills, volume levels, and active run state.
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              This game does not set first-party tracking cookies, does not perform surveillance analytics, and does not collect personal data.
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              You may reset and erase all stored game data anytime from the in-game Settings menu or through your browser settings.
            </GlyphText>
          </>
        )}
      </div>
    </Panel>
  );
}

// ================== SETTINGS ==================
function SettingsScreen({ save, setSave, onClose }: { save: SaveData; setSave: React.Dispatch<React.SetStateAction<SaveData>>; onClose: () => void }) {
  return (
    <Panel padding={24} ornate style={{ minWidth: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>Settings</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlyphText size={14} color={TOKENS.color.ink} variant="body">Sound Effects</GlyphText>
          <Btn variant={save.muteSfx ? 'secondary' : 'good'} size="sm" onClick={() => setSave((s) => ({ ...s, muteSfx: !s.muteSfx }))}>
            {save.muteSfx ? 'Muted' : 'Enabled'}
          </Btn>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlyphText size={14} color={TOKENS.color.ink} variant="body">Background Music</GlyphText>
          <Btn variant={save.muteBgm ? 'secondary' : 'good'} size="sm" onClick={() => setSave((s) => ({ ...s, muteBgm: !s.muteBgm }))}>
            {save.muteBgm ? 'Muted' : 'Enabled'}
          </Btn>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <GlyphText size={14} color={TOKENS.color.ink} variant="body">Master Volume</GlyphText>
            <GlyphText size={14} color={TOKENS.color.accent} raw>{`${Math.round(save.masterVolume * 100)}%`}</GlyphText>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={save.masterVolume}
            onChange={(e) => setSave((s) => ({ ...s, masterVolume: parseFloat(e.target.value) }))}
            style={{ width: '100%', accentColor: TOKENS.color.accent }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Btn
            variant="bad"
            size="sm"
            onClick={() => {
              if (confirm('Erase all saved progress and reset to a clean state?')) {
                localStorage.removeItem('preserve-everything-save-v1');
                location.reload();
              }
            }}
            block
          >
            Reset All Progress
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

// ================== SCORES ==================
function ScoresScreen({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const scores = save.highScores.length > 0 ? save.highScores : [{ name: 'No scores recorded yet', score: 0, round: 0, when: Date.now() }];
  return (
    <Panel padding={24} ornate style={{ minWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>High Scores</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <Panel tone="deep" padding={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {scores.map((s: any, i: number) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                background: i === 0 ? 'rgba(251,191,36,0.12)' : 'transparent',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GlyphText size={14} color={i === 0 ? TOKENS.color.accent : TOKENS.color.inkMuted} raw>{`${i + 1}.`}</GlyphText>
                <GlyphText size={14} color={TOKENS.color.ink}>{s.name}</GlyphText>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <GlyphText size={12} color={TOKENS.color.inkMuted} variant="body">{`Round ${s.round}`}</GlyphText>
                <GlyphText size={14} color={i === 0 ? TOKENS.color.accent : TOKENS.color.ink} raw>{String(s.score)}</GlyphText>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Panel>
  );
}

// ================== DEV TOOLS PANEL (DEV BUILD ONLY) ==================
function DevPanel({
  dev,
  tests,
  onRunTests,
  onAction,
  onClose,
}: {
  dev: DevTools;
  tests: TestResult[] | null;
  onRunTests: () => void;
  onAction: () => void;
  onClose: () => void;
}) {
  const s = dev.stats();
  const act = (fn: () => void) => { fn(); onAction(); };
  const devBtn: React.CSSProperties = {
    background: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  };
  return (
    <div style={{ position: 'absolute', top: 68, left: 14, zIndex: 60, width: 264, maxHeight: 'calc(100vh - 150px)', overflow: 'auto' }}>
      <Panel tone="deep" padding={12} glow="#38bdf8">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <GlyphText size={14} color="#38bdf8">Dev Tools</GlyphText>
          <Btn variant="ghost" size="sm" onClick={onClose} style={{ width: 26, height: 26, padding: 0 }}>×</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8, fontSize: 11, color: TOKENS.color.inkMuted }}>
          <span>Gold: {s.gold}</span><span>HP: {s.hp}/{s.maxHp}{s.god ? ' (God)' : ''}</span>
          <span>Wave: {s.wave}/{s.waveTotal}</span><span>Foes: {s.enemies}</span>
          <span>Towers: {s.towers}</span><span>Kills: {s.kills}</span>
          <span>Leaks: {s.leaks}</span><span>Pressure: {s.pressure.toFixed(2)}×</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <button type="button" style={devBtn} onClick={() => act(() => dev.addGold(100))}>+100 Gold</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.heal())}>Heal HP</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.setGod(!dev.god))}>{dev.god ? 'God: On' : 'God: Off'}</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.game.startNextWave())}>Start Wave</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.clearWave())}>Clear Wave</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.killAll())}>Kill All</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.step(1))}>Step 1s</button>
          <button type="button" style={devBtn} onClick={() => act(() => dev.setSeed(1))}>Seed 1</button>
          <button type="button" style={devBtn} onClick={() => act(() => { navigator.clipboard?.writeText(dev.snapshot()).catch(() => {}); })}>Snapshot</button>
          <button type="button" style={devBtn} onClick={() => act(() => { const t = window.prompt('Paste snapshot JSON'); if (t) dev.restore(t); })}>Restore</button>
          <button type="button" style={{ ...devBtn, background: '#7c2d12' }} onClick={onRunTests}>Run Tests</button>
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: TOKENS.color.inkDim, marginBottom: 4 }}>Spawn Monster:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {DEV_ENEMY_KINDS.map((k) => (
              <button key={k} type="button" style={devBtn} onClick={() => act(() => dev.spawn(k, dev.game.path.total * 0.3))}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {tests && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            <div style={{ fontSize: 11, color: TOKENS.color.inkDim }}>Self-Test Suite:</div>
            {tests.map((t, i) => (
              <div key={i} style={{ fontSize: 11, color: t.pass ? '#4ade80' : '#ef4444' }}>
                {t.pass ? '✓' : '✗'} {t.name}{t.pass ? '' : `: ${t.detail}`}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

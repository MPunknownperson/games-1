// PRESERVE EVERYTHING — main app. Block-based UI + custom engine + canvas world.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from './engine/audio';
import { sdk } from './engine/sdk';
import { loadSave, writeSave, type SaveData } from './engine/storage';
import { Game, generateStage, pickWorld, makeCamera, fitCamera, renderWorld, type Card, type Chest } from './engine/game';
import { TOWERS, THEMES, type TowerKind } from './engine/blocks';
import { drawText } from './engine/typeface';
import { drawPanel, roundedRect } from './engine/render';
import { GlyphText } from './ui/GlyphText';
import { Btn, Panel, Chip, HBar, Overlay, TOKENS, lighten } from './ui/Blocks';
import { CoinIcon, HeartIcon, KeyIcon, ChestIcon, CardIcon, ShieldIcon, PlayIcon, PauseIcon, CloseIcon, CrownIcon, StarIcon, SkullIcon, GearIcon, LogoMark, TowerIconArcher, TowerIconMortar, TowerIconChill, TowerIconPrism, TowerIconStorm } from './ui/Icons';
import { PuzzleModal } from './ui/Puzzles';

type Screen = 'title' | 'playing' | 'paused' | 'victory' | 'defeat' | 'puzzle' | 'chest' | 'ad-count' | 'ad-play' | 'howto' | 'legal' | 'settings' | 'scores';

const TOWER_ICONS: Record<TowerKind, (p: { size?: number }) => any> = {
  archer: TowerIconArcher, mortar: TowerIconMortar, chill: TowerIconChill, prism: TowerIconPrism, storm: TowerIconStorm,
};

const RARITY_COLOR: Record<string, string> = {
  common: '#94a3b8', rare: '#38bdf8', epic: '#a78bfa', legendary: '#fbbf24',
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
  const [puzzleCard, setPuzzleCard] = useState<Card | null>(null);
  const [chest, setChest] = useState<Chest | null>(null);
  const [chestReward, setChestReward] = useState<string | null>(null);
  const [adCount, setAdCount] = useState(3);
  const [session, setSession] = useState({ kills: 0, gold: 0, chests: 0, cards: 0, mvp: '' });
  const [reviveUsed, setReviveUsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [invTick, setInvTick] = useState(0); // to force re-render on inventory changes
  const [screenSize, setScreenSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const cameraRef = useRef(makeCamera(1280, 720));
  const rafRef = useRef(0);
  const shakeRef = useRef({ amt: 0, life: 0 });
  const audioStartedRef = useRef(false);
  const nextStageRef = useRef<{ round: number; minor: number; gold: number; inv: { chests: Chest[]; cards: Card[]; keys: number } } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { writeSave(save); }, [save]);
  useEffect(() => { sdk.init().catch(() => {}); }, []);
  useEffect(() => { audio.setMuted(save.muteSfx, save.muteBgm); audio.setMasterVol(save.masterVolume); }, [save.muteSfx, save.muteBgm, save.masterVolume]);

  const showToast = useCallback((s: string) => { setToast(s); setTimeout(() => setToast(null), 2200); }, []);

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
      onHpChange: (hp, max) => setHp({ hp, max }),
      onWaveChange: (c, t) => setWaveInfo({ cur: c, total: t }),
      onLoot: (t) => {
        if (t === 'chest') showToast('CHEST DROPPED');
        if (t === 'card') showToast('CARD DROPPED');
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
    setSelectedKind(null); setSelectedId(null);
    setSpeedMult(1); game.speedMult = 1;
    setStageLabel({ round: stage.round, minor: stage.minor, theme: THEMES[stage.theme].name });
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
    let mvp = 'NONE';
    if (g.mvpId) {
      const m = g.towers.find((t) => t.id === g.mvpId);
      if (m) mvp = `${TOWERS[m.kind].name} LV${m.level}`;
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
      highScores: [{ name: 'YOU', score: g.kills * 10 + g.goldEarned, round: nextRound, when: Date.now() }, ...s.highScores].sort((a, b) => b.score - a.score).slice(0, 10),
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
        showToast('CITADEL REVIVED AT 30 PERCENT');
      }
    } else showToast('AD NOT COMPLETED');
  }, [reviveUsed, showToast]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === 'playing') {
        if (e.key === 'Escape') { setSelectedKind(null); setScreen('paused'); if (gameRef.current) gameRef.current.paused = true; audio.uiOpen(); return; }
        if (e.key === 'p' || e.key === 'P') { setScreen('paused'); if (gameRef.current) gameRef.current.paused = true; audio.uiOpen(); return; }
        if (e.key === ' ') { e.preventDefault(); gameRef.current?.startNextWave(); return; }
        const n = parseInt(e.key);
        if (n >= 1 && n <= 5) {
          const arr: TowerKind[] = ['archer', 'mortar', 'chill', 'prism', 'storm'].filter((k) => save.unlockedTowers.includes(k as TowerKind)) as TowerKind[];
          if (arr[n - 1]) { setSelectedKind(arr[n - 1]); setSelectedId(null); }
        }
      } else if (screen === 'paused' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        setScreen('playing'); if (gameRef.current) gameRef.current.paused = false; audio.uiClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, save.unlockedTowers]);

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

  // Main loop
  useEffect(() => {
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
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
            // Screen shake
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
          } else {
            // Title-screen background: animated pattern
            drawTitleBackground(ctx, cameraRef.current, t / 1000);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, selectedKind, selectedId]);

  // Canvas input
  const onPointer = useCallback((cx: number, cy: number, shift: boolean) => {
    if (screen !== 'playing') return;
    const g = gameRef.current; if (!g) return;
    const world = pickWorld(cameraRef.current, cx, cy);
    if (selectedKind) {
      const ok = g.place(selectedKind, world.x, world.z);
      if (ok && !shift) setSelectedKind(null);
    } else {
      // Pick nearest tower within threshold
      let hit: number | null = null; let best = 0.7;
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
    showToast('KEY EARNED');
    sdk.happyTime();
  }, [puzzleCard, showToast]);

  const failPuzzle = useCallback(() => {
    audio.uiClose();
    setPuzzleCard(null);
    if (gameRef.current) gameRef.current.paused = false;
    setScreen('playing');
    showToast('PUZZLE FAILED. CARD KEPT.');
  }, [showToast]);

  const closePuzzle = useCallback(() => {
    audio.uiClose();
    setPuzzleCard(null);
    if (gameRef.current) gameRef.current.paused = false;
    setScreen('playing');
  }, []);

  const openChest = useCallback((c: Chest) => {
    const g = gameRef.current; if (!g) return;
    if (g.inventory.keys < 1) { audio.err(); showToast('YOU NEED A KEY. SOLVE A CARD FIRST.'); return; }
    ensureAudio(); audio.uiOpen(); audio.chestOpen();
    g.inventory.keys -= 1;
    g.inventory.chests = g.inventory.chests.filter((x) => x.id !== c.id);
    // Reward
    const roll = Math.random();
    let text = '';
    if (roll < 0.35) {
      const amt = 40 + Math.floor(Math.random() * 120) * ({ common: 1, rare: 2, epic: 3, legendary: 5 } as any)[c.rarity];
      g.gold += amt; setGold(g.gold);
      text = `+${amt} GOLD CROWNS`;
    } else if (roll < 0.7) {
      const all: TowerKind[] = ['prism', 'storm', 'archer', 'mortar', 'chill'];
      const t = all[Math.floor(Math.random() * all.length)];
      if (!save.unlockedTowers.includes(t)) {
        setSave((s) => ({ ...s, unlockedTowers: Array.from(new Set([...s.unlockedTowers, t])) }));
        text = `BLUEPRINT UNLOCKED: ${TOWERS[t].name}`;
      } else {
        const bonus = 60; g.gold += bonus; setGold(g.gold);
        text = `DUPLICATE. REFUND +${bonus} GOLD`;
      }
    } else if (roll < 0.9) {
      text = 'HIDDEN STAGE PASS ACQUIRED';
    } else {
      text = 'LEGENDARY ARTIFACT UNEARTHED';
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
    gameRef.current.upgrade(selectedId);
  }, [selectedId]);

  const sellSel = useCallback(() => {
    if (!gameRef.current || selectedId === null) return;
    gameRef.current.sell(selectedId); setSelectedId(null);
  }, [selectedId]);

  const startWave = useCallback(() => { gameRef.current?.startNextWave(); }, []);

  const togglePause = useCallback(() => {
    if (screen === 'playing') { setScreen('paused'); if (gameRef.current) gameRef.current.paused = true; audio.uiOpen(); }
    else if (screen === 'paused') { setScreen('playing'); if (gameRef.current) gameRef.current.paused = false; audio.uiClose(); }
  }, [screen]);

  const toggleSpeed = useCallback(() => {
    const s = speedMult === 1 ? 2 : speedMult === 2 ? 3 : 1;
    setSpeedMult(s);
    if (gameRef.current) gameRef.current.speedMult = s;
    audio.click();
  }, [speedMult]);

  const inv = gameRef.current?.inventory ?? { chests: [] as Chest[], cards: [] as Card[], keys: 0 };
  void invTick;

  const selectedTower = useMemo(() => {
    const g = gameRef.current;
    if (!g || selectedId === null) return null;
    return g.towers.find((t) => t.id === selectedId) ?? null;
  }, [selectedId, gold, invTick]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: TOKENS.color.bg, color: TOKENS.color.ink, overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes floatUp { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%,100% { filter: drop-shadow(0 0 8px rgba(251,191,36,0.6)); } 50% { filter: drop-shadow(0 0 24px rgba(251,191,36,1)); } }
        @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes rise { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes shine { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        button:active:not(:disabled) { transform: translateY(2px); }
      `}</style>

      {/* Canvas (world) */}
      <canvas
        ref={canvasRef}
        onClick={(e) => onPointer(e.clientX, e.clientY, e.shiftKey)}
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

      {/* HUD */}
      {screen !== 'title' && screen !== 'ad-count' && screen !== 'ad-play' && <TopHud gold={gold} hp={hp} keys={inv.keys} inv={inv} openCard={openCard} openChest={openChest} stageLabel={stageLabel} waveInfo={waveInfo} onPause={togglePause} onSpeed={toggleSpeed} speedMult={speedMult} paused={screen === 'paused'} />}

      {/* Bottom shop */}
      {screen === 'playing' && <BottomShop unlocked={save.unlockedTowers} gold={gold} selectedKind={selectedKind} setSelectedKind={setSelectedKind} setSelectedId={setSelectedId} waveActive={gameRef.current?.waveActive ?? false} waveInfo={waveInfo} onStartWave={startWave} />}

      {/* Selected tower panel */}
      {selectedTower && screen === 'playing' && gameRef.current && (
        <div style={{ position: 'absolute', top: 90, right: 12, zIndex: 20, animation: 'popIn 0.2s' }}>
          <TowerPanel
            tower={selectedTower}
            game={gameRef.current}
            gold={gold}
            onClose={() => setSelectedId(null)}
            onUpgrade={upgradeSel}
            onSell={sellSel}
          />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 30, animation: 'floatUp 0.3s' }}>
          <Panel color="#1e293b" glow={TOKENS.color.accent} padding="10px 16px">
            <GlyphText size={14} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={2}>{toast}</GlyphText>
          </Panel>
        </div>
      )}

      {/* Screens */}
      {screen === 'title' && <TitleScreen save={save} onStart={() => { audio.click(); sdk.loadingStart(); sdk.loadingProgress(0.5); setTimeout(() => startRun({ fresh: true }), 200); }} onContinue={() => startRun({})} onHowTo={() => { audio.click(); setScreen('howto'); }} onLegal={() => { audio.click(); setScreen('legal'); }} onScores={() => { audio.click(); setScreen('scores'); }} onSettings={() => { audio.click(); setScreen('settings'); }} onMute={() => setSave((s) => ({ ...s, muteSfx: !s.muteSfx, muteBgm: !s.muteBgm }))} />}

      {screen === 'paused' && <PauseScreen onResume={togglePause} onHowTo={() => setScreen('howto')} onAbandon={() => { setSave((s) => ({ ...s, currentRun: undefined })); setScreen('title'); gameRef.current = null; audio.stopBgm(); }} onSettings={() => setScreen('settings')} />}

      {screen === 'victory' && <VictoryScreen session={session} hpPct={hp.hp / hp.max} isMajor={gameRef.current?.stage.minor === 6} onNext={goToNext} onExit={() => { setScreen('title'); audio.stopBgm(); }} />}

      {screen === 'defeat' && <DefeatScreen session={session} waves={waveInfo} reviveUsed={reviveUsed} onRevive={doRevive} onRetry={restart} onExit={() => { setSave((s) => ({ ...s, currentRun: undefined })); setScreen('title'); gameRef.current = null; audio.stopBgm(); }} />}

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

      {screen === 'howto' && <Overlay onClose={() => { setScreen(gameRef.current ? 'paused' : 'title'); audio.click(); }}><HowToScreen onClose={() => { setScreen(gameRef.current ? 'paused' : 'title'); audio.click(); }} /></Overlay>}

      {screen === 'legal' && <Overlay onClose={() => { setScreen('title'); audio.click(); }}><LegalScreen tab={legalTab} setTab={setLegalTab} onClose={() => { setScreen('title'); audio.click(); }} /></Overlay>}

      {screen === 'settings' && <Overlay onClose={() => { setScreen(gameRef.current ? 'paused' : 'title'); audio.click(); }}><SettingsScreen save={save} setSave={setSave} onClose={() => { setScreen(gameRef.current ? 'paused' : 'title'); audio.click(); }} /></Overlay>}

      {screen === 'scores' && <Overlay onClose={() => { setScreen('title'); audio.click(); }}><ScoresScreen save={save} onClose={() => { setScreen('title'); audio.click(); }} /></Overlay>}
    </div>
  );
}

// ================== TITLE ==================
function TitleScreen({ save, onStart, onContinue, onHowTo, onLegal, onScores, onSettings, onMute }: any) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 30%, ${lighten('#1e2a3f', 0.1)}, #0d1220 70%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.15, pointerEvents: 'none' }}>
        {Array.from({ length: 40 }, (_, i) => {
          const angle = (i * 137) % 360;
          const dist = 20 + (i * 23) % 60;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${50 + Math.cos(angle) * dist}%`,
              top: `${50 + Math.sin(angle) * dist}%`,
              width: 2, height: 2, borderRadius: '50%', background: TOKENS.color.accent,
              boxShadow: `0 0 ${4 + (i % 4) * 2}px ${TOKENS.color.accent}`,
              animation: `pulseGlow ${2 + (i % 3)}s ease-in-out infinite`,
            }} />
          );
        })}
      </div>
      <div style={{ animation: 'rise 0.5s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 480 }}>
        <div style={{ animation: 'pulseGlow 3s ease-in-out infinite' }}>
          <LogoMark size={120} />
        </div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <GlyphText size={44} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={6} shadow={{ color: '#78350f', dx: 3, dy: 3 }} letterSpacing={4}>PRESERVE</GlyphText>
          <GlyphText size={44} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={6} shadow={{ color: '#78350f', dx: 3, dy: 3 }} letterSpacing={4}>EVERYTHING</GlyphText>
        </div>
        <div style={{ marginTop: 4, textAlign: 'center' }}>
          <GlyphText size={13} color={TOKENS.color.inkMuted} letterSpacing={2}>DEFEND THE CITADEL ACROSS INFINITE REALMS</GlyphText>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, width: 280 }}>
          <Btn variant="primary" size="lg" onClick={onStart} glow block>BEGIN JOURNEY</Btn>
          {save.currentRun && (
            <Btn variant="secondary" size="md" onClick={onContinue} block>
              {`CONTINUE  R${save.currentRun.round} S${save.currentRun.minor}`}
            </Btn>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn variant="secondary" size="sm" onClick={onHowTo}>HOW TO PLAY</Btn>
            <Btn variant="secondary" size="sm" onClick={onScores}>SCORES</Btn>
            <Btn variant="secondary" size="sm" onClick={onSettings}>SETTINGS</Btn>
          </div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
          <Chip icon={<CrownIcon size={16} />} label="BEST" value={String(save.bestRound)} />
          <Chip icon={<SkullIcon size={16} />} label="KILLS" value={String(save.totalKills)} />
          <Chip icon={<StarIcon size={16} />} label="SCORE" value={String(save.bestScore)} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
          <Btn variant="ghost" size="sm" onClick={onLegal}>LEGAL</Btn>
          <Btn variant="ghost" size="sm" onClick={onMute}>{save.muteSfx ? 'AUDIO OFF' : 'AUDIO ON'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ================== TOP HUD ==================
function TopHud({ gold, hp, keys, inv, openCard, openChest, stageLabel, waveInfo, onPause, onSpeed, speedMult, paused }: any) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15, padding: 10, display: 'flex', alignItems: 'flex-start', gap: 8, pointerEvents: 'none' }}>
      <Panel color="#1e293b" padding="6px 10px" style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip icon={<CoinIcon size={18} />} value={String(gold)} color="#78350f" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <HeartIcon size={18} />
            <HBar pct={hp.hp / hp.max} width={90} height={12} showValue={`${hp.hp} / ${hp.max}`} />
          </div>
          <Chip icon={<ShieldIcon size={16} />} label="WAVE" value={`${waveInfo.cur}/${waveInfo.total}`} color="#166534" />
          <Chip icon={<KeyIcon size={16} />} value={String(keys)} color="#7c2d12" />
        </div>
      </Panel>

      <Panel color="#1e293b" padding="4px 8px" style={{ pointerEvents: 'auto', maxWidth: '40vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {inv.cards.slice(0, 6).map((c: Card) => (
            <button
              key={c.id}
              onClick={() => openCard(c)}
              title={`${c.kind.toUpperCase()} — SOLVE FOR KEY`}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6, filter: `drop-shadow(0 0 6px ${RARITY_COLOR[c.rarity]}88)`, transition: 'transform 0.1s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = ''}
            >
              <CardIcon size={30} color={RARITY_COLOR[c.rarity]} />
            </button>
          ))}
          {inv.cards.length > 6 && <GlyphText size={11} color={TOKENS.color.inkMuted}>{`+${inv.cards.length - 6}`}</GlyphText>}
          {inv.chests.slice(0, 6).map((c: Chest) => (
            <button
              key={c.id}
              onClick={() => openChest(c)}
              title={`${c.rarity.toUpperCase()} CHEST — NEEDS KEY`}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6, filter: `drop-shadow(0 0 6px ${RARITY_COLOR[c.rarity]}88)`, transition: 'transform 0.1s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = ''}
            >
              <ChestIcon size={30} accent={RARITY_COLOR[c.rarity]} />
            </button>
          ))}
          {inv.chests.length > 6 && <GlyphText size={11} color={TOKENS.color.inkMuted}>{`+${inv.chests.length - 6}`}</GlyphText>}
          {inv.cards.length === 0 && inv.chests.length === 0 && (
            <GlyphText size={10} color={TOKENS.color.inkDim} letterSpacing={1}>ENEMIES DROP CARDS AND CHESTS</GlyphText>
          )}
        </div>
      </Panel>

      <div style={{ flex: 1, textAlign: 'center', pointerEvents: 'none' }}>
        <Panel color="#0a0f1a" padding="4px 12px" style={{ display: 'inline-block' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <GlyphText size={10} color={TOKENS.color.inkMuted} letterSpacing={2}>{`ROUND ${stageLabel.round}  STAGE ${stageLabel.minor} OF 6`}</GlyphText>
            <GlyphText size={14} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={2} letterSpacing={2}>{stageLabel.theme}</GlyphText>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
        <Btn variant="secondary" size="sm" onClick={onSpeed}>{`${speedMult}X`}</Btn>
        <Btn variant="secondary" size="sm" onClick={onPause}>
          {paused ? <PlayIcon size={16} color="#e2e8f0" /> : <PauseIcon size={16} />}
        </Btn>
      </div>
    </div>
  );
}

// ================== BOTTOM SHOP ==================
function BottomShop({ unlocked, gold, selectedKind, setSelectedKind, setSelectedId, waveActive, waveInfo, onStartWave }: any) {
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15, padding: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <Panel color="#1e293b" padding={8} style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {(['archer', 'mortar', 'chill', 'prism', 'storm'] as TowerKind[]).filter((k) => unlocked.includes(k)).map((k, i) => {
            const def = TOWERS[k];
            const canAfford = gold >= def.cost;
            const sel = selectedKind === k;
            const IconComp = TOWER_ICONS[k];
            return (
              <button
                key={k}
                onClick={() => { audio.click(); setSelectedKind(sel ? null : k); setSelectedId(null); }}
                disabled={!canAfford}
                title={def.desc}
                style={{
                  width: 74, height: 96, borderRadius: 12,
                  background: sel ? `linear-gradient(180deg, ${lighten(def.color, 0.15)}, ${def.color})` : 'linear-gradient(180deg, #334155, #1e293b)',
                  border: `2px solid ${sel ? '#fef3c7' : '#0d1220'}`,
                  opacity: canAfford ? 1 : 0.5,
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  padding: 4,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: sel ? `0 0 16px ${def.color}, 0 3px 0 #0d1220` : '0 3px 0 #0d1220, inset 0 1px 0 rgba(255,255,255,0.1)',
                  position: 'relative',
                  transition: 'transform 0.05s',
                }}
              >
                <div style={{ position: 'absolute', top: 2, right: 3 }}>
                  <GlyphText size={9} color={TOKENS.color.inkDim}>{String(i + 1)}</GlyphText>
                </div>
                <IconComp size={40} />
                <GlyphText size={9} color="#fff" outline="#0d1220" outlineWidth={2} letterSpacing={1}>{def.name}</GlyphText>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CoinIcon size={12} />
                  <GlyphText size={12} color={canAfford ? TOKENS.color.accent : TOKENS.color.bad} outline={TOKENS.color.outline} outlineWidth={2}>{String(def.cost)}</GlyphText>
                </div>
              </button>
            );
          })}
          <div style={{ marginLeft: 8 }}>
            <button
              onClick={onStartWave}
              disabled={waveActive}
              style={{
                width: 100, height: 96, borderRadius: 12,
                background: waveActive ? 'linear-gradient(180deg, #334155, #1e293b)' : `linear-gradient(180deg, ${lighten('#16a34a', 0.15)}, #16a34a)`,
                border: `2px solid ${waveActive ? '#0d1220' : '#052e16'}`,
                opacity: waveActive ? 0.5 : 1,
                cursor: waveActive ? 'not-allowed' : 'pointer',
                padding: 4,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: waveActive ? '0 3px 0 #0d1220' : `0 3px 0 #052e16, 0 0 16px #4ade8088, inset 0 -2px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25)`,
                animation: waveActive ? 'none' : 'pulseGlow 2s ease-in-out infinite',
              }}
            >
              <PlayIcon size={26} color={waveActive ? '#64748b' : '#052e16'} />
              <GlyphText size={12} color={waveActive ? '#64748b' : '#052e16'} outline={waveActive ? undefined : '#166534'} outlineWidth={1} letterSpacing={1}>
                {`WAVE ${waveInfo.cur === 0 ? 1 : waveInfo.cur + 1}`}
              </GlyphText>
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function TowerPanel({ tower, game, gold, onClose, onUpgrade, onSell }: any) {
  const def = TOWERS[tower.kind as TowerKind];
  const st = game.towerStats(tower);
  const cost = game.upgradeCost(tower);
  const IconComp = TOWER_ICONS[tower.kind as TowerKind];
  return (
    <Panel color="#1e2a3f" padding={14} style={{ width: 240 }} glow={def.color}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconComp size={28} />
          <GlyphText size={18} color={def.color} outline={TOKENS.color.outline} outlineWidth={2}>{def.name}</GlyphText>
        </div>
        <Btn variant="ghost" size="sm" onClick={onClose}>X</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: TOKENS.color.inkMuted, marginBottom: 8 }}>
        <StatRow label="LEVEL" value={`${tower.level} / 4`} />
        <StatRow label="KILLS" value={String(tower.kills)} />
        <StatRow label="DAMAGE" value={String(Math.floor(st.damage))} />
        <StatRow label="RANGE" value={st.range.toFixed(1)} />
        <StatRow label="RATE" value={`${st.fireRate.toFixed(1)}/S`} />
        {st.splash && <StatRow label="SPLASH" value={st.splash.toFixed(1)} />}
        {st.slow && <StatRow label="SLOW" value={`${Math.floor(st.slow * 100)}%`} />}
        {st.chain && <StatRow label="CHAIN" value={String(st.chain)} />}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn variant="good" size="sm" onClick={onUpgrade} disabled={tower.level >= 4 || gold < cost} block>
          {tower.level >= 4 ? 'MAX LEVEL' : `UP ${cost}G`}
        </Btn>
        <Btn variant="bad" size="sm" onClick={onSell}>SELL</Btn>
      </div>
    </Panel>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <GlyphText size={10} color={TOKENS.color.inkDim} letterSpacing={1}>{label}</GlyphText>
      <GlyphText size={12} color={TOKENS.color.ink}>{value}</GlyphText>
    </div>
  );
}

// ================== PAUSE ==================
function PauseScreen({ onResume, onHowTo, onAbandon, onSettings }: any) {
  return (
    <Overlay onClose={onResume}>
      <Panel color="#1e2a3f" padding={24} style={{ minWidth: 280, textAlign: 'center' }}>
        <div style={{ marginBottom: 16 }}>
          <GlyphText size={32} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={4} letterSpacing={3}>PAUSED</GlyphText>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn variant="good" size="md" onClick={onResume} block>RESUME</Btn>
          <Btn variant="secondary" size="md" onClick={onHowTo} block>HOW TO PLAY</Btn>
          <Btn variant="secondary" size="md" onClick={onSettings} block>SETTINGS</Btn>
          <Btn variant="bad" size="md" onClick={onAbandon} block>ABANDON RUN</Btn>
        </div>
      </Panel>
    </Overlay>
  );
}

// ================== VICTORY ==================
function VictoryScreen({ session, hpPct, isMajor, onNext, onExit }: any) {
  const stars = hpPct > 0.66 ? 3 : hpPct > 0.33 ? 2 : 1;
  return (
    <Overlay onClose={undefined}>
      <Panel color="#1e2a3f" padding={24} glow={TOKENS.color.accent} style={{ width: 360, textAlign: 'center' }}>
        <div style={{ animation: 'pulseGlow 2s infinite' }}>
          <CrownIcon size={64} />
        </div>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <GlyphText size={36} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={4} letterSpacing={3}>VICTORY</GlyphText>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ opacity: i < stars ? 1 : 0.2, animation: i < stars ? 'pulseGlow 2s infinite' : 'none' }}>
              <StarIcon size={40} filled={i < stars} />
            </div>
          ))}
        </div>
        <Panel color="#0a0f1a" padding={12} bevel="none" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <StatLine label="ENEMIES DEFEATED" value={String(session.kills)} />
            <StatLine label="GOLD EARNED" value={`+${session.gold}`} accent />
            <StatLine label="CHESTS FOUND" value={String(session.chests)} />
            <StatLine label="CARDS FOUND" value={String(session.cards)} />
            <StatLine label="MVP WEAPON" value={session.mvp || 'NONE'} />
          </div>
        </Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn variant="primary" size="lg" onClick={onNext} glow block>{isMajor ? 'NEXT REALM' : 'NEXT STAGE'}</Btn>
          <Btn variant="secondary" size="sm" onClick={onExit} block>RETURN TO TITLE</Btn>
        </div>
      </Panel>
    </Overlay>
  );
}

function StatLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <GlyphText size={11} color={TOKENS.color.inkMuted} letterSpacing={1}>{label}</GlyphText>
      <GlyphText size={14} color={accent ? TOKENS.color.accent : TOKENS.color.ink} outline={TOKENS.color.outline} outlineWidth={2}>{value}</GlyphText>
    </div>
  );
}

// ================== DEFEAT ==================
function DefeatScreen({ session, waves, reviveUsed, onRevive, onRetry, onExit }: any) {
  return (
    <Overlay onClose={undefined}>
      <Panel color="#1e2a3f" padding={24} glow={TOKENS.color.bad} style={{ width: 360, textAlign: 'center' }}>
        <SkullIcon size={64} color="#e2e8f0" />
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <GlyphText size={36} color={TOKENS.color.bad} outline={TOKENS.color.outline} outlineWidth={4} letterSpacing={3}>DEFEAT</GlyphText>
        </div>
        <div style={{ marginBottom: 12 }}>
          <GlyphText size={12} color={TOKENS.color.inkMuted}>THE CITADEL HAS FALLEN</GlyphText>
        </div>
        <Panel color="#0a0f1a" padding={12} bevel="none" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <StatLine label="WAVES SURVIVED" value={`${waves.cur} / ${waves.total}`} />
            <StatLine label="ENEMIES DEFEATED" value={String(session.kills)} accent />
            <StatLine label="GOLD RETAINED" value={String(session.gold)} />
          </div>
        </Panel>
        {!reviveUsed && (
          <div style={{ marginBottom: 8 }}>
            <Btn variant="primary" size="md" onClick={onRevive} glow block>WATCH AD TO REVIVE (30 PERCENT HP)</Btn>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="good" size="md" onClick={onRetry} block>RETRY STAGE</Btn>
          <Btn variant="secondary" size="md" onClick={onExit} block>TITLE</Btn>
        </div>
      </Panel>
    </Overlay>
  );
}

// ================== CHEST REVEAL ==================
function ChestReveal({ chest, reward, onClaim }: any) {
  return (
    <Panel color="#1e2a3f" padding={24} glow={RARITY_COLOR[chest.rarity]} style={{ width: 340, textAlign: 'center' }}>
      <div style={{ animation: 'rise 0.4s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ animation: 'pulseGlow 2s infinite' }}>
          <ChestIcon size={80} accent={RARITY_COLOR[chest.rarity]} />
        </div>
        <GlyphText size={22} color={RARITY_COLOR[chest.rarity]} outline={TOKENS.color.outline} outlineWidth={3} letterSpacing={3}>
          {`${chest.rarity.toUpperCase()} CHEST OPENED`}
        </GlyphText>
        <Panel color="#0a0f1a" padding={16} bevel="none">
          <GlyphText size={16} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={2} letterSpacing={2}>{reward}</GlyphText>
        </Panel>
        <Btn variant="primary" size="md" onClick={onClaim}>CLAIM</Btn>
      </div>
    </Panel>
  );
}

// ================== AD SCREENS ==================
function AdCountScreen({ count }: any) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 16 }}>
      <GlyphText size={14} color={TOKENS.color.inkMuted} letterSpacing={3}>INTERMISSION</GlyphText>
      <div style={{ transform: `scale(${1 + (3 - count) * 0.05})`, transition: 'transform 0.3s' }}>
        <GlyphText size={120} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={8}>{String(count)}</GlyphText>
      </div>
      <GlyphText size={12} color={TOKENS.color.inkDim} letterSpacing={2}>AD STARTING</GlyphText>
    </div>
  );
}

function AdPlayScreen() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 16 }}>
      <GlyphText size={12} color={TOKENS.color.inkMuted} letterSpacing={2}>AD BREAK</GlyphText>
      <div style={{ animation: 'spinSlow 1.5s linear infinite' }}>
        <GearIcon size={64} />
      </div>
      <GlyphText size={11} color={TOKENS.color.inkDim} letterSpacing={1}>YOUR PROGRESS IS SAFE</GlyphText>
    </div>
  );
}

// ================== HOW TO PLAY ==================
function HowToScreen({ onClose }: any) {
  const sections: [string, string][] = [
    ['THE GOAL', 'DEFEND THE CITADEL AT THE END OF THE PATH FOR ALL WAVES. IF ITS HEALTH REACHES ZERO YOU LOSE.'],
    ['TOWERS', 'SPEND GOLD TO PLACE TOWERS ON GRASS TILES. CLICK A PLACED TOWER TO UPGRADE OR SELL IT. KEYS 1 TO 5 SELECT TOWERS. SPACE STARTS THE NEXT WAVE.'],
    ['WAVES', 'PRESS THE WAVE BUTTON TO SEND THE NEXT WAVE. EACH CLEARED WAVE GIVES BONUS GOLD.'],
    ['CARDS', 'ENEMIES DROP CARDS. CLICK A CARD IN THE TOP SHELF TO PLAY A PUZZLE. SOLVING IT GIVES A KEY.'],
    ['CHESTS', 'ENEMIES ALSO DROP CHESTS. USE A KEY TO OPEN A CHEST FOR GOLD, BLUEPRINTS, OR RARE ITEMS.'],
    ['REALMS', 'EVERY SIX STAGES IS A MAJOR STAGE. CLEAR IT TO ENTER A NEW REALM WITH NEW ENEMIES AND MUSIC. RUNS ARE INFINITE.'],
    ['CONTROLS', 'MOUSE OR TOUCH TO PLACE AND SELECT. USE 1X 2X OR 3X TO SPEED THE BATTLE. ESC OR P TO PAUSE.'],
  ];
  return (
    <Panel color="#1e2a3f" padding={20} style={{ maxWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={26} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={3} letterSpacing={2}>HOW TO PLAY</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map(([title, body]) => (
          <div key={title}>
            <GlyphText size={14} color={TOKENS.color.accent} letterSpacing={2}>{title}</GlyphText>
            <div style={{ marginTop: 4 }}>
              <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>{body}</GlyphText>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ================== LEGAL ==================
function LegalScreen({ tab, setTab, onClose }: any) {
  return (
    <Panel color="#1e2a3f" padding={20} style={{ maxWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={3} letterSpacing={2}>LEGAL AND COMPLIANCE</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <Btn variant={tab === 'copyright' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('copyright')}>COPYRIGHT</Btn>
        <Btn variant={tab === 'terms' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('terms')}>TERMS</Btn>
        <Btn variant={tab === 'privacy' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('privacy')}>PRIVACY</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tab === 'copyright' && (
          <>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>{`PRESERVE EVERYTHING. COPYRIGHT ${new Date().getFullYear()}. ALL ORIGINAL ARTWORK, CODE, UI DESIGN, TEXT, LORE AND AUDIO SYNTHESIS ARE THE ORIGINAL AUTHORSHIP OF THE GAME CREATORS.`}</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>ALL VISUALS ARE RENDERED PROCEDURALLY AT RUNTIME VIA HTML5 CANVAS AND SVG. NO THIRD PARTY IMAGES OR FONTS ARE USED. THE PRESERVE SANS TYPEFACE IS CUSTOM CREATED FROM VECTOR PATHS.</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>BUILT WITH OPEN SOURCE WEB TECHNOLOGIES: REACT, VITE, TYPESCRIPT, TAILWIND (MIT LICENSES). WEB AUDIO API FOR ZERO ASSET SYNTHESIS. NO COPYRIGHTED MATERIAL IS REPRODUCED.</GlyphText>
          </>
        )}
        {tab === 'terms' && (
          <>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>BY PLAYING PRESERVE EVERYTHING YOU AGREE THAT THE GAME IS PROVIDED AS IS WITHOUT WARRANTY. YOU MAY NOT SCRAPE, REPRODUCE OR REDISTRIBUTE ORIGINAL ASSETS FOR COMMERCIAL CLONE USE WITHOUT PERMISSION.</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>GAMEPLAY IS FREE. VOLUNTARY REWARDED ADS MAY BE OFFERED BY THIRD PARTY PLATFORMS WHEN HOSTED ON PORTALS. THIS GAME DOES NOT SERVE ADS IN STANDALONE PLAY. ALL AD OFFERS ARE OPT IN.</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>HIGH SCORES AND SAVE DATA ARE STORED LOCALLY ON YOUR DEVICE AND ARE NOT SENT TO ANY SERVER BY THIS GAME.</GlyphText>
          </>
        )}
        {tab === 'privacy' && (
          <>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>GDPR AND CCPA COMPLIANCE. PRESERVE EVERYTHING STORES ONLY NON IDENTIFIABLE LOCAL DATA IN YOUR BROWSER LOCAL STORAGE: UNLOCKED TOWERS, BEST ROUND, TOTAL KILLS, VOLUME PREFERENCES, AND IN PROGRESS RUN STATE. THIS DATA NEVER LEAVES YOUR DEVICE.</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>THIS GAME DOES NOT SET FIRST PARTY COOKIES, DOES NOT PERFORM TRACKING OR ANALYTICS, AND DOES NOT COLLECT PERSONAL INFORMATION.</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>WHEN HOSTED ON THIRD PARTY H5 PORTALS (POKI, CRAZYGAMES, GAMEDISTRIBUTION, TELEGRAM), THOSE PLATFORMS MAY OPERATE THEIR OWN SDKS. THIS GAME INITIALIZES THE HOST SDK BUT DOES NOT TRANSMIT PERSONAL DATA ITSELF.</GlyphText>
            <GlyphText size={12} color={TOKENS.color.ink} letterSpacing={1}>YOU MAY CLEAR ALL SAVED DATA ANY TIME FROM YOUR BROWSER SETTINGS.</GlyphText>
          </>
        )}
      </div>
    </Panel>
  );
}

// ================== SETTINGS ==================
function SettingsScreen({ save, setSave, onClose }: any) {
  return (
    <Panel color="#1e2a3f" padding={20} style={{ minWidth: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={3} letterSpacing={2}>SETTINGS</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlyphText size={14} color={TOKENS.color.ink}>SFX</GlyphText>
          <Btn variant={save.muteSfx ? 'secondary' : 'good'} size="sm" onClick={() => setSave((s: SaveData) => ({ ...s, muteSfx: !s.muteSfx }))}>{save.muteSfx ? 'OFF' : 'ON'}</Btn>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlyphText size={14} color={TOKENS.color.ink}>MUSIC</GlyphText>
          <Btn variant={save.muteBgm ? 'secondary' : 'good'} size="sm" onClick={() => setSave((s: SaveData) => ({ ...s, muteBgm: !s.muteBgm }))}>{save.muteBgm ? 'OFF' : 'ON'}</Btn>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <GlyphText size={14} color={TOKENS.color.ink}>MASTER VOLUME</GlyphText>
            <GlyphText size={12} color={TOKENS.color.accent}>{`${Math.round(save.masterVolume * 100)}%`}</GlyphText>
          </div>
          <input
            type="range" min="0" max="1" step="0.05" value={save.masterVolume}
            onChange={(e) => setSave((s: SaveData) => ({ ...s, masterVolume: parseFloat(e.target.value) }))}
            style={{ width: '100%', accentColor: TOKENS.color.accent }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Btn variant="bad" size="sm" onClick={() => { if (confirm('Delete all save data?')) { localStorage.removeItem('preserve-everything-save-v1'); location.reload(); } }} block>
            RESET ALL PROGRESS
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

// ================== SCORES ==================
function ScoresScreen({ save, onClose }: any) {
  const scores = save.highScores.length > 0 ? save.highScores : [{ name: 'NO SCORES YET', score: 0, round: 0, when: Date.now() }];
  return (
    <Panel color="#1e2a3f" padding={20} style={{ minWidth: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent} outline={TOKENS.color.outline} outlineWidth={3} letterSpacing={2}>HIGH SCORES</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <Panel color="#0a0f1a" padding={12} bevel="none">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {scores.map((s: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: i === 0 ? 'rgba(251,191,36,0.1)' : 'transparent', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GlyphText size={14} color={i === 0 ? TOKENS.color.accent : TOKENS.color.inkMuted} letterSpacing={1}>{`${i + 1}.`}</GlyphText>
                <GlyphText size={12} color={TOKENS.color.ink}>{s.name}</GlyphText>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <GlyphText size={11} color={TOKENS.color.inkMuted}>{`R${s.round}`}</GlyphText>
                <GlyphText size={14} color={i === 0 ? TOKENS.color.accent : TOKENS.color.ink} outline={TOKENS.color.outline} outlineWidth={2}>{String(s.score)}</GlyphText>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Panel>
  );
}

// ================== TITLE BACKGROUND ==================
function drawTitleBackground(ctx: CanvasRenderingContext2D, cam: any, time: number) {
  const g = ctx.createLinearGradient(0, 0, 0, cam.screenH);
  g.addColorStop(0, '#1e293b');
  g.addColorStop(1, '#0a0f1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.screenW, cam.screenH);
  // Grid
  ctx.strokeStyle = 'rgba(74,222,128,0.06)';
  ctx.lineWidth = 1;
  const step = 40;
  const off = (time * 20) % step;
  ctx.beginPath();
  for (let x = -off; x < cam.screenW + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x + cam.screenH * 0.3, cam.screenH); }
  ctx.stroke();
  ctx.beginPath();
  for (let y = -off; y < cam.screenH + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(cam.screenW, y + cam.screenH * 0.05); }
  ctx.stroke();
  void drawPanel; void drawText; void roundedRect;
}

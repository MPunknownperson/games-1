import io, sys

p = 'src/App.tsx'
s = io.open(p, encoding='utf-8').read()

# 1. Fix handlers in App body
s = s.replace('const onpointer = useCallback(', 'const onPointer = useCallback(')
s = s.replace('const onmove = useCallback(', 'const onMove = useCallback(')
s = s.replace('const closechest = useCallback(', 'const closeChest = useCallback(')
s = s.replace('const upgradesel = useCallback(', 'const upgradeSel = useCallback(')
s = s.replace('const sellsel = useCallback(', 'const sellSel = useCallback(')
s = s.replace('const togglespeed = useCallback(', 'const toggleSpeed = useCallback(')

# 2. Fix canvas & HUD JSX
s = s.replace('onClick={(e) => onpointer(e.clientX, e.clientY, e.shiftKey)}', 'onClick={(e) => onPointer(e.clientX, e.clientY, e.shiftKey)}')
s = s.replace('onMouseMove={(e) => onmove(e.clientX, e.clientY)}', 'onMouseMove={(e) => onMove(e.clientX, e.clientY)}')
s = s.replace('onmove(t.clientX, t.clientY);', 'onMove(t.clientX, t.clientY);')
s = s.replace('onpointer(t.clientX, t.clientY, false);', 'onPointer(t.clientX, t.clientY, false);')

s = s.replace('onSpeed={togglespeed}', 'onSpeed={toggleSpeed}')
s = s.replace('TOWERS={selectedTower}', 'tower={selectedTower}')
s = s.replace('onUpgrade={upgradesel}', 'onUpgrade={upgradeSel}')
s = s.replace('onSell={sellsel}', 'onSell={sellSel}')
s = s.replace('<Overlay onClose={closechest}>', '<Overlay onClose={closeChest}>')
s = s.replace('onClaim={closechest}', 'onClaim={closeChest}')

# 3. Find where subcomponents start
marker = "// ================== title =================="
if marker not in s:
    print("Marker not found!")
    sys.exit(1)

head = s[:s.index(marker)]

new_subcomponents = r"""// ================== TITLE SCREEN ==================
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
  const t = useUiTheme();
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 24%, ${t.glassStrong}, ${t.vignette[1]} 76%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 24 }}>
      {/* Background ambient stars */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.15, pointerEvents: 'none' }}>
        {Array.from({ length: 40 }, (_, i) => {
          const angle = (i * 137) % 360;
          const dist = 20 + (i * 23) % 60;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${50 + Math.cos(angle) * dist}%`,
                top: `${50 + Math.sin(angle) * dist}%`,
                width: 2, height: 2, borderRadius: '50%', background: TOKENS.color.accent,
                boxShadow: `0 0 ${4 + (i % 4) * 2}px ${TOKENS.color.accent}`,
                animation: `pulseGlow ${2 + (i % 3)}s ease-in-out infinite`,
              }}
            />
          );
        })}
      </div>

      <div style={{ animation: 'rise 0.5s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 520, zIndex: 2 }}>
        <div style={{ animation: 'pulseGlow 3s ease-in-out infinite' }}>
          <LogoMark size={110} />
        </div>

        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <GlyphText size={42} color={TOKENS.color.accent} outline="#0d1220" outlineWidth={3} shadow={{ color: '#78350f', dx: 2, dy: 2 }}>
            Preserve Everything
          </GlyphText>
          <GlyphText size={15} color={TOKENS.color.inkMuted} variant="body">
            A 2.5D Isometric Citadel Defense Across Infinite Realms
          </GlyphText>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, width: 300 }}>
          <Btn variant="primary" size="lg" onClick={onStart} glow block>
            Begin Journey
          </Btn>
          {save.currentRun && (
            <Btn variant="secondary" size="md" onClick={onContinue} block>
              {`Continue — Round ${save.currentRun.round} · Stage ${save.currentRun.minor}`}
            </Btn>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Btn variant="secondary" size="sm" onClick={onHowTo} style={{ flex: 1 }}>How to Play</Btn>
            <Btn variant="secondary" size="sm" onClick={onScores} style={{ flex: 1 }}>Scores</Btn>
            <Btn variant="secondary" size="sm" onClick={onSettings} style={{ flex: 1 }}>Settings</Btn>
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip icon={<CrownIcon size={16} />} label="Best Realm" value={`Round ${save.bestRound}`} />
          <Chip icon={<SkullIcon size={16} />} label="Foes Vanquished" value={String(save.totalKills)} />
          <Chip icon={<StarIcon size={16} />} label="High Score" value={String(save.bestScore)} />
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'center' }}>
          <Btn variant="ghost" size="sm" onClick={onLegal}>Legal & Compliance</Btn>
          <Btn variant="ghost" size="sm" onClick={onMute}>{save.muteSfx ? 'Sound Muted' : 'Sound Active'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ================== TOP HUD ==================
interface TopHudProps {
  gold: number;
  hp: { hp: number; max: number };
  keys: number;
  inv: { chests: Chest[]; cards: Card[]; keys: number };
  openCard: (c: Card) => void;
  openChest: (c: Chest) => void;
  stageLabel: { round: number; minor: number; theme: string };
  waveInfo: { cur: number; total: number };
  onPause: () => void;
  onSpeed: () => void;
  speedMult: number;
  paused: boolean;
}

function TopHud({ gold, hp, keys, inv, openCard, openChest, stageLabel, waveInfo, onPause, onSpeed, speedMult, paused }: TopHudProps) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15, padding: 12, display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 8, gap: 10, pointerEvents: 'none' }}>
      {/* Treasury & Citadel Health */}
      <Panel padding="8px 12px" style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Chip icon={<CoinIcon size={20} />} value={`${gold} Gold`} color="#fbbf24" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <HeartIcon size={18} color="#ef4444" />
            <HBar pct={hp.hp / hp.max} width={100} height={14} showValue={`${hp.hp} / ${hp.max} HP`} />
          </div>
          <Chip icon={<KeyIcon size={16} />} label="Keys" value={String(keys)} color="#fef08a" />
        </div>
      </Panel>

      {/* Loot Shelf: Cards & Chests */}
      <Panel padding="6px 12px" style={{ pointerEvents: 'auto', maxWidth: '44vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 32 }}>
          {inv.cards.slice(0, 6).map((c: Card) => (
            <button
              key={c.id}
              onClick={() => openCard(c)}
              title={`${c.kind} puzzle — solve to earn a key`}
              style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', borderRadius: 6, filter: `drop-shadow(0 0 6px ${RARITY_COLOR[c.rarity]}88)`, transition: 'transform 0.1s' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
            >
              <CardIcon size={30} color={RARITY_COLOR[c.rarity]} />
            </button>
          ))}
          {inv.cards.length > 6 && <GlyphText size={12} color={TOKENS.color.inkMuted}>{`+${inv.cards.length - 6}`}</GlyphText>}

          {inv.chests.slice(0, 6).map((c: Chest) => (
            <button
              key={c.id}
              onClick={() => openChest(c)}
              title={`${c.rarity} chest — requires 1 key`}
              style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', borderRadius: 6, filter: `drop-shadow(0 0 6px ${RARITY_COLOR[c.rarity]}88)`, transition: 'transform 0.1s' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
            >
              <ChestIcon size={30} accent={RARITY_COLOR[c.rarity]} />
            </button>
          ))}
          {inv.chests.length > 6 && <GlyphText size={12} color={TOKENS.color.inkMuted}>{`+${inv.chests.length - 6}`}</GlyphText>}

          {inv.cards.length === 0 && inv.chests.length === 0 && (
            <GlyphText size={12} color={TOKENS.color.inkDim} variant="body">
              Enemies drop puzzle cards and treasure chests
            </GlyphText>
          )}
        </div>
      </Panel>

      {/* Realm & Wave Banner */}
      <div style={{ flex: '1 1 180px', minWidth: 0, textAlign: 'center', pointerEvents: 'none' }}>
        <Panel tone="deep" padding="6px 16px" style={{ display: 'inline-block' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <GlyphText size={12} color={TOKENS.color.inkMuted}>
              {`Round ${stageLabel.round} · Stage ${stageLabel.minor} of 6`}
            </GlyphText>
            <GlyphText size={16} color={TOKENS.color.accent}>
              {`${stageLabel.theme} — Wave ${waveInfo.cur === 0 ? 1 : waveInfo.cur} of ${waveInfo.total}`}
            </GlyphText>
          </div>
        </Panel>
      </div>

      {/* Battle Controls */}
      <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <Btn variant="secondary" size="sm" onClick={onSpeed} title="Toggle Battle Speed">
          {`${speedMult}× Speed`}
        </Btn>
        <Btn variant="secondary" size="sm" onClick={onPause} title="Pause Game (Esc / P)">
          {paused ? <PlayIcon size={16} color="#e2e8f0" /> : <PauseIcon size={16} />}
        </Btn>
      </div>
    </div>
  );
}

// ================== BOTTOM SHOP ==================
interface BottomShopProps {
  unlocked: TowerKind[];
  gold: number;
  selectedKind: TowerKind | null;
  setSelectedKind: (k: TowerKind | null) => void;
  setSelectedId: (id: number | null) => void;
  waveActive: boolean;
  waveInfo: { cur: number; total: number };
  onStartWave: () => void;
}

function BottomShop({ unlocked, gold, selectedKind, setSelectedKind, setSelectedId, waveActive, waveInfo, onStartWave }: BottomShopProps) {
  const t = useUiTheme();
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15, padding: 14, display: 'flex', justifyContent: 'center', pointerEvents: 'none', overflowX: 'auto', maxWidth: '100vw' }}>
      <Panel padding={10} style={{ pointerEvents: 'auto', flexShrink: 0, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          {(['archer', 'mortar', 'chill', 'prism', 'storm'] as TowerKind[])
            .filter((k) => unlocked.includes(k))
            .map((k, i) => {
              const def = TOWERS[k];
              const canAfford = gold >= def.cost;
              const sel = selectedKind === k;
              const IconComp = TOWER_ICONS[k];
              return (
                <button
                  key={k}
                  onClick={() => {
                    audio.click();
                    setSelectedKind(sel ? null : k);
                    setSelectedId(null);
                  }}
                  disabled={!canAfford}
                  title={`${def.name}: ${def.desc} (Press ${i + 1})`}
                  style={{
                    width: 82, height: 104, borderRadius: 12,
                    background: sel
                      ? `linear-gradient(180deg, ${lighten(def.color, 0.24)}, ${def.color})`
                      : `linear-gradient(180deg, ${t.panelTop}, ${t.panelBottom})`,
                    border: `2px solid ${sel ? def.accent : canAfford ? t.frame : '#1e293b'}`,
                    opacity: canAfford ? 1 : 0.45,
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    padding: '6px 4px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: sel
                      ? `0 0 18px ${def.color}88, 0 4px 0 rgba(0,0,0,0.4)`
                      : '0 3px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                    position: 'relative',
                    transition: 'transform 0.05s, border-color 0.15s',
                  }}
                >
                  <div style={{ position: 'absolute', top: 3, right: 5, fontSize: 11, color: t.inkDim, fontWeight: 700 }}>
                    {`[${i + 1}]`}
                  </div>
                  <IconComp size={42} />
                  <GlyphText size={12} color="#f8fafc">
                    {def.name}
                  </GlyphText>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <CoinIcon size={13} />
                    <GlyphText size={13} color={canAfford ? TOKENS.color.accent : TOKENS.color.bad} raw>
                      {`${def.cost}g`}
                    </GlyphText>
                  </div>
                </button>
              );
            })}

          {/* Send Wave Action Button */}
          <div style={{ marginLeft: 6 }}>
            <button
              onClick={onStartWave}
              disabled={waveActive}
              style={{
                width: 112, height: 104, borderRadius: 12,
                background: waveActive
                  ? `linear-gradient(180deg, ${t.panelTop}, ${t.panelBottom})`
                  : `linear-gradient(180deg, ${lighten(t.good, 0.28)}, ${t.good})`,
                border: `2px solid ${waveActive ? t.frame : '#14532d'}`,
                opacity: waveActive ? 0.55 : 1,
                cursor: waveActive ? 'not-allowed' : 'pointer',
                padding: 6,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: waveActive
                  ? '0 3px 0 rgba(0,0,0,0.4)'
                  : '0 4px 0 #052e16, 0 0 20px #4ade8066, inset 0 1px 0 rgba(255,255,255,0.35)',
                animation: waveActive ? 'none' : 'pulseGlow 2s ease-in-out infinite',
              }}
            >
              <PlayIcon size={28} color={waveActive ? t.inkDim : '#062b12'} />
              <GlyphText size={14} color={waveActive ? t.inkDim : '#062b12'}>
                {waveActive ? 'In Battle' : `Wave ${waveInfo.cur === 0 ? 1 : waveInfo.cur + 1}`}
              </GlyphText>
            </button>
          </div>
        </div>
      </Panel>
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
}

function TowerPanel({ tower, game, gold, onClose, onUpgrade, onSell }: TowerPanelProps) {
  const def = TOWERS[tower.kind];
  const st = game.towerStats(tower);
  const cost = game.upgradeCost(tower);
  const IconComp = TOWER_ICONS[tower.kind];
  return (
    <Panel padding={16} ornate style={{ width: 260 }} glow={def.color}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconComp size={32} />
          <div>
            <GlyphText size={18} color={def.color}>{def.name}</GlyphText>
            <div style={{ fontSize: 11, color: TOKENS.color.inkMuted }}>{`Level ${tower.level} of 4`}</div>
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={onClose}>×</Btn>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        <StatRow label="Damage" value={String(Math.floor(st.damage))} />
        <StatRow label="Range" value={st.range.toFixed(1)} />
        <StatRow label="Attack Rate" value={`${st.fireRate.toFixed(1)}/s`} />
        {st.splash && <StatRow label="Splash Radius" value={st.splash.toFixed(1)} />}
        {st.slow && <StatRow label="Frost Slow" value={`${Math.floor(st.slow * 100)}%`} />}
        {st.chain && <StatRow label="Chain Targets" value={String(st.chain)} />}
        <StatRow label="Total Kills" value={String(tower.kills)} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="good" size="sm" onClick={onUpgrade} disabled={tower.level >= 4 || gold < cost} block>
          {tower.level >= 4 ? 'Max Level' : `Upgrade (${cost}g)`}
        </Btn>
        <Btn variant="bad" size="sm" onClick={onSell}>Sell</Btn>
      </div>
    </Panel>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <GlyphText size={12} color={TOKENS.color.inkMuted}>{label}</GlyphText>
      <GlyphText size={13} color={TOKENS.color.ink} raw>{value}</GlyphText>
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
      <Panel padding={24} ornate style={{ minWidth: 320, textAlign: 'center' }}>
        <div style={{ marginBottom: 18 }}>
          <GlyphText size={32} color={TOKENS.color.accent}>
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
          <CrownIcon size={64} />
        </div>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <GlyphText size={36} color={TOKENS.color.accent}>
            Victory Achieved!
          </GlyphText>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ opacity: i < stars ? 1 : 0.25, animation: i < stars ? 'pulseGlow 2s infinite' : 'none' }}>
              <StarIcon size={38} filled={i < stars} />
            </div>
          ))}
        </div>

        <Panel tone="deep" padding={14} bevel="none" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatLine label="Enemies Defeated" value={String(session.kills)} />
            <StatLine label="Gold Earned" value={`+${session.gold}`} accent />
            <StatLine label="Chests Found" value={String(session.chests)} />
            <StatLine label="Puzzle Cards Found" value={String(session.cards)} />
            <StatLine label="MVP Weapon" value={session.mvp || 'None'} />
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
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <GlyphText size={13} color={TOKENS.color.inkMuted}>{label}</GlyphText>
      <GlyphText size={14} color={accent ? TOKENS.color.accent : TOKENS.color.ink} raw>{value}</GlyphText>
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
        <SkullIcon size={64} color="#f87171" />
        <div style={{ marginTop: 8, marginBottom: 6 }}>
          <GlyphText size={36} color={TOKENS.color.bad}>
            Citadel Fallen
          </GlyphText>
        </div>
        <div style={{ marginBottom: 14 }}>
          <GlyphText size={14} color={TOKENS.color.inkMuted} variant="body">
            The enemy breached your defenses
          </GlyphText>
        </div>

        <Panel tone="deep" padding={14} bevel="none" style={{ marginBottom: 14 }}>
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
      <div style={{ animation: 'rise 0.4s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ animation: 'pulseGlow 2s infinite' }}>
          <ChestIcon size={84} accent={RARITY_COLOR[chest.rarity]} />
        </div>
        <GlyphText size={24} color={RARITY_COLOR[chest.rarity]}>
          {`${rarityTitle} Chest Opened`}
        </GlyphText>
        <Panel tone="deep" padding={16} bevel="none" style={{ width: '100%' }}>
          <GlyphText size={17} color={TOKENS.color.accent} raw>
            {reward}
          </GlyphText>
        </Panel>
        <Btn variant="primary" size="md" onClick={onClaim} glow style={{ minWidth: 140 }}>
          Claim Reward
        </Btn>
      </div>
    </Panel>
  );
}

// ================== AD SCREENS ==================
function AdCountScreen({ count }: { count: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 16 }}>
      <GlyphText size={18} color={TOKENS.color.inkMuted}>Intermission</GlyphText>
      <div style={{ transform: `scale(${1 + (3 - count) * 0.05})`, transition: 'transform 0.3s' }}>
        <GlyphText size={110} color={TOKENS.color.accent} raw>{String(count)}</GlyphText>
      </div>
      <GlyphText size={14} color={TOKENS.color.inkDim} variant="body">Ad starting in a moment...</GlyphText>
    </div>
  );
}

function AdPlayScreen() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 16 }}>
      <GlyphText size={16} color={TOKENS.color.inkMuted}>Sponsored Break</GlyphText>
      <div style={{ animation: 'spinSlow 1.5s linear infinite' }}>
        <GearIcon size={64} />
      </div>
      <GlyphText size={13} color={TOKENS.color.inkDim} variant="body">Your game progress is safe</GlyphText>
    </div>
  );
}

// ================== HOW TO PLAY ==================
function HowToScreen({ onClose }: { onClose: () => void }) {
  const sections: [string, string][] = [
    ['Objective', 'Defend the citadel at the end of the path across all waves. If citadel health reaches zero, the realm falls.'],
    ['Tower Placement', 'Spend gold to place defense towers on tiles beside the path. Click any placed tower to view its range, upgrade its power, or sell it for gold. Keyboard keys 1 to 5 select towers quickly.'],
    ['Waves & Combat', 'Press the Wave button or hit Spacebar to start incoming monster waves. Clearing each wave awards bonus gold crowns and kill-streak bonuses.'],
    ['Cards & Puzzles', 'Enemies occasionally drop mysterious puzzle cards. Open them from your top inventory to solve mini-games and earn Citadel Keys.'],
    ['Treasure Chests', 'Rare enemies drop sealed treasure chests. Use Citadel Keys to unlock them for gold, new tower blueprints, and rare artifacts.'],
    ['Realms & Progression', 'Every 6 stages constitutes a complete realm with unique terrain, atmospheric particles, and boss encounters. Runs progress infinitely.'],
    ['Controls', 'Mouse or touch to place and inspect towers. Toggle 1×, 2×, or 3× battle speed anytime. Press Esc or P to pause.'],
  ];
  return (
    <Panel padding={22} ornate style={{ maxWidth: 540, maxHeight: '85vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>How to Play</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sections.map(([title, body]) => (
          <div key={title} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
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
    <Panel padding={22} ornate style={{ maxWidth: 540, maxHeight: '85vh', overflow: 'auto' }}>
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
              Visuals are rendered procedurally at runtime via HTML5 Canvas, SVG icons, and a custom-designed TrueType typeface. No third-party copyrighted assets are reproduced.
            </GlyphText>
            <GlyphText size={13} color={TOKENS.color.ink} variant="body">
              Built with open-source web technologies: React, Vite, TypeScript, and Tailwind CSS (MIT Licenses). Audio is synthesized dynamically via the Web Audio API with zero external audio samples.
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
              GDPR and CCPA Compliance: Preserve Everything stores only non-identifiable local preference data on your device: unlocked towers, best round, total kills, volume levels, and active run state. This data never leaves your browser.
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
    <Panel padding={22} ornate style={{ minWidth: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>Settings</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlyphText size={14} color={TOKENS.color.ink}>Sound Effects</GlyphText>
          <Btn variant={save.muteSfx ? 'secondary' : 'good'} size="sm" onClick={() => setSave((s) => ({ ...s, muteSfx: !s.muteSfx }))}>
            {save.muteSfx ? 'Muted' : 'Enabled'}
          </Btn>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlyphText size={14} color={TOKENS.color.ink}>Background Music</GlyphText>
          <Btn variant={save.muteBgm ? 'secondary' : 'good'} size="sm" onClick={() => setSave((s) => ({ ...s, muteBgm: !s.muteBgm }))}>
            {save.muteBgm ? 'Muted' : 'Enabled'}
          </Btn>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <GlyphText size={14} color={TOKENS.color.ink}>Master Volume</GlyphText>
            <GlyphText size={13} color={TOKENS.color.accent} raw>{`${Math.round(save.masterVolume * 100)}%`}</GlyphText>
          </div>
          <input
            type="range" min="0" max="1" step="0.05" value={save.masterVolume}
            onChange={(e) => setSave((s) => ({ ...s, masterVolume: parseFloat(e.target.value) }))}
            style={{ width: '100%', accentColor: TOKENS.color.accent }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Btn
            variant="bad" size="sm"
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
  const scores = save.highScores.length > 0 ? save.highScores : [{ name: 'No scores yet', score: 0, round: 0, when: Date.now() }];
  return (
    <Panel padding={22} ornate style={{ minWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <GlyphText size={24} color={TOKENS.color.accent}>High Scores</GlyphText>
        <Btn variant="ghost" size="sm" onClick={onClose}><CloseIcon size={20} /></Btn>
      </div>
      <Panel tone="deep" padding={12} bevel="none">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {scores.map((s: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: i === 0 ? 'rgba(251,191,36,0.12)' : 'transparent', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GlyphText size={14} color={i === 0 ? TOKENS.color.accent : TOKENS.color.inkMuted} raw>{`${i + 1}.`}</GlyphText>
                <GlyphText size={14} color={TOKENS.color.ink}>{s.name}</GlyphText>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <GlyphText size={12} color={TOKENS.color.inkMuted}>{`Round ${s.round}`}</GlyphText>
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
function DevPanel({ dev, tests, onRunTests, onAction, onClose }: { dev: DevTools; tests: TestResult[] | null; onRunTests: () => void; onAction: () => void; onClose: () => void }) {
  const s = dev.stats();
  const act = (fn: () => void) => { fn(); onAction(); };
  const devBtn: React.CSSProperties = {
    background: '#1e293b', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', letterSpacing: 0.3,
  };
  return (
    <div style={{ position: 'absolute', top: 64, left: 10, zIndex: 60, width: 260, maxHeight: 'calc(100vh - 140px)', overflow: 'auto' }}>
      <Panel tone="deep" padding={12} glow="#38bdf8">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <GlyphText size={14} color="#38bdf8">Dev Tools</GlyphText>
          <Btn variant="ghost" size="sm" onClick={onClose}>×</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8, fontSize: 11, color: TOKENS.color.inkMuted }}>
          <span>Gold: {s.gold}</span><span>HP: {s.hp}/{s.maxHp}{s.god ? ' (God)' : ''}</span>
          <span>Wave: {s.wave}/{s.waveTotal}</span><span>Foes: {s.enemies}</span>
          <span>Towers: {s.towers}</span><span>Kills: {s.kills}</span>
          <span>Leaks: {s.leaks}</span><span>Pressure: {s.pressure.toFixed(2)}×</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <button style={devBtn} onClick={() => act(() => dev.addGold(100))}>+100 Gold</button>
          <button style={devBtn} onClick={() => act(() => dev.heal())}>Heal HP</button>
          <button style={devBtn} onClick={() => act(() => dev.setGod(!dev.god))}>{dev.god ? 'God: ON' : 'God: OFF'}</button>
          <button style={devBtn} onClick={() => act(() => dev.game.startNextWave())}>Start Wave</button>
          <button style={devBtn} onClick={() => act(() => dev.clearWave())}>Clear Wave</button>
          <button style={devBtn} onClick={() => act(() => dev.killAll())}>Kill All</button>
          <button style={devBtn} onClick={() => act(() => dev.step(1))}>Step 1s</button>
          <button style={devBtn} onClick={() => act(() => dev.setSeed(1))}>Seed 1</button>
          <button style={devBtn} onClick={() => act(() => { navigator.clipboard?.writeText(dev.snapshot()).catch(() => {}); })}>Snapshot</button>
          <button style={devBtn} onClick={() => act(() => { const t = window.prompt('Paste snapshot JSON'); if (t) dev.restore(t); })}>Restore</button>
          <button style={{ ...devBtn, background: '#7c2d12' }} onClick={onRunTests}>Run Tests</button>
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: TOKENS.color.inkDim, marginBottom: 3 }}>Spawn Monster:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {DEV_ENEMY_KINDS.map((k) => (
              <button key={k} style={devBtn} onClick={() => act(() => dev.spawn(k, dev.game.path.total * 0.3))}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {tests && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            <div style={{ fontSize: 10, color: TOKENS.color.inkDim }}>Self-Test Suite:</div>
            {tests.map((t, i) => (
              <div key={i} style={{ fontSize: 10, color: t.pass ? '#4ade80' : '#ef4444' }}>
                {t.pass ? '✓' : '✗'} {t.name}{t.pass ? '' : `: ${t.detail}`}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ================== TITLE BACKGROUND ==================
function drawTitleBackground(ctx: CanvasRenderingContext2D, cam: any, time: number) {
  const g = ctx.createLinearGradient(0, 0, 0, cam.screenH);
  g.addColorStop(0, '#141d33');
  g.addColorStop(1, HOME_PALETTE.vignette[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.screenW, cam.screenH);

  // Celestial body and stars echo the in-realm sky so the title matches play
  drawSky(ctx, cam, HOME_PALETTE, time);

  // Grid
  ctx.strokeStyle = 'rgba(74,222,128,0.06)';
  ctx.lineWidth = 1;
  const step = 40;
  const off = (time * 20) % step;
  ctx.beginPath();
  for (let x = -off; x < cam.screenW + step; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x + cam.screenH * 0.3, cam.screenH);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let y = -off; y < cam.screenH + step; y += step) {
    ctx.moveTo(0, y); ctx.lineTo(cam.screenW, y + cam.screenH * 0.05);
  }
  ctx.stroke();
}
"""

io.open(p, 'w', encoding='utf-8').write(head + new_subcomponents)
print("Updated src/App.tsx successfully!")

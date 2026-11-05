// Dynamic Web Audio synthesis engine — zero external file dependencies.
import type { ThemeKind } from './types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGainNode: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStepCount = 0;
  private bgmTheme: ThemeKind = 'verdant';
  private bgmTension = 0;
  private bgmActive = false;
  masterVol = 0.6;
  sfxVol = 0.8;
  bgmVol = 0.35;
  mutedSfx = false;
  mutedBgm = false;

  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC() as AudioContext;
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.bgmGainNode = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.masterGain);
    this.bgmGainNode.connect(this.masterGain);
    this.masterGain.gain.value = this.masterVol;
    this.sfxGain.gain.value = this.mutedSfx ? 0 : this.sfxVol;
    this.bgmGainNode.gain.value = this.mutedBgm ? 0 : this.bgmVol;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setMuted(sfx: boolean, bgm: boolean) {
    this.mutedSfx = sfx;
    this.mutedBgm = bgm;
    if (this.sfxGain) this.sfxGain.gain.value = sfx ? 0 : this.sfxVol;
    if (this.bgmGainNode) this.bgmGainNode.gain.value = bgm ? 0 : this.bgmVol;
  }

  setMasterVol(v: number) {
    this.masterVol = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.3,
    slideTo?: number,
    filterFreq?: number,
  ) {
    const ctx = this.ensureCtx();
    if (!ctx || this.mutedSfx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    filter.type = filterFreq ? 'lowpass' : 'allpass';
    if (filterFreq) filter.frequency.value = filterFreq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, filterFreq = 1200) {
    const ctx = this.ensureCtx();
    if (!ctx || this.mutedSfx) return;
    const now = ctx.currentTime;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    src.start(now);
  }

  laser() { this.blip(880, 0.12, 'square', 0.18, 220, 2000); }
  cannonFire() { this.noise(0.2, 0.25, 600); this.blip(120, 0.25, 'sine', 0.3, 40); }
  cannonImpact() { this.noise(0.35, 0.4, 400); this.blip(60, 0.3, 'triangle', 0.25, 30); }
  frostShot() { this.blip(1200, 0.2, 'triangle', 0.2, 1600); }
  arcaneShot() { this.blip(660, 0.15, 'sawtooth', 0.15, 330); this.blip(990, 0.15, 'sine', 0.1, 440); }
  thunderShot() { this.noise(0.1, 0.2, 3000); this.blip(200, 0.2, 'square', 0.2, 80); }
  enemyHit() { this.blip(320, 0.08, 'square', 0.15, 180); }
  targetHit() { this.noise(0.3, 0.4, 200); this.blip(80, 0.3, 'sawtooth', 0.3, 40); }
  gold() { this.blip(880, 0.08, 'triangle', 0.2); setTimeout(() => this.blip(1320, 0.12, 'triangle', 0.2), 60); }
  chestDrop() { this.blip(440, 0.1, 'square', 0.15); setTimeout(() => this.blip(660, 0.15, 'square', 0.15), 80); }
  cardDrop() { this.blip(660, 0.08, 'sine', 0.18); setTimeout(() => this.blip(990, 0.08, 'sine', 0.18), 70); setTimeout(() => this.blip(1320, 0.12, 'sine', 0.2), 140); }
  towerPlace() { this.blip(220, 0.1, 'triangle', 0.25); setTimeout(() => this.blip(440, 0.1, 'triangle', 0.2), 50); }
  upgrade() { [550, 735, 880, 1100].forEach((f, i) => setTimeout(() => this.blip(f, 0.1, 'triangle', 0.2), i * 60)); }
  error() { this.blip(180, 0.25, 'sawtooth', 0.25, 90); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'triangle', 0.2), i * 70)); }
  key() { [784, 988, 1318].forEach((f, i) => setTimeout(() => this.blip(f, 0.1, 'sine', 0.2), i * 60)); }
  chestOpen() { this.blip(200, 0.3, 'sine', 0.3, 600); this.noise(0.4, 0.2, 2000); setTimeout(() => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.15, 'triangle', 0.2), i * 80)); }, 300); }
  waveStart() { [440, 550, 660].forEach((f, i) => setTimeout(() => this.blip(f, 0.15, 'square', 0.18), i * 120)); }
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.25), i * 100)); }
  defeat() { [400, 330, 260, 200].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.25, f * 0.5), i * 150)); }
  click() { this.blip(600, 0.04, 'square', 0.1); }
  puzzleTick() { this.blip(1000, 0.04, 'square', 0.1); }
  puzzleChime() { [880, 1100, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.1, 'sine', 0.15), i * 50)); }
  uiOpen() { this.blip(500, 0.06, 'triangle', 0.15); }
  uiClose() { this.blip(300, 0.06, 'triangle', 0.15); }
  screenShakeSfx() { this.noise(0.15, 0.2, 100); }

  startBgm(theme: ThemeKind) {
    if (this.bgmActive) this.stopBgm();
    this.bgmActive = true;
    this.bgmTheme = theme;
    this.bgmStepCount = 0;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const tempo = 110;
    const stepMs = 60000 / tempo / 2;
    const tick = () => {
      if (!this.bgmActive || !this.ctx) return;
      this.bgmDoStep();
      this.bgmTimer = window.setTimeout(tick, stepMs * (1 - this.bgmTension * 0.25));
    };
    tick();
  }

  setTension(t: number) { this.bgmTension = Math.max(0, Math.min(1, t)); }
  setTheme(theme: ThemeKind) { this.bgmTheme = theme; }

  private bgmScale(): number[] {
    switch (this.bgmTheme) {
      case 'verdant': return [0, 2, 4, 5, 7, 9, 11];
      case 'desert': return [0, 1, 4, 5, 7, 8, 11];
      case 'frost': return [0, 2, 3, 5, 7, 8, 10];
      case 'volcanic': return [0, 1, 3, 4, 6, 7, 9];
      case 'astral': return [0, 2, 4, 6, 7, 9, 11];
      case 'abyssal': return [0, 1, 3, 5, 6, 8, 10];
    }
  }

  private bgmRoot(): number {
    return ({ verdant: 220, desert: 196, frost: 164.8, volcanic: 146.8, astral: 261.6, abyssal: 130.8 } as const)[this.bgmTheme];
  }

  private noteFreq(degree: number, octave = 0): number {
    const root = this.bgmRoot();
    const scale = this.bgmScale();
    const deg = ((degree % scale.length) + scale.length) % scale.length;
    return root * Math.pow(2, (scale[deg] + octave * 12) / 12);
  }

  private bgmChord(i: number): number[] {
    const progressions: Record<ThemeKind, number[][]> = {
      verdant: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]],
      desert: [[0, 2, 4], [6, 1, 3], [3, 5, 0], [5, 0, 2]],
      frost: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [2, 4, 6]],
      volcanic: [[0, 2, 4], [6, 1, 3], [4, 6, 1], [5, 0, 2]],
      astral: [[0, 2, 4], [4, 6, 1], [5, 0, 2], [3, 5, 0]],
      abyssal: [[0, 2, 4], [6, 1, 3], [4, 6, 1], [5, 0, 2]],
    };
    const p = progressions[this.bgmTheme];
    return p[i % p.length];
  }

  private bgmDoStep() {
    const ctx = this.ensureCtx();
    const bgmOut = this.bgmGainNode;
    if (!ctx || this.mutedBgm || !bgmOut) return;
    const now = ctx.currentTime;
    const step = this.bgmStepCount++;
    const beat = Math.floor(step / 2);
    const bar = Math.floor(beat / 4);
    const chord = this.bgmChord(bar);

    if (step % 2 === 0) {
      const f = this.noteFreq(chord[0], -1);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.22 + this.bgmTension * 0.1, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = 400;
      o.connect(f2); f2.connect(g); g.connect(bgmOut);
      o.start(now); o.stop(now + 0.4);
    }

    const arpNote = chord[step % chord.length];
    const f = this.noteFreq(arpNote, 1);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = this.bgmTension > 0.5 ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07 + this.bgmTension * 0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = 2000 + this.bgmTension * 1500;
    o.connect(f2); f2.connect(g); g.connect(bgmOut);
    o.start(now); o.stop(now + 0.25);

    if (step % 8 === 0) {
      chord.forEach((n, i) => {
        const po = ctx.createOscillator();
        const pg = ctx.createGain();
        po.type = 'sine';
        po.frequency.value = this.noteFreq(n, 2);
        pg.gain.setValueAtTime(0.0001, now);
        pg.gain.exponentialRampToValueAtTime(0.025, now + 0.3);
        pg.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        po.connect(pg); pg.connect(bgmOut);
        po.start(now + i * 0.02); po.stop(now + 1.3);
      });
    }
  }

  stopBgm() {
    this.bgmActive = false;
    if (this.bgmTimer) { clearTimeout(this.bgmTimer); this.bgmTimer = null; }
  }
}

export const audio = new AudioEngine();

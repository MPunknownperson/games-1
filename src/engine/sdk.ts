// Multi-SDK abstraction — Poki, CrazyGames, Telegram, GameDistribution, generic iframe.
declare global {
  interface Window {
    PokiSDK?: any; CrazyGames?: any; gdsdk?: any; Telegram?: any; wx?: any;
  }
}

export interface AdResult { completed: boolean; rewarded?: boolean; }
export interface IPlatformSDK {
  name: string;
  init(): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  happyTime(): void;
  reportScore(score: number): void;
  showRewardedAd(): Promise<AdResult>;
  showInterstitialAd(): Promise<AdResult>;
  loadingStart(): void;
  loadingProgress(pct: number): void;
  loadingEnd(): void;
}

class MockSDK implements IPlatformSDK {
  name = 'mock';
  async init() {}
  gameplayStart() {} gameplayStop() {} happyTime() {} reportScore() {}
  async showRewardedAd(): Promise<AdResult> { return new Promise((r) => setTimeout(() => r({ completed: true, rewarded: true }), 1500)); }
  async showInterstitialAd(): Promise<AdResult> { return new Promise((r) => setTimeout(() => r({ completed: true }), 1200)); }
  loadingStart() {} loadingProgress() {} loadingEnd() {}
}

class PokiWrapper implements IPlatformSDK {
  name = 'poki';
  async init() { try { await window.PokiSDK?.init?.(); } catch {} }
  gameplayStart() { try { window.PokiSDK?.gameplayStart?.(); } catch {} }
  gameplayStop() { try { window.PokiSDK?.gameplayStop?.(); } catch {} }
  happyTime() { try { window.PokiSDK?.happyTime?.(); } catch {} }
  reportScore(s: number) { try { window.PokiSDK?.postScore?.({ score: s }); } catch {} }
  async showRewardedAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false; const f = (c: boolean) => { if (done) return; done = true; res({ completed: c, rewarded: c }); };
      try { window.PokiSDK?.rewardedBreak?.({ rewarded: () => f(true), noReward: () => f(false), adBreakDone: () => f(false) }); } catch { f(false); }
      setTimeout(() => f(false), 30000);
    });
  }
  async showInterstitialAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false; const f = () => { if (done) return; done = true; res({ completed: true }); };
      try { window.PokiSDK?.commercialBreak?.({ adBreakDone: f }); } catch { f(); }
      setTimeout(f, 10000);
    });
  }
  loadingStart() { try { window.PokiSDK?.loadingStart?.(); } catch {} }
  loadingProgress(p: number) { try { window.PokiSDK?.loadingProgress?.(p); } catch {} }
  loadingEnd() { try { window.PokiSDK?.loadingFinished?.(); } catch {} }
}

class CrazyGamesWrapper implements IPlatformSDK {
  name = 'crazygames';
  async init() { try { await window.CrazyGames?.SDK?.init?.(); } catch {} }
  gameplayStart() {} gameplayStop() {} happyTime() {}
  reportScore(s: number) { try { window.CrazyGames?.SDK?.game?.showLeaderboard?.({ score: s }); } catch {} }
  async showRewardedAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false; const f = (c: boolean) => { if (done) return; done = true; res({ completed: c, rewarded: c }); };
      try { window.CrazyGames?.SDK?.ad?.requestAd('rewarded', { adFinished: () => f(true), adError: () => f(false) }); } catch { f(false); }
      setTimeout(() => f(false), 30000);
    });
  }
  async showInterstitialAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false; const f = () => { if (done) return; done = true; res({ completed: true }); };
      try { window.CrazyGames?.SDK?.ad?.requestAd('midgame', { adFinished: f, adError: f }); } catch { f(); }
      setTimeout(f, 10000);
    });
  }
  loadingStart() {} loadingProgress() {} loadingEnd() {}
}

class TelegramWrapper implements IPlatformSDK {
  name = 'telegram';
  async init() { try { window.Telegram?.WebApp?.ready?.(); window.Telegram?.WebApp?.expand?.(); } catch {} }
  gameplayStart() {} gameplayStop() {} happyTime() {}
  reportScore(s: number) { try { window.Telegram?.WebApp?.CloudStorage?.setItem?.('bestScore', String(s)); } catch {} }
  async showRewardedAd(): Promise<AdResult> { return { completed: true, rewarded: true }; }
  async showInterstitialAd(): Promise<AdResult> { return { completed: true }; }
  loadingStart() {} loadingProgress() {} loadingEnd() {}
}

let inst: IPlatformSDK | null = null;
export function detectPlatform(): IPlatformSDK {
  if (inst) return inst;
  if (typeof window !== 'undefined') {
    if (window.PokiSDK) return (inst = new PokiWrapper());
    if (window.CrazyGames) return (inst = new CrazyGamesWrapper());
    if (window.Telegram?.WebApp) return (inst = new TelegramWrapper());
  }
  return (inst = new MockSDK());
}

export const sdk: IPlatformSDK = typeof window !== 'undefined' ? detectPlatform() : new MockSDK();

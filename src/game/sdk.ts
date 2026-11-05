// Universal Platform SDK abstraction — supports Poki, CrazyGames, Telegram, GameDistribution, generic iframe.
import type { IPlatformSDK, AdResult } from './types';

declare global {
  interface Window {
    PokiSDK?: any;
    CrazyGames?: any;
    gdsdk?: any;
    Telegram?: any;
    wx?: any;
    parentIsAdBlocked?: boolean;
  }
}

class MockSDK implements IPlatformSDK {
  name = 'mock';
  async init() {}
  gameplayStart() {}
  gameplayStop() {}
  happyTime() {}
  reportScore(_s: number) {}
  async showRewardedAd(): Promise<AdResult> {
    return new Promise((res) => {
      setTimeout(() => res({ completed: true, rewarded: true }), 1500);
    });
  }
  async showInterstitialAd(): Promise<AdResult> {
    return new Promise((res) => {
      setTimeout(() => res({ completed: true }), 1200);
    });
  }
  loadingStart() {}
  loadingProgress(_: number) {}
  loadingEnd() {}
}

class PokiWrapper implements IPlatformSDK {
  name = 'poki';
  async init() {
    try { await window.PokiSDK?.init?.(); } catch {}
  }
  gameplayStart() { try { window.PokiSDK?.gameplayStart?.(); } catch {} }
  gameplayStop() { try { window.PokiSDK?.gameplayStop?.(); } catch {} }
  happyTime() { try { window.PokiSDK?.happyTime?.(); } catch {} }
  reportScore(s: number) { try { window.PokiSDK?.postScore?.({ score: s }); } catch {} }
  async showRewardedAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false;
      const finish = (c: boolean) => { if (done) return; done = true; res({ completed: c, rewarded: c }); };
      try {
        window.PokiSDK?.rewardedBreak?.({
          rewarded: () => finish(true),
          noReward: () => finish(false),
          adBreakDone: () => finish(done ? true : false),
        });
      } catch { finish(false); }
      setTimeout(() => finish(false), 30000);
    });
  }
  async showInterstitialAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; res({ completed: true }); };
      try { window.PokiSDK?.commercialBreak?.({ adBreakDone: finish }); } catch { finish(); }
      setTimeout(finish, 10000);
    });
  }
  loadingStart() { try { window.PokiSDK?.loadingStart?.(); } catch {} }
  loadingProgress(p: number) { try { window.PokiSDK?.loadingProgress?.(p); } catch {} }
  loadingEnd() { try { window.PokiSDK?.loadingFinished?.(); } catch {} }
}

class CrazyGamesWrapper implements IPlatformSDK {
  name = 'crazygames';
  async init() {
    try { await window.CrazyGames?.SDK?.init?.(); } catch {}
  }
  gameplayStart() {}
  gameplayStop() {}
  happyTime() { try { window.CrazyGames?.SDK?.game?.gameplayStart?.(); } catch {} }
  reportScore(s: number) { try { window.CrazyGames?.SDK?.game?.showLeaderboard?.({ score: s }); } catch {} }
  async showRewardedAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false;
      const finish = (c: boolean) => { if (done) return; done = true; res({ completed: c, rewarded: c }); };
      try {
        window.CrazyGames?.SDK?.ad?.requestAd('rewarded', {
          adFinished: () => finish(true),
          adError: () => finish(false),
        });
      } catch { finish(false); }
      setTimeout(() => finish(false), 30000);
    });
  }
  async showInterstitialAd(): Promise<AdResult> {
    return new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; res({ completed: true }); };
      try {
        window.CrazyGames?.SDK?.ad?.requestAd('midgame', {
          adFinished: finish,
          adError: finish,
        });
      } catch { finish(); }
      setTimeout(finish, 10000);
    });
  }
  loadingStart() {}
  loadingProgress(_: number) {}
  loadingEnd() {}
}

class TelegramWrapper implements IPlatformSDK {
  name = 'telegram';
  async init() {
    try { window.Telegram?.WebApp?.ready?.(); window.Telegram?.WebApp?.expand?.(); } catch {}
  }
  gameplayStart() {}
  gameplayStop() {}
  happyTime() {}
  reportScore(s: number) {
    try {
      const tg = window.Telegram?.WebApp;
      tg?.CloudStorage?.setItem?.('bestScore', String(s));
    } catch {}
  }
  async showRewardedAd(): Promise<AdResult> { return { completed: true, rewarded: true }; }
  async showInterstitialAd(): Promise<AdResult> { return { completed: true }; }
  loadingStart() {}
  loadingProgress(_: number) {}
  loadingEnd() { try { window.Telegram?.WebApp?.ready?.(); } catch {} }
}

let sdkInstance: IPlatformSDK | null = null;

export function detectPlatform(): IPlatformSDK {
  if (sdkInstance) return sdkInstance;
  if (typeof window !== 'undefined') {
    if (window.PokiSDK) return (sdkInstance = new PokiWrapper());
    if (window.CrazyGames) return (sdkInstance = new CrazyGamesWrapper());
    if (window.Telegram?.WebApp) return (sdkInstance = new TelegramWrapper());
  }
  return (sdkInstance = new MockSDK());
}

export const sdk: IPlatformSDK = typeof window !== 'undefined' ? detectPlatform() : new MockSDK();

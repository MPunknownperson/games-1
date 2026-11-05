import type { SaveData } from './types';

const KEY = 'wardens-atlas-save-v1';

export function defaultSave(): SaveData {
  return {
    bestRound: 0,
    totalGoldEarned: 0,
    totalEnemiesKilled: 0,
    unlockedTowers: ['arrow', 'cannon', 'frost'],
    highScore: 0,
    muteBgm: false,
    muteSfx: false,
    masterVolume: 0.7,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw) as SaveData;
    const def = defaultSave();
    return { ...def, ...data };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

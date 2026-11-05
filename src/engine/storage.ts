import type { TowerKind } from './blocks';
import type { Card, Chest } from './game';

const KEY = 'preserve-everything-save-v1';

export interface SaveData {
  bestRound: number;
  bestScore: number;
  totalKills: number;
  totalGold: number;
  unlockedTowers: TowerKind[];
  muteSfx: boolean;
  muteBgm: boolean;
  masterVolume: number;
  acceptedTerms: boolean;
  currentRun?: {
    round: number;
    minor: number;
    gold: number;
    inventory: { chests: Chest[]; cards: Card[]; keys: number };
    seed: number;
  };
  highScores: { name: string; score: number; round: number; when: number }[];
}

export function defaultSave(): SaveData {
  return {
    bestRound: 0, bestScore: 0, totalKills: 0, totalGold: 0,
    unlockedTowers: ['archer', 'mortar', 'chill'],
    muteSfx: false, muteBgm: false, masterVolume: 0.7,
    acceptedTerms: false,
    highScores: [],
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...(JSON.parse(raw) as SaveData) };
  } catch { return defaultSave(); }
}

export function writeSave(d: SaveData) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }

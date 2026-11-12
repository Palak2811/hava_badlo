import type { GameState } from './types';

/** Mulberry32 — small, fast, deterministic PRNG whose state lives in the save. */
export function nextRandom(s: GameState): number {
  let t = (s.rngState = (s.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pick<T>(s: GameState, arr: T[]): T {
  return arr[Math.floor(nextRandom(s) * arr.length) % arr.length];
}

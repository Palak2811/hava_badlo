/**
 * Balance regression: full 52-week campaigns played by scripted strategies.
 * These pin the intended shape of the game — real governance wins, shortcuts lose,
 * half-measures are a coin flip — so future tuning can't silently break it.
 */
import { describe, expect, it } from 'vitest';
import { STRATEGIES, playtest } from './sim/strategies';

const run = (name: string, seed = 7) => playtest(STRATEGIES.find((s) => s.name === name)!, seed);

describe('campaign balance (full 52-week playtests)', () => {
  it('genuine green governance wins', () => {
    const r = run('green');
    expect(r.won).toBe(true);
    expect(r.aqi).toBeLessThan(r.baseline);
  });

  it('a balanced approach wins', () => {
    expect(run('balanced').won).toBe(true);
  });

  it('doing nothing loses', () => {
    const r = run('idle');
    expect(r.won).toBe(false);
    expect(r.vote).toBeLessThan(45);
  });

  it('spin without substance loses', () => {
    const r = run('pr');
    expect(r.won).toBe(false);
    expect(r.ending).not.toBe('hero');
  });

  it('cashing in on polluting deals loses despite a rich treasury', () => {
    const r = run('industrialist');
    expect(r.won).toBe(false);
    expect(r.budget).toBeGreaterThan(50000);
  });

  it('building without listening to people is a close race', () => {
    const r = run('builder-only');
    expect(r.vote).toBeGreaterThan(42);
    expect(r.vote).toBeLessThan(58);
  });

  it('nobody is left permanently bankrupt', () => {
    for (const name of ['green', 'balanced', 'pr']) expect(run(name).minBudget).toBeGreaterThan(-5000);
  });
}, 120000);

import { create } from 'zustand';
import { SETTINGS_KEY } from '../config/balance';
import { ACHIEVEMENTS } from '../config/content';
import { EVENT_MAP } from '../config/events';
import {
  buyBuilding, claimGrant, doResearch, newGame, resolveEvent, step, executeOptics, type ActionResult,
} from '../engine/core';
import { applyOffline, load, reset as resetSave, save } from '../engine/save';
import type { BuildingId, GameState, OfflineSummary, Settings } from '../engine/types';
import { sound } from '../audio/sound';

export type Tab = 'city' | 'infra' | 'research' | 'news' | 'admin' | 'stats';
export interface Toast { id: number; kind: 'good' | 'bad' | 'info' | 'achievement'; title: string; body?: string }

const DEFAULT_SETTINGS: Settings = { sound: true, music: false, musicVolume: 0.4, sfxVolume: 0.6, animations: true };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface Store {
  game: GameState;
  settings: Settings;
  tab: Tab;
  selected: BuildingId | null;
  eventOpen: string | null;
  toasts: Toast[];
  offline: OfflineSummary | null;
  loadNotice: string | null;
  showSettings: boolean;
  confirm: { title: string; body: string; onYes: () => void } | null;
  floaters: { id: number; text: string; color: string }[];
  boot: () => void;
  setTab: (t: Tab) => void;
  select: (b: BuildingId | null) => void;
  openEvent: (uid: string | null) => void;
  setSpeed: (sp: 0 | 1 | 2 | 4) => void;
  tickReal: (ticks: number) => void;
  buy: (id: BuildingId) => void;
  research: (id: string) => void;
  optics: (id: string) => void;
  choose: (uid: string, idx: number) => void;
  grant: () => void;
  persist: () => void;
  resetGame: () => void;
  continueSandbox: () => void;
  finishTutorial: () => void;
  updateSettings: (p: Partial<Settings>) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  askConfirm: (c: Store['confirm']) => void;
  dismissOffline: () => void;
  float: (text: string, color: string) => void;
}

let toastSeq = 0;
let booted = false;
const storage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export const useGame = create<Store>((set, get) => {
  const mutate = (fn: (s: GameState) => ActionResult, okSfx: 'buy' | 'unlock' | 'click' = 'buy') => {
    const s = structuredClone(get().game);
    const before = { ach: s.achievements.length, events: s.events.length };
    const r = fn(s);
    if (r.ok) {
      set({ game: s });
      sound.play(okSfx);
      get().toast({ kind: 'good', title: r.msg });
      announce(before, s);
      get().persist();
    } else {
      sound.play('error');
      get().toast({ kind: 'bad', title: r.msg });
    }
    return r;
  };

  const announce = (before: { ach: number; events: number }, s: GameState) => {
    for (const id of s.achievements.slice(before.ach)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      sound.play('achievement');
      get().toast({ kind: 'achievement', title: `🏅 ${a.name}`, body: `${a.description} (${a.rewardText})` });
      window.dispatchEvent(new CustomEvent('hb-confetti'));
    }
    if (s.events.length > before.events) {
      const ev = EVENT_MAP[s.events[s.events.length - 1].defId];
      sound.play(ev.severity >= 3 ? 'alert' : 'notify');
      get().toast({ kind: 'info', title: `${ev.art} ${ev.title}`, body: 'A decision is needed. Open News & Events or click the alert.' });
    }
  };

  return {
    game: newGame(),
    settings: loadSettings(),
    tab: 'city',
    selected: null,
    eventOpen: null,
    toasts: [],
    offline: null,
    loadNotice: null,
    showSettings: false,
    confirm: null,
    floaters: [],

    boot: () => {
      const st = storage();
      if (!st || booted) return;
      booted = true;
      const res = load(st);
      let game = res.state;
      let offline: OfflineSummary | null = null;
      if (res.status === 'loaded') {
        const o = applyOffline(game, Date.now());
        game = o.state;
        offline = o.summary;
      }
      set({ game, offline, loadNotice: res.status === 'corrupt' ? 'Your previous save was damaged and could not be loaded. A backup was kept and a new term has begun.' : null });
      save(st, game);
      const se = get().settings;
      sound.configure({ sfx: se.sound, music: se.music, musicVolume: se.musicVolume, sfxVolume: se.sfxVolume });
    },
    setTab: (tab) => {
      sound.play('click');
      set({ tab });
    },
    select: (selected) => set({ selected }),
    openEvent: (eventOpen) => set({ eventOpen }),
    setSpeed: (sp) => {
      sound.play('click');
      set({ game: { ...get().game, speed: sp } });
      get().persist();
    },
    tickReal: (n) => {
      if (n <= 0) return;
      const s = structuredClone(get().game);
      const before = { ach: s.achievements.length, events: s.events.length, budget: s.res.budget, ended: s.ended };
      for (let i = 0; i < n; i++) step(s);
      set({ game: s });
      announce(before, s);
      if (s.ended && !before.ended) {
        sound.play('achievement');
        get().persist();
      }
    },
    buy: (id) => {
      mutate((s) => buyBuilding(s, id), 'buy');
    },
    research: (id) => {
      mutate((s) => doResearch(s, id), 'unlock');
    },
    optics: (id) => {
      mutate((s) => executeOptics(s, id), 'click');
    },
    choose: (uid, idx) => {
      const r = mutate((s) => resolveEvent(s, uid, idx), 'click');
      if (r.ok) set({ eventOpen: null });
    },
    grant: () => {
      mutate(claimGrant, 'buy');
    },
    persist: () => {
      const st = storage();
      if (st) save(st, get().game);
    },
    resetGame: () => {
      const st = storage();
      if (st) resetSave(st);
      const g = newGame();
      g.tutorialDone = true;
      set({ game: g, tab: 'city', eventOpen: null, selected: null, offline: null });
      get().persist();
      get().toast({ kind: 'info', title: 'A new term begins', body: 'Fresh desk, fresh smog.' });
    },
    continueSandbox: () => {
      set({ game: { ...get().game, sandbox: true } });
      get().persist();
    },
    finishTutorial: () => {
      set({ game: { ...get().game, tutorialDone: true } });
      get().persist();
    },
    updateSettings: (p) => {
      const settings = { ...get().settings, ...p };
      set({ settings });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* storage full or blocked — settings stay in memory */
      }
      sound.configure({ sfx: settings.sound, music: settings.music, musicVolume: settings.musicVolume, sfxVolume: settings.sfxVolume });
    },
    toast: (t) => {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
      window.setTimeout(() => get().dismissToast(id), t.kind === 'achievement' ? 5000 : 3200);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    askConfirm: (confirm) => set({ confirm }),
    dismissOffline: () => set({ offline: null }),
    float: (text, color) => {
      const id = ++toastSeq;
      set({ floaters: [...get().floaters.slice(-6), { id, text, color }] });
      window.setTimeout(() => set({ floaters: get().floaters.filter((f) => f.id !== id) }), 1400);
    },
  };
});

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __hb: typeof useGame }).__hb = useGame;

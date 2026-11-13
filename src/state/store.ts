import { create } from 'zustand';
import { BUILDINGS, OPTICS, SETTINGS_KEY } from '../config/balance';
import { ACHIEVEMENTS } from '../config/content';
import { EVENT_MAP } from '../config/events';
import {
  buyBuilding, claimGrant, opticsUnlocked, phaseOf, doResearch, newGame, resolveEvent, step, executeOptics, type ActionResult,
} from '../engine/core';
import { applyOffline, load, reset as resetSave, save } from '../engine/save';
import type { BuildingId, GameState, OfflineSummary, Settings } from '../engine/types';
import { buildMap, infoOf, type CityMap, type Pick } from '../engine/map';
import { buildRoad, demolish, demolitionInfo, placeBuilding, zoneArea } from '../engine/build';
import { decideProposal, repealPolicy } from '../engine/approvals';
import { applyRecovery } from '../engine/economy';
import { PROPOSAL_MAP } from '../config/approvals';
import type { Placeable, Zone } from '../engine/types';
import { TUTORIAL } from '../config/content';
import { sound } from '../audio/sound';

export type Tab = 'city' | 'approvals' | 'research' | 'news' | 'admin' | 'finance';
export type MapMode = 'normal' | 'pollution' | 'economy';
export type Tool =
  | { type: 'place'; kind: Placeable; relocateFrom?: number }
  | { type: 'road'; start?: [number, number] }
  | { type: 'zone'; zone: Zone | 'clear'; start?: [number, number] }
  | { type: 'demolish' };

/** Live map cache for the UI (the engine rebuilds its own when it needs one). */
let mapCache: { key: string; map: CityMap } | null = null;
export function getLiveMap(g: GameState): CityMap {
  const e = g.cityEdits;
  const key = `${g.seed}|${g.mapVersion}|${e.placed.length}|${e.roads.length}|${e.demolished.length}`;
  if (!mapCache || mapCache.key !== key) mapCache = { key, map: buildMap(e) };
  return mapCache.map;
}
export interface Toast { id: number; kind: 'good' | 'bad' | 'info' | 'achievement'; title: string; body?: string }

const DEFAULT_SETTINGS: Settings = { sound: true, music: false, musicVolume: 0.4, sfxVolume: 0.6, animations: true, pauseOnWeekEnd: false };

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
  inspect: Pick | null;
  tool: Tool | null;
  mapMode: MapMode;
  buildOpen: boolean;
  hover: { x: number; y: number } | null;
  eventOpen: string | null;
  toasts: Toast[];
  offline: OfflineSummary | null;
  loadNotice: string | null;
  showSettings: boolean;
  confirm: { title: string; body: string; onYes: () => void } | null;
  floaters: { id: number; text: string; color: string }[];
  weekCard: number | null;
  closeWeekCard: () => void;
  boot: () => void;
  setTab: (t: Tab) => void;
  select: (b: BuildingId | null) => void;
  onPick: (p: Pick | null) => void;
  setTool: (t: Tool | null) => void;
  setMapMode: (m: MapMode) => void;
  decide: (uid: number, approve: boolean) => void;
  repeal: (id: string) => void;
  recover: (id: 'grant' | 'loan' | 'investment' | 'cuts') => void;
  toggleBuild: (open?: boolean) => void;
  setHover: (h: { x: number; y: number } | null) => void;
  toolClick: (x: number, y: number) => void;
  askDemolish: (id: number) => void;
  tutorialEvent: (kind: 'pan' | 'zoom' | 'inspect') => void;
  advanceTutorial: () => void;
  skipTutorial: () => void;
  replayTutorial: () => void;
  finishIntro: () => void;
  dismissTip: (id: string) => void;
  openEvent: (uid: string | null) => void;
  setSpeed: (sp: 0 | 1 | 2 | 3) => void;
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
  dismissReport: () => void;
  dismissBriefing: () => void;
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
  const mutate = (fn: (s: GameState) => ActionResult, okSfx: 'buy' | 'unlock' | 'click' | 'build' | 'stamp' = 'buy') => {
    const prev = get().game;
    const s = structuredClone(prev);
    const before = { ach: s.achievements.length, events: s.events.length };
    const r = fn(s);
    if (r.ok) {
      set({ game: s });
      sound.play(okSfx);
      celebrate(prev, s);
      get().toast({ kind: 'good', title: r.msg });
      announce(before, s);
      get().persist();
    } else {
      sound.play('error');
      get().toast({ kind: 'bad', title: r.msg });
    }
    return r;
  };

  /** Celebrate what changed between two states (objectives, construction, unlocks). */
  const celebrate = (prev: GameState, s: GameState) => {
    for (const o of s.objectives) {
      const was = prev.objectives.find((x) => x.id === o.id);
      if (o.done && was && !was.done) {
        sound.play('unlock');
        get().toast({ kind: 'good', title: '✓ Objective complete', body: o.label });
      }
    }
    for (const b of BUILDINGS) {
      if (s.buildings[b.id] > prev.buildings[b.id]) {
        sound.play('build');
        get().toast({ kind: 'good', title: `🏗️ ${b.name} ${prev.buildings[b.id] === 0 ? 'is open' : `upgraded to level ${s.buildings[b.id]}`}` });
      }
    }
    if (s.stats.playerProjects > prev.stats.playerProjects) {
      sound.play('build');
      get().toast({ kind: 'good', title: `🏗️ Construction complete`, body: `${s.stats.playerProjects - prev.stats.playerProjects} of your projects finished.` });
    }
    const unlocked = (g: GameState) => OPTICS.filter((o) => opticsUnlocked(g, o.id)).length;
    if (unlocked(s) > unlocked(prev)) {
      sound.play('unlock');
      get().toast({ kind: 'info', title: '🎭 New optics card unlocked', body: 'See Administration → Optics cards.' });
    }
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
    inspect: null,
    tool: null,
    mapMode: 'normal',
    buildOpen: false,
    hover: null,
    eventOpen: null,
    toasts: [],
    offline: null,
    loadNotice: null,
    showSettings: false,
    confirm: null,
    floaters: [],
    weekCard: null,
    closeWeekCard: () => set({ weekCard: null }),

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
      set({ game, offline, loadNotice: res.status === 'corrupt' ? 'Your previous save was damaged and could not be loaded. A backup was kept and a new term has begun.' : res.status === 'outdated' ? 'The game now runs a full 52-week term, so your 4-week prototype save was replaced with a fresh one.' : null });
      save(st, game);
      const se = get().settings;
      sound.configure({ sfx: se.sound, music: se.music, musicVolume: se.musicVolume, sfxVolume: se.sfxVolume });
    },
    setTab: (tab) => {
      sound.play('click');
      set({ tab, buildOpen: false, tool: null });
    },
    select: (selected) => set({ selected, inspect: null }),
    onPick: (p) => {
      if (p?.type === 'plot') set({ selected: p.id, inspect: null });
      else set({ inspect: p, selected: null });
      if (p) get().tutorialEvent('inspect');
    },
    setTool: (tool) => set({ tool, selected: null, inspect: null }),
    setMapMode: (mapMode) => {
      sound.play('click');
      set({ mapMode });
    },
    decide: (uid, approve) => {
      mutate((s) => decideProposal(s, uid, approve), 'stamp');
    },
    repeal: (id) => {
      mutate((s) => repealPolicy(s, id), 'click');
    },
    recover: (id) => {
      mutate((s) => applyRecovery(s, id), 'buy');
    },
    toggleBuild: (open) => {
      const next = open ?? !get().buildOpen;
      sound.play('click');
      set({ buildOpen: next, tool: next ? get().tool : null, tab: 'city' });
    },
    setHover: (hover) => {
      const h = get().hover;
      if (h?.x === hover?.x && h?.y === hover?.y) return;
      set({ hover });
    },
    toolClick: (x, y) => {
      const tool = get().tool;
      if (!tool) return;
      if (tool.type === 'place') {
        const r = mutate((s) => placeBuilding(s, tool.kind, x, y, tool.relocateFrom), 'build');
        if (r.ok && tool.relocateFrom !== undefined) set({ tool: null });
        if (r.ok) get().tutorialEvent('inspect');
      } else if (tool.type === 'road' || tool.type === 'zone') {
        if (!tool.start) {
          sound.play('click');
          set({ tool: { ...tool, start: [x, y] } });
          return;
        }
        const [sx, sy] = tool.start;
        const r = tool.type === 'road'
          ? mutate((s) => buildRoad(s, sx, sy, x, y), 'buy')
          : mutate((s) => zoneArea(s, sx, sy, x, y, tool.zone), 'click');
        set({ tool: { ...tool, start: r.ok ? undefined : tool.start } });
      } else if (tool.type === 'demolish') {
        const b = getLiveMap(get().game).owner[y * getLiveMap(get().game).cols + x];
        if (b >= 0) get().askDemolish(b);
      }
    },
    askDemolish: (id) => {
      const g = get().game;
      const m = getLiveMap(g);
      const info = demolitionInfo(g, m, id);
      const b = m.buildings[id];
      if (!info.allowed) {
        get().toast({ kind: 'bad', title: info.reason ?? 'Cannot demolish' });
        return;
      }
      const label = infoOf(b).label.toLowerCase();
      const effects = Object.entries(info.deltas).map(([k, v]) => `${k} ${(v as number) > 0 ? '+' : ''}${v}`).join(', ');
      get().askConfirm({
        title: info.cancel ? 'Cancel construction?' : `Demolish this ${label}?`,
        body: info.cancel
          ? `You will recover ₹${info.refund.toLocaleString('en-IN')} of the cost.`
          : `Compensation: ₹${info.cost.toLocaleString('en-IN')}. ${info.note}${effects ? ` Effects: ${effects}.` : ''}`,
        onYes: () => {
          const r = mutate((s) => demolish(s, id), 'click');
          if (r.ok) set({ inspect: null });
        },
      });
    },
    tutorialEvent: (kind) => {
      const g = get().game;
      if (g.tutorialDone || !g.introDone) return;
      if (TUTORIAL[g.tutorialStep]?.gate === kind) get().advanceTutorial();
    },
    advanceTutorial: () => {
      const g = get().game;
      const next = g.tutorialStep + 1;
      sound.play('notify');
      set({ game: { ...g, tutorialStep: next, tutorialDone: next >= TUTORIAL.length } });
      get().persist();
    },
    skipTutorial: () => {
      set({ game: { ...get().game, tutorialDone: true } });
      get().persist();
    },
    replayTutorial: () => {
      set({ game: { ...get().game, tutorialDone: false, tutorialStep: 0, tipsSeen: [] }, tab: 'city' });
    },
    dismissTip: (id) => {
      const g = get().game;
      if (g.tipsSeen.includes(id)) return;
      set({ game: { ...g, tipsSeen: [...g.tipsSeen, id] } });
      get().persist();
    },
    finishIntro: () => {
      set({ game: { ...get().game, introDone: true, briefingSeen: 1 } });
      get().persist();
    },
    openEvent: (eventOpen) => set({ eventOpen }),
    setSpeed: (sp) => {
      sound.play('click');
      set({ game: { ...get().game, speed: sp } });
      get().persist();
    },
    tickReal: (n) => {
      if (n <= 0) return;
      const prev = get().game;
      const s = structuredClone(prev);
      const before = { ach: s.achievements.length, events: s.events.length, budget: s.res.budget, ended: s.ended, prop: s.proposalsSeen, settled: s.settlement?.week ?? 0 };
      for (let i = 0; i < n; i++) step(s);
      set({ game: s });
      announce(before, s);
      celebrate(prev, s);
      if (s.settlement && s.settlement.week !== before.settled) {
        const net = s.settlement.net;
        get().float(`${net >= 0 ? '+' : '−'}₹${Math.abs(net).toLocaleString('en-IN')}`, net >= 0 ? 'var(--good)' : 'var(--bad)');
        sound.play(net >= 0 ? 'cash' : 'error');
        set({ weekCard: s.settlement.week });
        if (get().settings.pauseOnWeekEnd && !s.ended) set({ game: { ...get().game, speed: 0 } });
      }
      if (s.proposalsSeen > before.prop) {
        const p = s.proposals[s.proposals.length - 1];
        if (p) {
          sound.play('notify');
          get().toast({ kind: 'info', title: `📋 ${PROPOSAL_MAP[p.templateId].title}`, body: 'A new proposal is waiting in Approvals.' });
        }
      }
      if (s.ended && !before.ended) {
        sound.play('fanfare');
        get().persist();
      }
    },
    buy: (id) => {
      const r = mutate((s) => buyBuilding(s, id), 'buy');
      const g = get().game;
      if (r.ok && !g.tutorialDone && TUTORIAL[g.tutorialStep]?.gate === 'build-monitor' && (g.buildings.monitor > 0 || g.upgrading.monitor)) {
        set({ selected: null });
        get().advanceTutorial();
      }
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
      set({ game: g, tab: 'city', eventOpen: null, selected: null, inspect: null, offline: null });
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
    dismissReport: () => {
      set({ game: { ...get().game, reportPending: false } });
      get().persist();
    },
    dismissBriefing: () => {
      const g = get().game;
      set({ game: { ...g, briefingSeen: phaseOf(g) } });
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

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __hb: typeof useGame; __hbMap: typeof getLiveMap };
  w.__hb = useGame;
  w.__hbMap = getLiveMap;
}

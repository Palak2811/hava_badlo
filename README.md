# HAWA BADLO

*A nation-sized problem. A government-sized budget.*

A satirical idle / city-management game set in Delhi. **52 weeks. One city. One election.** You are Commissioner of Delhi's Clean Air Mission: improve the air, grow the city, keep the economy and the voters happy, and win the election in week 52. You can do it for real with infrastructure, research and hard choices, or you can make it *look* done.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 112 unit tests (Vitest)
npm run lint
npm run typecheck
npm run build      # production build into dist/
npm run preview    # serve the production build
```

One in-game week lasts about one real minute at 1× speed (pause / 1× / 2× / 3× in the top bar). The term is split into four 13-week phases: Establishing Credibility, Rapid Development, The Great Delhi Smog, Election Countdown.

## Architecture

```
src/
  config/
    balance.ts    ← every balance number: start resources, buildings, research, optics, seasons, pollution coefficients
    events.ts     ← 16 events with choices, costs, timed effects and state-dependent outcomes
    city.ts       ← living-city balance: occupancy, trips, transit capacity, road capacity, growth caps
    economy.ts    ← revenue rates and recovery terms
    approvals.ts  ← the ten proposal templates with their impacts
    build.ts      ← build catalogue: costs, build weeks, zones, upkeep, demolition compensation
    content.ts    ← achievements, objectives, stage goals, endings, news templates, tutorial
  engine/         ← pure TypeScript simulation; no DOM and no rendering, deterministic per seed
    map.ts        ← 64×40 grid city: roads, river, 12 neighbourhoods, ~500 buildings, plots, metro, bus stops
    build.ts      ← placement rules, construction, demolition/relocation, roads, zoning; map → simulation modifier
    air.ts        ← neighbourhood air: source distribution, spill-over, park relief, exposure-weighted city AQI
    economy.ts    ← revenue streams, loans, recovery options
    approvals.ts  ← proposals, standing policies, delayed consequences
    city.ts       ← weekly living city: migration, employment, RCI demand, private development, traffic model
    core.ts       ← modifiers, pollution model, economy, actions, events, progression, endings, tick
    save.ts       ← versioned localStorage save, validation/migration, corrupt-save recovery, offline progress
    rng.ts        ← seeded Mulberry32; RNG state lives in the save
  state/store.ts  ← Zustand store: game loop glue, autosave, toasts, sound triggers
  city/           ← Phaser 3 scene (lazy-loaded): renders the grid city; pan, wheel/pinch zoom, picking, road-following traffic
  audio/sound.ts  ← procedural WebAudio SFX plus a tanpura drone and Raag Bhupali music (no audio files)
  ui/             ← map-first React UI: opening story, Secretary tutorial, HUD, inspection panels, drawers, decisions, reports
tests/engine.test.ts
```

### Pollution model (illustrative, not official data)

- `emission_i = base_i × season_i × eventMult_i × (1 − control_i)`
- steady-state concentration `C* = 0.35 × Σ emission / dispersion` (dispersion = season × daily wind × weather)
- the atmosphere relaxes toward `C*` gradually
- AQI comes from concentration through NAQI-style PM2.5 breakpoints
- official AQI = AQI × (1 − perception bias from optics schemes)
- a parallel **no-action baseline** runs alongside to measure the player's real impact (Clean Air Credits, ending)

## Roadmap (redesign phases)

- [x] Phase 1: opening story, Secretary tutorial, grid city, camera pan/zoom, selection of buildings, roads and neighbourhoods
- [x] Phase 2: placement & demolition, relocation, road building, zoning, construction timers
- [x] Phase 3: residents & migration, jobs & unemployment, RCI demand, organic growth, traffic & public transport model
- [x] Phase 4: neighbourhood AQI (population-weighted exposure), pollution & economy map modes, revenue streams, finance & recovery, pending approvals, policies, delayed consequences
- [ ] Phase 5: weekly settlement, objectives & election evaluation
- [ ] Phase 6: polish & balancing

## Notes and limitations

- Stage 1 is complete and Stage 2 is playable. Stages 3–5 appear as locked future expansions.
- While you are away, the department keeps working at half speed (capped at 8 hours, at most 6 in-game days). It never spawns events or ends the term while you are offline.
- City art is procedural (Phaser Graphics) rather than hand-drawn sprites.
- In dev mode the store is exposed as `window.__hb` for debugging.

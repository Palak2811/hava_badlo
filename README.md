# HAWA BADLO

*A nation-sized problem. A government-sized budget.*

## What this is

Hawa Badlo ("change the air") is a **single-player browser game**: a satirical idle / city-management sim about cleaning up Delhi's air pollution. It runs entirely in the browser, with no backend, no account and no install. Progress is saved to the browser's local storage.

**52 weeks. One city. One election.** You play the Commissioner of Delhi's Clean Air Mission. You have one 52-week term to improve the air, grow the city, keep the budget solvent and keep voters on side, and the term ends with an election in week 52. You can fix the air for real with infrastructure, research and hard choices, or you can just make it *look* fixed with PR and creative statistics. The game tracks both, and voters eventually notice the difference.

### How it plays

- **Build the city.** Place facilities on a 64×40 grid map of Delhi, such as AQI monitoring centres, dust control units, electric bus depots, waste management centres and a Parali Management Cell. You can also lay roads, zone land and demolish or relocate buildings.
- **Watch it live.** Residents migrate in, look for jobs and commute. Demand for housing, shops and industry drives private development, and traffic follows the road network.
- **Fight the seasons.** Pollution follows Delhi's real yearly cycle: late monsoon, post-monsoon crop burning (*parali*), winter inversion smog and election-season spring. Each of the 12 neighbourhoods has its own air quality.
- **Govern.** Research upgrades, respond to random events, approve or reject policy proposals with delayed consequences, take out loans and complete weekly objectives.
- **Win the vote.** Opinion polls lead to a 70-seat election that is decided neighbourhood by neighbourhood. Your ending and legacy title depend on how much you actually cut pollution compared with doing nothing.

Pollution figures are illustrative and loosely modelled on India's NAQI AQI scale. They are not official data.

### Tech stack

| Layer | Tech |
|---|---|
| Language | TypeScript |
| Map / rendering | Phaser 3 (procedural graphics, no sprite art) |
| UI | React 18 |
| State | Zustand |
| Audio | Web Audio API (all sound is generated in code, with no audio files) |
| Build / dev server | Vite |
| Tests | Vitest + jsdom |
| Lint | ESLint + typescript-eslint |

The game simulation in `src/engine/` is plain TypeScript with no rendering code. It is deterministic for a given random seed, so whole 52-week games can be played out and checked in tests without a browser.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 137 tests (Vitest), incl. full 52-week balance playtests
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
    election.ts   ← seats, majority and scorecard weights
    build.ts      ← build catalogue: costs, build weeks, zones, upkeep, demolition compensation
    content.ts    ← achievements, objectives, stage goals, endings, news templates, tutorial
  engine/         ← pure TypeScript simulation; no DOM and no rendering, deterministic per seed
    map.ts        ← 64×40 grid city: roads, river, 12 neighbourhoods, ~500 buildings, plots, metro, bus stops
    build.ts      ← placement rules, construction, demolition/relocation, roads, zoning; map → simulation modifier
    air.ts        ← neighbourhood air: source distribution, spill-over, park relief, exposure-weighted city AQI
    economy.ts    ← revenue streams, loans, recovery options
    approvals.ts  ← proposals, standing policies, delayed consequences
    objectives.ts ← weekly objectives (air / city / action) and live progress
    election.ts   ← seat allocation, per-neighbourhood scorecard, result & verdict
    city.ts       ← weekly living city: migration, employment, RCI demand, private development, traffic model
    core.ts       ← modifiers, pollution model, economy, actions, events, progression, endings, tick
    save.ts       ← versioned localStorage save, validation/migration, corrupt-save recovery, offline progress
    rng.ts        ← seeded Mulberry32; RNG state lives in the save
  state/store.ts  ← Zustand store: game loop glue, autosave, toasts, sound triggers
  city/           ← Phaser 3 scene (lazy-loaded): renders the grid city; pan, wheel/pinch zoom, picking, road-following traffic
  audio/sound.ts  ← procedural WebAudio SFX plus a tanpura drone and Raag Bhupali music (no audio files)
  ui/             ← map-first React UI: opening story, Secretary tutorial, HUD, inspection panels, drawers, decisions, reports
tests/
  sim/strategies.ts ← scripted players (idle, green, PR, balanced, builder-only, industrialist)
  balance.test.ts   ← full-campaign balance regression
  persistence.test.ts ← save/load determinism, robustness, performance
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
- [x] Phase 5: weekly settlement ledger & card, objectives tied to air/trust/revenue/transit/traffic/approvals, opinion poll, 70-seat election with constituency results and legacy title
- [x] Phase 6: balance tuned with automated full-term playtests, save/load determinism, feedback & sounds, extended tutorial and contextual tips

## Balance (automated playtests, seed 7)

| Strategy | Vote | Seats | Outcome |
|---|---|---|---|
| Green governance | ~65% | 70 | Wins |
| Balanced | ~60–63% | 70 | Wins |
| Builder, ignores people | ~49–50% | 29–42 | Coin flip |
| Idle / PR spin / industrialist | ~32–36% | 0 | Loses |

## Notes and limitations

- Stage 1 is complete and Stage 2 is playable. Stages 3–5 appear as locked future expansions.
- While you are away, the department keeps working at half speed (capped at 8 hours, at most 6 in-game days). It never spawns events or ends the term while you are offline.
- City art is procedural (Phaser Graphics) rather than hand-drawn sprites.
- In dev mode the store is exposed as `window.__hb` for debugging.

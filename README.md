# HAWA BADLO

*A nation-sized problem. A government-sized budget.*

A satirical idle / city-management game set in Delhi. You are the new Commissioner of the Department of Clean Air and have a 4-week term (28 in-game days) to bring the AQI down. You can do it for real with infrastructure, research and hard choices, or you can make it *look* done.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 54 unit tests (Vitest)
npm run lint
npm run typecheck
npm run build      # production build into dist/
npm run preview    # serve the production build
```

One in-game day lasts about one real minute at 1× speed. Use ⏸ / 1× / 2× / 4× in the top bar.

## Architecture

```
src/
  config/
    balance.ts    ← every balance number: start resources, buildings, research, optics, seasons, pollution coefficients
    events.ts     ← 16 events with choices, costs, timed effects and state-dependent outcomes
    content.ts    ← achievements, objectives, stage goals, endings, news templates, tutorial
  engine/         ← pure TypeScript simulation; no DOM and no rendering, deterministic per seed
    core.ts       ← modifiers, pollution model, economy, actions, events, progression, endings, tick
    save.ts       ← versioned localStorage save, validation/migration, corrupt-save recovery, offline progress
    rng.ts        ← seeded Mulberry32; RNG state lives in the save
  state/store.ts  ← Zustand store: game loop glue, autosave, toasts, sound triggers
  city/           ← Phaser 3 scene (lazy-loaded): flat top-down Delhi neighbourhood, drag to pan on phones
  audio/sound.ts  ← procedural WebAudio SFX plus a tanpura drone and Raag Bhupali music (no audio files)
  ui/             ← map-first React UI: floating HUD, contextual panel, drawers, weekly briefing/report, decision screen
tests/engine.test.ts
```

### Pollution model (illustrative, not official data)

- `emission_i = base_i × season_i × eventMult_i × (1 − control_i)`
- steady-state concentration `C* = 0.35 × Σ emission / dispersion` (dispersion = season × daily wind × weather)
- the atmosphere relaxes toward `C*` gradually
- AQI comes from concentration through NAQI-style PM2.5 breakpoints
- official AQI = AQI × (1 − perception bias from optics schemes)
- a parallel **no-action baseline** runs alongside to measure the player's real impact (Clean Air Credits, ending)

## Notes and limitations

- Stage 1 is complete and Stage 2 is playable. Stages 3–5 appear as locked future expansions.
- While you are away, the department keeps working at half speed (capped at 8 hours, at most 6 in-game days). It never spawns events or ends the term while you are offline.
- City art is procedural (Phaser Graphics) rather than hand-drawn sprites.
- In dev mode the store is exposed as `window.__hb` for debugging.

---
name: battlemap-project
description: "Battlemap VTT is a multi-file browser app on file://; user choices — no player tokens, 9 map slots, GM-side icon markers, session autosave"
metadata:
  node_type: memory
  type: project
  originSessionId: 93e2037b-9dcc-4961-a25f-2473c9724679
  modified: 2026-08-08T23:23:40.556Z
---

Battlemap project (started 2026-08-08): local VTT for one machine, GM + player screens. Browser app, no server, no Electron. `index.html` + `css/style.css` + `js/{state,icons,effects,fog,render,maps,map,input,ui}.js` — classic scripts sharing globals, NOT ES modules (modules blocked on file://); load order matters, ui.js last (runs startup). User prefers multi-file layout for maintainability.

Scope decisions: **no player tokens** (physical minis sit on the TV) — but GM-side *markers* (Lucide icons, placed by the GM to designate things) were added 2026-08-08 and are a different thing; don't conflate them. Effect templates persist until deleted, grid color slider = line shade black→white. Player view opens via `window.open` about:blank child painted from the same JS context (works on file://, perfect sync).

Features added 2026-08-08: up to 9 map slots switched with number keys 1–9 (each owns its image, fog, effects, camera, grid); session save/open as a JSON file plus localStorage autosave; icon markers; three player-camera modes (whole map / mirror / hold) with "jump to player view". See [[battlemap-architecture]] for how each works.

Perf approach: dirty-flag rAF rendering, fog mask canvas capped at 2560px, grid drawn only over visible rect with density guards, fog PNGs re-encoded for saving only when that slot's mask changed.

Testing: only Firefox on this machine and headless screenshots fail (SWGL framebuffer error, no Xvfb, no Chrome) — confirmed again 2026-08-08, so **visual checks are manual**. Logic is covered by a node DOM stub: `node test/run.js` (28 assertions over slots, markers, camera modes, session round-trip). `node --check js/*.js` for syntax.

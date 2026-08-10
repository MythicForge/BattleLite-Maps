---
name: battlemap-architecture
description: "Deep code map of the battlemap VTT — coordinate spaces, render pipeline, fog/effects/markers, map slots, player camera modes, invariants"
metadata:
  node_type: memory
  type: project
  originSessionId: 93e2037b-9dcc-4961-a25f-2473c9724679
  modified: 2026-08-08T23:24:16.267Z
---

Deep code reference for `/home/nfarmer/Desktop/battlemap` (see [[battlemap-project]] for scope/user choices). Entry point `index.html`; classic scripts share top-level globals, load order: state → icons → effects → fog → render → maps → map → input → ui. `ui.js` runs startup at the bottom (`sizeGM`, `syncControls`, `updateTally`, `restoreAutosave`). Adding a file: new `<script>` tag before `ui.js`.

## Coordinate spaces (the core mental model)
- **Map space** = image pixel coords of `S.img`. Everything persistent lives here: fog mask, effects, markers, grid, brush size, `S.gridSize`.
- **Rotated space** = map space rotated by `S.rotation` about image center. The camera `S.cam {x,y,scale}` is the rotated-space point shown at canvas center.
- **Screen space** = device pixels (canvases sized `clientWidth * DPR`; mouse coords multiplied by DPR in `canvasPos()`).
- `camMatrix(cam,w,h)` = screen←rotated space; `viewMatrix` = camMatrix plus the rotation about image center = screen←map. `screenToMap` inverts the full matrix; `screenToCam` inverts only the camera part (wheel zoom anchors correctly under rotation). Draw *camera-space* overlays (the player-viewport frame) with camMatrix.
- Rotation rotates map+fog+grid+effects together as one unit — grid is aligned to the image, not the screen. Deliberate; don't "fix" it. Markers are the one exception: they counter-rotate so icons read upright.
- Anything drawn inside the map transform that should look constant-width on screen divides by `cam.scale`.

## Render pipeline (render.js)
- Dirty-flag loop: `requestRender(gm, player)` sets flags + schedules one rAF. **Zero CPU when idle — preserve this.** GM-only changes pass `(true,false)`; camera moves pass `S.mirror` as the player flag (nothing else can move the player camera).
- `renderView` order: bg → image → grid → effects/markers → **fog last** (player alpha 1, GM 0.45) → GM overlay (brush ring, marker ghost, player-viewport frame, drag measurement).
- Grid: computed over the visible map rect only; skip if `gridSize*scale < 6`px; hex bails over 20000 cells. Pointy-top, `gridSize` = width across flats.

## Map slots (maps.js) — the live-map pattern
`S.maps[]` holds slots; the **open slot's fields sit directly on S** (`img, rotation, cam, grid*, effects` + globals `fogC/fogCtx/fogScale`). `commitActive()` writes them back, `applySlot(i)` loads them, `showSlot(i)` does commit→apply. Everything else in the app is written as if there were one map — that's the point; don't add slot lookups elsewhere. `syncControls()` (ui.js) pulls sliders/segments back in line after a switch. A new slot inherits the current grid settings and starts fully hidden. Cap `MAX_SLOTS = 9` (the 1–9 hotkeys).

## Saving (maps.js)
One JSON shape for both the save file and the localStorage autosave (`battlemap.session.v1`): every slot with `src` (image data URL) and `fog` (mask PNG data URL). Images are read as data URLs in `loadImageFile` *for this reason* — don't switch back to object URLs. `scheduleSave()` debounces 1200 ms and is called from pointerup, slot ops and control changes; `fogDataURL(slot)` re-encodes only when `slot.fogDirty` (set by fog.js `fogChanged()`). Autosave silently gives up over ~4.6 MB and says so in the status line — that's expected with big maps, the file save is the fallback.

## Fog (fog.js)
Offscreen canvas at image resolution capped by `FOG_MAX=2560`; opaque black = hidden; every stamp multiplies coords and radius by `fogScale`. Hide = source-over black radial gradient, reveal = same through `destination-out`; brushes are their own inverse, which is why there's no fog undo. Any mutation must call `fogChanged()` or saves go stale.

## Effects and markers (effects.js + render.js)
- Shapes: `{type:'circle'|'line'|'cone'|'square', x1,y1,x2,y2, color}` in map space; `effectPath` is the single geometry source, `hitEffect` re-implements the math (reverse iteration = topmost wins).
- Markers: `{type:'marker', x1,y1,x2,y2, icon, size, color}` — (x1,y1) is the *centre*, x2/y2 exist only so the shared 'move' drag works. Drawn from icon geometry (not `effectPath`), circular hit test at `size*0.6`. Click places at `markerSize()` (one cell); dragging out scales. input.js must not pop a zero-drag marker the way it pops stray shape clicks.
- `S.selected` is an **index** into `S.effects` — any splice must fix it.

## Icons (icons.js)
Lucide (ISC) path data is **inlined** because file:// has no network — never add a CDN/npm import. Encoding: `'c cx cy r'` circle, `'r x y w h rx'` rect, anything else an SVG path `d`. One table feeds both `iconSVG()` (sidebar buttons) and `iconPath()` (cached Path2D for canvas). `drawIconMark` strokes a dark halo then the colour so markers read on light maps. Adding an icon = one entry + its name in `MARKER_ICONS`.

## Player camera (render.js + ui.js)
`S.playerMode`: `'fit'` (refit every frame) | `'mirror'` (follows GM) | `'hold'` (parked on `S.holdCam`, stored in **GM-canvas terms** and rescaled by `pCanvas.height/gmCanvas.height` at render). `S.mirror` is the derived boolean the render callers read. `setPlayerMode('hold')` captures `playerCamAsGM()` *before* switching, so leaving mirror parks the table exactly where they were; `matchPlayerView()` (V key) puts the GM camera back on it, so re-mirroring never jumps for players. That round trip is the whole reason hold mode exists. When not mirroring, the GM canvas draws a dashed frame + tag showing what the table sees.

## Gotchas / invariants
- **No ES modules** — file:// blocks them. Classic scripts + shared globals.
- Top-level `const`/`let` are shared cross-file but do NOT appear on `window` (the node harness has to export them explicitly).
- Measurement label assumes 5 ft/cell. DPR captured once from the GM window.
- Keyboard: 1–9 slots, M mirror/hold, V jump to player view, Del, Esc. The handler bails on any INPUT that isn't a range, so text fields are safe.
- Testing: headless Firefox screenshots fail (SWGL) — visual checks are manual. `node test/run.js` drives the logic through a DOM/canvas stub (`test/harness.js`, includes a hand-rolled DOMMatrix); it catches load errors, slot/camera/session regressions, not rendering.

## Known future-work candidates (user-acknowledged, not built)
Grid offset x/y sliders for aligning pre-gridded maps; fog undo; player tokens (explicitly declined).

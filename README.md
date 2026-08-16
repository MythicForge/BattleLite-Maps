<p align="center">
  <img src="logo.webp" width="220" alt="Battlemap">
</p>

# Battlemap

A local virtual tabletop for in-person games. One machine, two screens: the **GM console** on your laptop, the **player screen** on the TV the table is looking at.

It runs entirely in the browser. With no extra frills, bells and whistles beyond what is generally needed for running an in person game. This app was designed to be very lightweight and require very minimal hardware.
The design and purpose of this app was to be the opposite of what a lot of modern VTT apps have become, and be just a simple tool that allows for GM's and players to play without having to worry your PC sounding like a jet engine taking off.

This was 100% created using AI. If you are an advocate against using anything AI, I apologize but you will need to find another app. This is **NOT** intended as a statement of whether AI is good or not, just being up front and honest how this app was made.

I lack the skill or desire to take the time away from daily life to pour into a tool I use once a weekend. However, if you are a developer and would like to contribute or want to adjust I am not opposed to contributions.

If this is something you feel would be helpful to you and your table, here is some documentation.

---

## What it does

**Maps and scenes**
- Up to **9 scenes**, each with its own image, fog mask, effects, markers, camera and grid settings. Switch with the `1`–`9` keys.
- Drop a `png` / `jpg` / `webp` on the stage, or use **Add map…**. Images are re-encoded to WebP (q0.85) so sessions stay small.
- Free rotation (slider or 90° buttons). Map, grid, fog and effects rotate as one unit — the grid stays aligned to the image, not to your screen.

**Fog of war**
- Hide and reveal brushes with an adjustable radius, plus **Hide all** / **Reveal all**.
- The GM sees fog at 45% so you can work through it; the table sees it as pitch black.
- There is no undo button so you will need to paint back over for small fixes.

**Grid**
- Off / square / hex (pointy-top). Cell size, line shade (black→white) and opacity.
- Drawn only over the visible area with density guards, so a huge map stays cheap.

**Effects and markers**
- Templates — circle, line, cone, square — in any colour. They persist until you delete them, so a lingering fireball stays lingering.
- **Markers**: 24 [Lucide](https://lucide.dev) icons the GM drops to designate things (a door, a trap, "look here"). Click places one cell wide; drag out to scale. They counter-rotate so icons read upright at any map rotation.
- The default measurement is 5 ft per cell.

**Player screen — the frame is the control**
- Open it with the **Open** button (top right), then drag it to the second display and press `F` in that window for fullscreen. Browsers won't let a popup hide its own address bar; fullscreen is what actually clears the chrome.
- A dashed **frame** on your canvas is exactly what the table sees. Drag the frame to reframe them, grab a corner to zoom them. The frame's interior still pans  your own view.
- **Follow** (`M`) locks the table to your camera — a red hairline lights the top edge of your screen the whole time it's on, so you know without reading anything. Release it and they stay where they were.
- Send the current scene and framing with `P`; jump your own view to theirs with `V`.
- The table can sit on a *different* scene from the one you're editing to prep the next encounter.

**Session persistence**
- **Autosave** to IndexedDB, debounced ~1.2 s, no size cap. Requests persistent storage so the browser won't evict it.
- **Save session… / Open session…** writes one JSON file holding every scene with its image, fog mask, effects, markers, camera and grid.
- Autosave is keyed to the **origin** you serve on. `localhost:3000` and  `localhost:5000` are different sessions; change the port and the console comes up empty. Use *Save session…* before moving.

---

## Setup

### Requirements
Node 18+ (for the dev server and the one dependency), or Docker. Any modern browser; the app has been used on Firefox and Chrome.

### Run it locally

```bash
npm install          # fetches lucide (~417 KB, the only runtime dependency)
npm start            # npx serve . -l 3000
```

Open **http://localhost:3000**.

### Run it in Docker

```bash
docker compose up -d --build
```

Also **http://localhost:3000** — the port matches `npm start` on purpose, so the session you autosaved running locally is the session you get in the container.
The image is nginx plus static files; node and npm stay in the build stage.

### Opening `index.html` directly

The app is written to work by opening directly but Chrome gives no IndexedDB there, so **there is no autosave**. Save session files by hand if you go that route. 

> If you want the lucide icons, you will still need to run `npm install` first to add them
> `node_modules/` must sit at the same folder level as `index.html`

---

## Keys

| Key | Does |
|---|---|
| `1`–`9` | open that scene |
| `S` | scenes drawer |
| `F` · `K` · `E` | fog · markers · effects |
| `G` · `R` | grid · your view |
| `M` | table follows your view / stops following |
| `P` | send this scene and framing to the table |
| `V` | go to what the table is looking at |
| `Del` | remove selected effect or marker |
| `Esc` | back out — closes the open panel, then the drawer |
| Wheel | zoom · drag to pan · right-drag pans in any tool |
| `F` *(player window)* | fullscreen |


---

## Layout

```
index.html          markup for the whole console
css/style.css       everything visual
js/state.js         shared state object S
js/icons.js         Lucide lookup, marker palette, canvas Path2D cache
js/effects.js       shape geometry + hit testing
js/fog.js           offscreen fog mask (capped at 2560 px)
js/render.js        dirty-flag rAF loop, both canvases
js/maps.js          scene slots, save / open / autosave
js/map.js           image loading, WebP re-encode
js/input.js         pointer + keyboard
js/ui.js            controls, drawer, dock, player window; runs startup
test/               node DOM/canvas stub
docker/nginx.conf   cache rules for the container
```

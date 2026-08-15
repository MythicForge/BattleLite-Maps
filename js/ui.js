'use strict';
/* Console wiring: the dock, its flyouts, the scenes drawer, tools, sliders,
   the player window and the tally.

   Shape of the console: one dock key per group of controls. A key opens its
   flyout above it and nothing else is on screen. Panels stay open while you
   work — only Esc, the same key again, or another key closes one.
   Loaded last: runs startup at the bottom (icon palette, canvas sizing,
   autosave restore). */

/* ---------- dock and flyouts ---------- */
const dock = document.getElementById('dock');
const dockKeys = Array.from(dock.querySelectorAll('.key'));
const flyouts = {
  fog: document.getElementById('fly-fog'),
  marker: document.getElementById('fly-marker'),
  effects: document.getElementById('fly-effects'),
  grid: document.getElementById('fly-grid'),
  view: document.getElementById('fly-view'),
  players: document.getElementById('fly-players'),
};
/* which dock key owns each tool, so the key lights while the tool is armed */
const TOOL_KEY = {
  select: 'select', hide: 'fog', reveal: 'fog', marker: 'marker',
  circle: 'effects', line: 'effects', cone: 'effects', square: 'effects',
};
let openPanel = null;

/* Dock keys and the drawer's header buttons carry data-icon; the shapes come
   from the same inlined Lucide table as the map markers (icons.js). */
for (const b of document.querySelectorAll('[data-icon]')) {
  b.innerHTML = iconSVG(b.dataset.icon, b.classList.contains('mini') ? 15 : 19);
}

function drawerOpen() { return document.body.classList.contains('drawer'); }

function paintDock() {
  for (const k of dockKeys) {
    const key = k.dataset.key;
    const lit = key === TOOL_KEY[S.tool] || key === openPanel ||
                (key === 'scenes' && drawerOpen());
    k.classList.toggle('active', lit);
    k.classList.toggle('open', key === openPanel);
  }
}

/* Flyouts are positioned in JS: centred over their key, clamped to the stage
   so the outer keys do not push a panel off screen. */
function placeFlyout(name) {
  const el = flyouts[name];
  const key = dockKeys.find(k => k.dataset.key === name);
  if (!el || !key || !el.getBoundingClientRect) return;
  const kb = key.getBoundingClientRect(), sb = stage.getBoundingClientRect();
  const w = el.offsetWidth || 242;
  const x = kb.left - sb.left + kb.width / 2 - w / 2;
  el.style.left = Math.max(14, Math.min(x, sb.width - w - 14)) + 'px';
}

function showPanel(name) {
  for (const n of Object.keys(flyouts)) flyouts[n].hidden = n !== name;
  openPanel = name;
  if (name) placeFlyout(name);
  paintDock();
}
function togglePanel(name) { showPanel(openPanel === name ? null : name); }

function setDrawer(open) {
  document.body.classList.toggle('drawer', open);
  paintDock();
}

/* Esc backs out of the console one layer at a time; input.js asks first. */
function escapeConsole() {
  if (openPanel) { showPanel(null); return true; }
  if (drawerOpen()) { setDrawer(false); return true; }
  return false;
}

for (const k of dockKeys) {
  k.onclick = () => {
    const key = k.dataset.key;
    if (key === 'scenes') { setDrawer(!drawerOpen()); return; }
    if (key === 'select') { showPanel(null); setTool('select'); return; }
    togglePanel(key);
  };
}

/* ---------- drawer ---------- */
const drawerTabs = document.getElementById('drawerTabs');
const panes = {
  scenes: document.getElementById('pane-scenes'),
  session: document.getElementById('pane-session'),
  keys: document.getElementById('pane-keys'),
};
for (const t of drawerTabs.children) {
  t.onclick = () => {
    for (const o of drawerTabs.children) o.classList.toggle('active', o === t);
    for (const n of Object.keys(panes)) panes[n].hidden = n !== t.dataset.tab;
  };
}
document.getElementById('btnCloseDrawer').onclick = () => setDrawer(false);

/* ---------- tools ---------- */
const toolButtons = {
  select: null,   // implicit — Esc or after actions
  hide: document.getElementById('toolHide'),
  reveal: document.getElementById('toolReveal'),
  circle: document.getElementById('toolCircle'),
  line: document.getElementById('toolLine'),
  cone: document.getElementById('toolCone'),
  square: document.getElementById('toolSquare'),
  marker: document.getElementById('toolMarker'),
};
function setTool(t) {
  S.tool = (S.tool === t) ? 'select' : t;        // toggle off = back to select
  for (const [name, btn] of Object.entries(toolButtons)) {
    if (btn) btn.classList.toggle('active', name === S.tool);
  }
  gmCanvas.style.cursor = (S.tool === 'select') ? 'grab' : 'crosshair';
  paintDock();
  requestRender(true, false);
}
for (const name of ['hide', 'reveal', 'circle', 'line', 'cone', 'square', 'marker']) {
  toolButtons[name].onclick = () => setTool(name);
}

/* ---------- sliders ---------- */
function bindSlider(id, valId, fmt, apply) {
  const el = document.getElementById(id), val = document.getElementById(valId);
  el.oninput = () => { val.textContent = fmt(el.value); apply(+el.value); };
  el.onchange = scheduleSave;
}
bindSlider('rotSlider', 'rotVal', v => v + '°', v => { S.rotation = v; requestRender(); });
bindSlider('gridSize', 'gridSizeVal', v => v + ' px', v => { S.gridSize = v; requestRender(); });
bindSlider('gridShade', 'gridShadeVal', v => v, v => { S.gridShade = v; requestRender(); });
bindSlider('gridOp', 'gridOpVal', v => v + '%', v => { S.gridOp = v / 100; requestRender(); });
bindSlider('brushSize', 'brushVal', v => v + ' px', v => { S.brushSize = v; requestRender(true, false); });

function putSlider(id, valId, value, fmt) {
  const el = document.getElementById(id);
  el.value = value;
  document.getElementById(valId).textContent = fmt(value);
}
/* Pull every control back in line with S — used after a slot switch or a
   session restore, when the live map changed underneath the console. */
function syncControls() {
  putSlider('rotSlider', 'rotVal', S.rotation, v => v + '°');
  putSlider('gridSize', 'gridSizeVal', S.gridSize, v => v + ' px');
  putSlider('gridShade', 'gridShadeVal', S.gridShade, v => v);
  putSlider('gridOp', 'gridOpVal', Math.round(S.gridOp * 100), v => v + '%');
  putSlider('brushSize', 'brushVal', S.brushSize, v => v + ' px');
  document.getElementById('fxColor').value = S.fxColor;
  document.getElementById('mkColor').value = S.mkColor;
  for (const b of gridSeg.children) b.classList.toggle('active', b.dataset.type === S.gridType);
  for (const b of document.querySelectorAll('#iconGrid button')) {
    b.classList.toggle('active', b.dataset.icon === S.mkIcon);
  }
}

/* ---------- your view ---------- */
function setRotation(deg) {
  deg = ((deg + 180) % 360 + 360) % 360 - 180;   // wrap to -180..180
  S.rotation = deg;
  putSlider('rotSlider', 'rotVal', deg, v => v + '°');
  requestRender();
  scheduleSave();
}
document.getElementById('btnRotL').onclick = () => setRotation(S.rotation - 90);
document.getElementById('btnRotR').onclick = () => setRotation(S.rotation + 90);
document.getElementById('btnRot0').onclick = () => setRotation(0);

document.getElementById('btnFit').onclick = () => {
  if (!S.img) return;
  S.cam = fitCam(gmCanvas);
  requestRender(true, S.mirror);
};
document.getElementById('btnCenter').onclick = () => {
  if (!S.img) return;
  S.cam.x = S.img.width / 2;
  S.cam.y = S.img.height / 2;
  requestRender(true, S.mirror);
};

/* ---------- grid ---------- */
const gridSeg = document.getElementById('gridType');
for (const btn of gridSeg.children) {
  btn.onclick = () => {
    S.gridType = btn.dataset.type;
    for (const b of gridSeg.children) b.classList.toggle('active', b === btn);
    requestRender();
    scheduleSave();
  };
}

/* ---------- fog ---------- */
document.getElementById('btnHideAll').onclick = () => { if (fogC) { hideAll(); scheduleSave(); } };
document.getElementById('btnRevealAll').onclick = () => { if (fogC) { revealAll(); scheduleSave(); } };

/* ---------- effects ---------- */
document.getElementById('fxColor').oninput = e => {
  S.fxColor = e.target.value;
  const sel = S.effects[S.selected];
  if (sel && sel.type !== 'marker') { sel.color = S.fxColor; requestRender(); scheduleSave(); }
};
document.getElementById('btnDeleteFx').onclick = () => {
  if (S.selected >= 0) { S.effects.splice(S.selected, 1); S.selected = -1; requestRender(); scheduleSave(); }
};
document.getElementById('btnClearFx').onclick = () => {
  S.effects = []; S.selected = -1; requestRender(); scheduleSave();
};

/* ---------- markers ---------- */
const iconGrid = document.getElementById('iconGrid');
for (const name of MARKER_ICONS) {
  const b = document.createElement('button');
  b.dataset.icon = name;
  b.title = name.replace(/-/g, ' ');
  b.innerHTML = iconSVG(name, 18);
  b.onclick = () => {
    S.mkIcon = name;
    for (const other of iconGrid.children) other.classList.toggle('active', other === b);
    const sel = S.effects[S.selected];
    if (sel && sel.type === 'marker') { sel.icon = name; scheduleSave(); }
    if (S.tool !== 'marker') setTool('marker');
    requestRender();
  };
  iconGrid.appendChild(b);
}
document.getElementById('mkColor').oninput = e => {
  S.mkColor = e.target.value;
  const sel = S.effects[S.selected];
  if (sel && sel.type === 'marker') { sel.color = S.mkColor; scheduleSave(); }
  requestRender();
};

/* ---------- scene cards ---------- */
const slotsEl = document.getElementById('slots');
const slotsEmpty = document.getElementById('slotsEmpty');
function refreshSlots() {
  const live = liveSlotIndex();
  slotsEl.innerHTML = '';
  slotsEmpty.style.display = S.maps.length ? 'none' : '';
  S.maps.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (i === S.active ? ' active' : '') + (i === live ? ' live' : '');
    b.style.backgroundImage = `url(${m.thumb})`;
    b.title = `${m.name} — press ${i + 1}, double-click to rename`;
    b.innerHTML = `<span class="led"></span><span class="num">${i + 1}</span>` +
                  `<span class="name"></span><span class="tag">On air</span>` +
                  `<span class="kill" title="Remove this map">×</span>`;
    b.querySelector('.name').textContent = m.name;
    b.onclick = e => {
      if (e.target.classList.contains('kill')) {
        if (confirm(`Remove “${m.name}”? Its fog, markers and effects go with it.`)) removeMap(i);
        return;
      }
      showSlot(i);
    };
    b.ondblclick = () => {
      const n = prompt('Map name', m.name);
      if (n && n.trim()) { renameMap(i, n.trim()); refreshSlots(); }
    };
    slotsEl.appendChild(b);
  });
}

/* ---------- session ---------- */
const saveState = document.getElementById('saveState');
function setSaveStatus(text, kind) {
  saveState.textContent = text;
  saveState.className = 'status' + (kind ? ' ' + kind : '');
}
document.getElementById('btnSaveSession').onclick = saveSessionFile;
document.getElementById('btnOpenSession').onclick = () => document.getElementById('sessionInput').click();
document.getElementById('sessionInput').onchange = e => {
  openSessionFile(e.target.files[0]);
  e.target.value = '';
};

/* ---------- player camera ---------- */
const tally = document.getElementById('tally');
const tallyState = document.getElementById('tallyState');
const tallyHint = document.getElementById('tallyHint');
const btnPlayer = document.getElementById('btnPlayer');
const playerNote = document.getElementById('playerNote');
const modeSeg = document.getElementById('playerMode');

const MODE_COPY = {
  closed: ['Player screen closed', 'Open it, drag it to the TV, click it for fullscreen'],
  fit: ['Whole map', 'Players see everything you have revealed'],
  mirror: ['Mirroring · live', 'Players follow your camera'],
  hold: ['Held', 'Players are parked — look around freely'],
};
const NOTE_COPY = {
  fit: 'Players see the whole map, whatever you do.',
  mirror: 'Players follow your camera. Press M to park them here and go scouting.',
  hold: 'Players are parked on this scene and framing. Switch maps freely — they stay put. Press V to rejoin them, then M to mirror again.',
};

function setPlayerMode(mode) {
  if (mode === 'hold') {
    S.holdCam = playerCamAsGM();      // park on what they can see right now,
    S.holdSlot = S.active;            // on the scene they are looking at
  } else {
    S.holdSlot = -1;
  }
  S.playerMode = mode;
  S.mirror = mode === 'mirror';
  for (const b of modeSeg.children) b.classList.toggle('active', b.dataset.mode === mode);
  updateTally();
  refreshSlots();                     // the ON AIR lamp may have moved to another card
  requestRender(true, true);
}
for (const b of modeSeg.children) b.onclick = () => setPlayerMode(b.dataset.mode);

/* The mode lives on <body> as well: the tally chip, the top rail and the LED
   on the live scene card are all styled off it. */
/* The slot the table is actually looking at — the open one, unless hold has
   parked them on a different scene. */
function liveSlotIndex() {
  const held = S.playerMode === 'hold' && S.holdSlot >= 0 && S.maps[S.holdSlot];
  return held ? S.holdSlot : S.active;
}

function updateTally() {
  const open = playerWin && !playerWin.closed;
  const key = open ? S.playerMode : 'closed';
  document.body.dataset.mode = key;
  tallyState.textContent = MODE_COPY[key][0];
  const parked = S.playerMode === 'hold' && S.holdSlot >= 0 &&
                 S.holdSlot !== S.active && S.maps[S.holdSlot];
  tallyHint.textContent = (open && parked)
    ? `Parked on ${S.maps[S.holdSlot].name} — you are off-screen`
    : MODE_COPY[key][1];
  btnPlayer.textContent = open ? 'Focus' : 'Open';
  playerNote.textContent = NOTE_COPY[S.playerMode];
}

function matchPlayerView() {
  if (!S.img) return;
  const cam = playerCamAsGM();
  const parked = S.playerMode === 'hold' && S.holdSlot >= 0 && S.holdSlot !== S.active;
  if (parked && S.maps[S.holdSlot]) showSlot(S.holdSlot);   // their scene, not just their framing
  S.cam = cam;
  requestRender(true, S.mirror);
}
document.getElementById('btnMatchPlayer').onclick = matchPlayerView;

btnPlayer.onclick = () => {
  if (playerWin && !playerWin.closed) { playerWin.focus(); return; }
  playerWin = window.open('', 'battlemapPlayer',
    'popup=yes,width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
  if (!playerWin) {
    setSaveStatus('Popup blocked — allow popups for this page, then try again', 'warn');
    return;
  }
  const d = playerWin.document;
  d.title = 'Battlemap — Player View';
  d.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  d.body.innerHTML = '';
  const icon = d.createElement('link');            // the child window is about:blank — give it the tab icon
  icon.rel = 'icon';
  icon.href = new URL('favicon.ico', location.href).href;
  d.head.appendChild(icon);
  pCanvas = d.createElement('canvas');
  pCanvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
  d.body.appendChild(pCanvas);
  pCtx = pCanvas.getContext('2d');
  const sizeP = () => {
    pCanvas.width = playerWin.innerWidth * DPR;
    pCanvas.height = playerWin.innerHeight * DPR;
    requestRender(true, true);
  };
  playerWin.addEventListener('resize', sizeP);
  playerWin.addEventListener('beforeunload', () => setTimeout(() => { updateTally(); requestRender(true, false); }, 60));
  fullscreenPrompt(playerWin, d);
  sizeP();
  updateTally();
};

/* The address bar cannot be hidden by window features — browsers force it on
   popups. Fullscreen is what actually clears the chrome off the table's
   screen, and it needs a gesture in *that* window, so the player screen asks
   for one: a chip in the corner, gone the moment it goes fullscreen. */
function fullscreenPrompt(win, d) {
  const chip = d.createElement('div');
  chip.textContent = 'Click here or press F for fullscreen';
  chip.style.cssText =
    'position:fixed;right:14px;bottom:14px;padding:9px 13px;border-radius:8px;' +
    'background:rgba(13,16,21,.92);border:1px solid #2a313d;color:#828b9b;' +
    'font:12px/1 system-ui,sans-serif;letter-spacing:.02em;cursor:pointer;' +
    'z-index:2;user-select:none';
  d.body.appendChild(chip);

  const go = () => {
    const el = d.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  };
  const paint = () => { chip.style.display = d.fullscreenElement ? 'none' : ''; };

  win.addEventListener('click', go);
  win.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') go();
    else if (e.key === 'Escape' && d.fullscreenElement) d.exitFullscreen();
  });
  d.addEventListener('fullscreenchange', paint);
  paint();
}

/* ---------- canvas sizing (startup) ---------- */
function sizeGM() {
  gmCanvas.width = stage.clientWidth * DPR;
  gmCanvas.height = stage.clientHeight * DPR;
  if (openPanel) placeFlyout(openPanel);       // the dock moved with the stage
  requestRender(true, false);
}
new ResizeObserver(sizeGM).observe(stage);
sizeGM();
syncControls();
paintDock();
updateTally();
/* Nothing on the stage and no obvious way in, so the drawer starts open;
   restoreAutosave closes it again if it brings maps back (the read is async
   now that the session lives in IndexedDB). */
setDrawer(true);
restoreAutosave();

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
  circle: 'effects', line: 'effects', cone: 'effects', square: 'effects', gridmatch: 'grid',
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
  gridmatch: document.getElementById('toolGridMatch'),
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
for (const name of ['hide', 'reveal', 'circle', 'line', 'cone', 'square', 'marker', 'gridmatch']) {
  toolButtons[name].onclick = () => setTool(name);
}

/* ---------- sliders ---------- */
function bindSlider(id, valId, fmt, apply) {
  const el = document.getElementById(id), val = document.getElementById(valId);
  el.oninput = () => { val.textContent = fmt(el.value); apply(+el.value); };
  el.onchange = scheduleSave;
}
bindSlider('rotSlider', 'rotVal', v => v + '°', v => { S.rotation = v; requestRender(); });
const fmtPx = v => (+v).toFixed(1) + ' px';
bindSlider('gridSize', 'gridSizeVal', fmtPx, v => { S.gridSize = v; fitOffsetSliders(); requestRender(); });
bindSlider('gridOffX', 'gridOffXVal', fmtPx, v => { S.gridOffX = v; requestRender(); });
bindSlider('gridOffY', 'gridOffYVal', fmtPx, v => { S.gridOffY = v; requestRender(); });
bindSlider('gridShade', 'gridShadeVal', v => v, v => { S.gridShade = v; requestRender(); });
bindSlider('gridOp', 'gridOpVal', v => v + '%', v => { S.gridOp = v / 100; requestRender(); });
bindSlider('brushSize', 'brushVal', v => v + ' px', v => { S.brushSize = v; requestRender(true, false); });

/* One repeat of the grid covers every alignment, so each offset slider spans
   exactly that; past it the grid would just repeat. Hex rows alternate, so
   they repeat every two rows down (g·√3), not every cell. */
function gridPeriod(axis) {
  return (axis === 'Y' && S.gridType === 'hex') ? S.gridSize * Math.sqrt(3) : S.gridSize;
}
function fitOffsetSliders() {
  for (const k of ['X', 'Y']) {
    const key = 'gridOff' + k, p = gridPeriod(k);
    if (S[key] < 0 || S[key] >= p) S[key] = ((S[key] % p) + p) % p;
    document.getElementById(key).max = p;
    putSlider(key, key + 'Val', S[key], fmtPx);
  }
}

function putSlider(id, valId, value, fmt) {
  const el = document.getElementById(id);
  el.value = value;
  document.getElementById(valId).textContent = fmt(value);
}
/* Pull every control back in line with S — used after a slot switch or a
   session restore, when the live map changed underneath the console. */
function syncControls() {
  putSlider('rotSlider', 'rotVal', S.rotation, v => v + '°');
  putSlider('gridSize', 'gridSizeVal', S.gridSize, fmtPx);
  fitOffsetSliders();
  putSlider('gridShade', 'gridShadeVal', S.gridShade, v => v);
  putSlider('gridOp', 'gridOpVal', Math.round(S.gridOp * 100), v => v + '%');
  putSlider('brushSize', 'brushVal', S.brushSize, v => v + ' px');
  document.getElementById('fxColor').value = S.fxColor;
  document.getElementById('mkColor').value = S.mkColor;
  for (const b of gridSeg.children) b.classList.toggle('active', b.dataset.type === S.gridType);
  refreshFogUndo();
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
  requestRender(true, S.follow);
};
document.getElementById('btnCenter').onclick = () => {
  if (!S.img) return;
  S.cam.x = S.img.width / 2;
  S.cam.y = S.img.height / 2;
  requestRender(true, S.follow);
};

/* ---------- grid ---------- */
const gridSeg = document.getElementById('gridType');
for (const btn of gridSeg.children) {
  btn.onclick = () => {
    S.gridType = btn.dataset.type;
    for (const b of gridSeg.children) b.classList.toggle('active', b === btn);
    fitOffsetSliders();
    requestRender();
    scheduleSave();
  };
}

/* Match printed grid: the GM drags corner to corner across a run of printed
   squares and says how many. Cell size is that span over the count — a long
   run averages out click error, which a single square never would. The drag's
   top-left corner is a grid corner, so it sets the shift too. */
function finishGridMatch(a, b) {
  const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  setTool('select');
  if (Math.max(w, h) < 10) return false;
  const along = w >= h ? w : h;
  const guess = Math.max(1, Math.round(along / S.gridSize));
  const n = parseFloat(prompt(`How many printed squares ${w >= h ? 'across' : 'down'} did you drag over?`, guess));
  if (!(n >= 1)) return false;
  let cell = along / n;
  const other = w >= h ? h : w, m = Math.round(other / cell);
  if (m >= 1) cell = (along + other) / (n + m);   // both sides measured: use both
  S.gridSize = Math.min(400, Math.max(20, cell));
  if (S.gridType !== 'square') S.gridType = 'square';
  S.gridOffX = Math.min(a.x, b.x);
  S.gridOffY = Math.min(a.y, b.y);
  syncControls();                                 // also wraps the shift into one cell
  requestRender();
  scheduleSave();
  return true;
}

/* ---------- fog ---------- */
document.getElementById('btnHideAll').onclick = () => { if (fogC) { hideAll(); scheduleSave(); } };
document.getElementById('btnRevealAll').onclick = () => { if (fogC) { revealAll(); scheduleSave(); } };
const btnFogUndo = document.getElementById('btnFogUndo');
const btnFogRedo = document.getElementById('btnFogRedo');
btnFogUndo.onclick = () => { if (undoFog()) scheduleSave(); };
btnFogRedo.onclick = () => { if (redoFog()) scheduleSave(); };
/* History is per map, so the buttons follow slot switches too. */
function refreshFogUndo() {
  const m = S.maps[S.active];
  btnFogUndo.disabled = !(m && m.fogUndo && m.fogUndo.length);
  btnFogRedo.disabled = !(m && m.fogRedo && m.fogRedo.length);
}

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
                  `<span class="send" title="Send the table to this scene">` +
                  iconSVG('monitor', 13) + `</span>` +
                  `<span class="kill" title="Remove this map">×</span>`;
    b.querySelector('.name').textContent = m.name;
    b.onclick = e => {
      if (e.target.closest && e.target.closest('.send')) { sendPlayersTo(i); return; }
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

/* ---------- the player screen ----------
   The table's view is a frame on the GM canvas, not a mode: drag it to
   reframe them. `follow` is the only thing that links the two cameras, and
   while it is on the frame is locked, because the frame *is* your view. */
const tally = document.getElementById('tally');
const tallyState = document.getElementById('tallyState');
const tallyHint = document.getElementById('tallyHint');
const btnPlayer = document.getElementById('btnPlayer');
const playerNote = document.getElementById('playerNote');
const btnFollow = document.getElementById('btnFollow');
const btnBlackout = document.getElementById('btnBlackout');

const STATE_COPY = {
  closed: ['Player screen closed', 'Open it on the second display'],
  follow: ['Following you · live', 'The table sees your camera and your scenes'],
  parked: ['Table parked', 'Drag the frame to reframe them'],
};
const NOTE_COPY = {
  follow: 'The table is on your camera. Anything you open, they see. Press M to leave them here and go scouting.',
  parked: 'Drag the dashed frame to reframe the table, its corners to zoom them. Press P to send them your scene.',
};

/* The camera the table gets when they first arrive somewhere: the whole map. */
function fitPlayers() {
  if (!S.img) return;
  S.pcam = fitCam(gmCanvas, playerSrc());
  requestRender(true, true);
}

function setFollow(on) {
  if (on) { if (S.img) S.playerSlot = S.active; }   // following means their scene is yours
  else if (S.img) S.pcam = playerCamAsGM();        // park them exactly where they are now
  S.follow = !!on;
  updateTally();
  refreshSlots();
  requestRender(true, true);
}

/* Put the table on a scene — the open one by default (P), or a card in the
   drawer. Their framing comes with it, so the shot is deliberate. */
function sendPlayersTo(i, cam) {
  if (i < 0 || !S.maps[i]) return;
  S.playerSlot = i;
  S.pcam = cam ? {...cam} : (i === S.active ? {...S.cam} : null);
  if (!S.pcam) S.pcam = fitCam(gmCanvas, playerSrc());
  updateTally();
  refreshSlots();
  requestRender(true, true);
}

/* B — the table goes black while you swap scenes or set something up, and
   comes back exactly as it was. Not saved: a reload never starts dark. */
function setBlackout(on) {
  S.blackout = !!on;
  updateTally();
  requestRender(true, true);
}
document.getElementById('btnBlackout').onclick = () => setBlackout(!S.blackout);

/* ---------- table scale ----------
   Pixels per inch of the TV, in player-canvas pixels. A first guess comes
   from the diagonal; the ruler on the table is what makes it exact. Saved per
   browser — it describes the hardware, so it should not travel in a session. */
const TABLE_KEY = 'battlemap.table.v1';
const btnInchLock = document.getElementById('btnInchLock');
const btnRuler = document.getElementById('btnRuler');
const tableNote = document.getElementById('tableNote');
const tablePpi = document.getElementById('tablePpi');

function loadTable() {
  try {
    const t = JSON.parse(localStorage.getItem(TABLE_KEY) || 'null');
    if (t && t.ppi > 0) S.table = {ppi: +t.ppi, lock: !!t.lock};
  } catch (e) {}
}
function saveTable() {
  try { localStorage.setItem(TABLE_KEY, JSON.stringify(S.table)); } catch (e) {}
}
function refreshTable() {
  if (S.table.ppi) putSlider('tablePpi', 'tablePpiVal', S.table.ppi, v => (+v).toFixed(1) + ' px');
  btnInchLock.disabled = !S.table.ppi;
  btnInchLock.classList.toggle('active', S.table.lock && !!S.table.ppi);
  btnRuler.classList.toggle('active', S.calibrating);
  btnRuler.textContent = S.calibrating ? 'Hide the ruler' : 'Show inch ruler on table';
}
function setTablePpi(ppi) {
  S.table.ppi = Math.min(300, Math.max(10, Math.round(ppi * 10) / 10));
  saveTable();
  refreshTable();
  requestRender(true, true);
}
function setInchLock(on) {
  if (on && !S.table.ppi) {
    tableNote.textContent = 'Set pixels per inch first — type the TV size or use the ruler.';
    showPanel('players');
    return;
  }
  S.table.lock = !!on;
  saveTable();
  refreshTable();
  requestRender(true, true);
}
function setRuler(on) {
  S.calibrating = !!on;
  if (on && !S.table.ppi) setTablePpi(+tablePpi.value);   // start from where the slider sits
  if (on && !(playerWin && !playerWin.closed)) tableNote.textContent = 'Open the player screen to see the ruler on the TV.';
  refreshTable();
  requestRender(true, true);
}
tablePpi.oninput = () => setTablePpi(+tablePpi.value);
btnInchLock.onclick = () => setInchLock(!S.table.lock);
btnRuler.onclick = () => setRuler(!S.calibrating);
document.getElementById('btnTvDiag').onclick = () => {
  const diag = +document.getElementById('tvDiag').value;
  if (!(diag > 0)) { tableNote.textContent = 'Type the TV diagonal in inches, e.g. 55.'; return; }
  if (!playerWin || playerWin.closed) {
    tableNote.textContent = 'Open the player screen on the TV first — the estimate reads its resolution.';
    return;
  }
  // screen.* is in that window's CSS px; the player canvas is CSS px × DPR
  const sc = playerWin.screen;
  setTablePpi(Math.hypot(sc.width, sc.height) * DPR / diag);
  tableNote.textContent = `Estimated from a ${sc.width}×${sc.height} screen. Show the ruler to check it.`;
};

btnFollow.onclick = () => setFollow(!S.follow);
document.getElementById('btnSendScene').onclick = () => sendPlayersTo(S.active, S.cam);
document.getElementById('btnFitPlayers').onclick = fitPlayers;

/* The slot the table is actually looking at. */
function liveSlotIndex() {
  if (S.follow) return S.active;
  return (S.playerSlot >= 0 && S.maps[S.playerSlot]) ? S.playerSlot : S.active;
}

/* The state lives on <body> too: the tally chip, the top rail and the ON AIR
   lamp on the scene card are all styled off it. */
function updateTally() {
  const open = playerWin && !playerWin.closed;
  const key = !open ? 'closed' : (S.follow ? 'follow' : 'parked');
  document.body.dataset.mode = key;
  tallyState.textContent = STATE_COPY[key][0];
  const away = !S.follow && S.playerSlot >= 0 && S.playerSlot !== S.active && S.maps[S.playerSlot];
  tallyHint.textContent = (open && away)
    ? `On ${S.maps[S.playerSlot].name} — you are off-screen`
    : STATE_COPY[key][1];
  btnPlayer.textContent = open ? 'Focus' : 'Open';
  btnFollow.classList.toggle('active', S.follow);
  btnFollow.textContent = S.follow ? 'Following you' : 'Follow my view';
  btnBlackout.classList.toggle('active', S.blackout);
  btnBlackout.textContent = S.blackout ? 'Show the map · B' : 'Black out the table · B';
  if (open && S.blackout) {
    tallyState.textContent = 'Table blacked out';
    tallyHint.textContent = 'Press B to show them the map';
  }
  playerNote.textContent = NOTE_COPY[S.follow ? 'follow' : 'parked'];
}

/* V — go and stand where the table is standing, scene included. */
function matchPlayerView() {
  if (!S.img) return;
  const cam = playerCamAsGM();
  const away = !S.follow && S.playerSlot >= 0 && S.playerSlot !== S.active;
  if (away && S.maps[S.playerSlot]) showSlot(S.playerSlot);
  S.cam = cam;
  requestRender(true, S.follow);
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
  // cursor:none — a stray pointer parked on the TV is the one thing the table should never see
  pCanvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;cursor:none';
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
  keepAwake(playerWin);
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

/* Screen wake lock, so the TV and the laptop do not dim or sleep halfway
   through a fight. The browser drops the lock whenever the page is hidden,
   so it is taken again each time the window comes back. Secure contexts only
   (localhost is one); elsewhere this quietly does nothing. */
function keepAwake(win) {
  const wl = win.navigator && win.navigator.wakeLock;
  if (!wl) return;
  const take = () => {
    if (win.closed || win.document.visibilityState !== 'visible') return;
    wl.request('screen').catch(() => {});
  };
  win.document.addEventListener('visibilitychange', take);
  take();
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
keepAwake(window);
loadTable();
refreshTable();
syncControls();
paintDock();
updateTally();
if (!S.pcam && S.img) fitPlayers();
/* Nothing on the stage and no obvious way in, so the drawer starts open;
   restoreAutosave closes it again if it brings maps back (the read is async
   now that the session lives in IndexedDB). */
setDrawer(true);
restoreAutosave();

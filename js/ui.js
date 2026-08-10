'use strict';
/* Console wiring: tools, sliders, map slots, the player window and the tally.
   Loaded last: runs startup at the bottom (icon palette, canvas sizing,
   autosave restore). */

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

/* ---------- map slots ---------- */
const slotsEl = document.getElementById('slots');
const slotsEmpty = document.getElementById('slotsEmpty');
function refreshSlots() {
  slotsEl.innerHTML = '';
  slotsEmpty.style.display = S.maps.length ? 'none' : '';
  S.maps.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (i === S.active ? ' active' : '');
    b.style.backgroundImage = `url(${m.thumb})`;
    b.title = `${m.name} — press ${i + 1}, double-click to rename`;
    b.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span>` +
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
  closed: ['Player screen closed', 'Open it on the second display'],
  fit: ['Whole map', 'Players see everything you have revealed'],
  mirror: ['Mirroring · live', 'Players follow your camera'],
  hold: ['Held', 'Players are parked — look around freely'],
};
const NOTE_COPY = {
  fit: 'Players see the whole map, whatever you do.',
  mirror: 'Players follow your camera. Press M to park them here and go scouting.',
  hold: 'Players are parked on the framed area. Press V to put your view back on it, then M to mirror again.',
};

function setPlayerMode(mode) {
  if (mode === 'hold') S.holdCam = playerCamAsGM();   // park on what they can see right now
  S.playerMode = mode;
  S.mirror = mode === 'mirror';
  for (const b of modeSeg.children) b.classList.toggle('active', b.dataset.mode === mode);
  updateTally();
  requestRender(true, true);
}
for (const b of modeSeg.children) b.onclick = () => setPlayerMode(b.dataset.mode);

function updateTally() {
  const open = playerWin && !playerWin.closed;
  const key = open ? S.playerMode : 'closed';
  tally.dataset.mode = key;
  tallyState.textContent = MODE_COPY[key][0];
  tallyHint.textContent = MODE_COPY[key][1];
  btnPlayer.textContent = open ? 'Focus' : 'Open';
  playerNote.textContent = NOTE_COPY[S.playerMode];
}

function matchPlayerView() {
  if (!S.img) return;
  S.cam = playerCamAsGM();
  requestRender(true, S.mirror);
}
document.getElementById('btnMatchPlayer').onclick = matchPlayerView;

btnPlayer.onclick = () => {
  if (playerWin && !playerWin.closed) { playerWin.focus(); return; }
  playerWin = window.open('', 'battlemapPlayer', 'width=1280,height=720');
  if (!playerWin) {
    setSaveStatus('Popup blocked — allow popups for this page, then try again', 'warn');
    return;
  }
  const d = playerWin.document;
  d.title = 'Battlemap — Player View';
  d.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  d.body.innerHTML = '';
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
  sizeP();
  updateTally();
};

/* ---------- canvas sizing (startup) ---------- */
function sizeGM() {
  gmCanvas.width = stage.clientWidth * DPR;
  gmCanvas.height = stage.clientHeight * DPR;
  requestRender(true, false);
}
new ResizeObserver(sizeGM).observe(stage);
sizeGM();
syncControls();
updateTally();
restoreAutosave();

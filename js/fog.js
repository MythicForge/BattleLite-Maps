'use strict';
/* Fog of war: an offscreen alpha mask at (capped) map resolution.
   Opaque black = hidden. Hide paints black, reveal erases with
   destination-out; both use a soft radial-gradient brush. */

function buildFog() {
  fogScale = Math.min(1, FOG_MAX / Math.max(S.img.width, S.img.height));
  fogC = document.createElement('canvas');
  fogC.width = Math.max(1, Math.round(S.img.width * fogScale));
  fogC.height = Math.max(1, Math.round(S.img.height * fogScale));
  fogCtx = fogC.getContext('2d');
  hideAll();
}

/* The mask changed, so the slot's cached PNG for saving is stale. */
function fogChanged() {
  const m = S.maps[S.active];
  if (m) m.fogDirty = true;
}

/* ---------- undo ----------
   Each edit (one brush stroke, or Hide/Reveal all) is one step. A stroke's
   extent is not known until it ends, so the whole mask is copied when it
   starts — a GPU blit — and only the patch the stroke touched is kept as
   pixels when it ends. Steps live on the slot, in memory only: undo history
   is for this sitting, not something a session file carries. */
const FOG_UNDO_STEPS = 30;
const FOG_UNDO_BYTES = 96e6;                   // per map; oldest steps go first
let fogEdit = null;                            // {snap, x0, y0, x1, y1} while a stroke is open

function fogHistory() {
  const m = S.maps[S.active];
  if (!m) return null;
  if (!m.fogUndo) { m.fogUndo = []; m.fogRedo = []; }
  return m;
}

function beginFogEdit() {
  if (!fogC) return;
  const snap = document.createElement('canvas');
  snap.width = fogC.width; snap.height = fogC.height;
  snap.getContext('2d').drawImage(fogC, 0, 0);
  fogEdit = {snap, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
}
function touchFog(x0, y0, x1, y1) {            // fog-canvas px
  if (!fogEdit) return;
  fogEdit.x0 = Math.min(fogEdit.x0, x0); fogEdit.y0 = Math.min(fogEdit.y0, y0);
  fogEdit.x1 = Math.max(fogEdit.x1, x1); fogEdit.y1 = Math.max(fogEdit.y1, y1);
}
/* The patch [x,y,w,h] of `canvas`, as pixels to put back later. */
function grabPatch(canvas, x, y, w, h) {
  return {x, y, data: canvas.getContext('2d').getImageData(x, y, w, h)};
}
function endFogEdit() {
  const e = fogEdit, m = fogHistory();
  fogEdit = null;
  if (!e || !m || e.x1 < e.x0) return;
  const x = Math.max(0, Math.floor(e.x0)), y = Math.max(0, Math.floor(e.y0));
  const w = Math.min(fogC.width, Math.ceil(e.x1)) - x, h = Math.min(fogC.height, Math.ceil(e.y1)) - y;
  if (w <= 0 || h <= 0) return;
  m.fogUndo.push(grabPatch(e.snap, x, y, w, h));
  m.fogRedo = [];                              // a new edit forks history
  let bytes = m.fogUndo.reduce((n, p) => n + p.data.data.length, 0);
  while (m.fogUndo.length > 1 && (m.fogUndo.length > FOG_UNDO_STEPS || bytes > FOG_UNDO_BYTES)) {
    bytes -= m.fogUndo.shift().data.data.length;
  }
  if (typeof refreshFogUndo === 'function') refreshFogUndo();
}

/* Swap a stored patch with what is on the mask now; the "now" goes on the
   other stack, so undo and redo are the same move in opposite directions. */
function stepFog(from, to) {
  const p = from.pop();
  if (!p) return false;
  to.push(grabPatch(fogC, p.x, p.y, p.data.width, p.data.height));
  fogCtx.putImageData(p.data, p.x, p.y);
  fogChanged();
  requestRender();
  if (typeof refreshFogUndo === 'function') refreshFogUndo();
  return true;
}
function undoFog() { const m = fogHistory(); return !!m && !fogEdit && stepFog(m.fogUndo, m.fogRedo); }
function redoFog() { const m = fogHistory(); return !!m && !fogEdit && stepFog(m.fogRedo, m.fogUndo); }

function hideAll() {
  beginFogEdit();
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.fillStyle = '#000';
  fogCtx.fillRect(0, 0, fogC.width, fogC.height);
  touchFog(0, 0, fogC.width, fogC.height);
  endFogEdit();
  fogChanged();
  requestRender();
}

function revealAll() {
  beginFogEdit();
  fogCtx.clearRect(0, 0, fogC.width, fogC.height);
  touchFog(0, 0, fogC.width, fogC.height);
  endFogEdit();
  fogChanged();
  requestRender();
}

function stampFog(mx, my, mode) {              // mx,my in map space
  const r = (S.brushSize / 2) * fogScale;
  const x = mx * fogScale, y = my * fogScale;
  const grad = fogCtx.createRadialGradient(x, y, r * 0.55, x, y, r);
  if (mode === 'hide') {
    fogCtx.globalCompositeOperation = 'source-over';
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    fogCtx.globalCompositeOperation = 'destination-out';
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
  }
  fogCtx.fillStyle = grad;
  fogCtx.beginPath();
  fogCtx.arc(x, y, r, 0, Math.PI * 2);
  fogCtx.fill();
  fogCtx.globalCompositeOperation = 'source-over';
  touchFog(x - r, y - r, x + r, y + r);
}

function strokeFog(fromMap, toMap, mode) {     // interpolate stamps for smooth stroke
  const d = Math.hypot(toMap.x - fromMap.x, toMap.y - fromMap.y);
  const step = Math.max(1, S.brushSize / 6);
  const n = Math.ceil(d / step);
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    stampFog(fromMap.x + (toMap.x - fromMap.x) * t, fromMap.y + (toMap.y - fromMap.y) * t, mode);
  }
  fogChanged();
  requestRender();
}

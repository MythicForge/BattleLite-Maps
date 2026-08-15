'use strict';
/* Map slots and session persistence.

   A slot owns everything about one map: the image, its fog canvas, effects,
   markers, camera, rotation and grid settings. The live map is whichever slot
   is open — its fields sit directly on S, and commitActive()/applySlot() copy
   them in and out. Slots 1–9 are switched with the number keys.

   Saving: a session is one JSON file holding every slot (images and fog masks
   as data URLs). The same JSON is autosaved to localStorage after each change,
   so reopening the page picks up where the table left off. */

/* Everything a session carries is a data URL, so the encoder choice is the
   whole file-size story. WebP is roughly a quarter of the equivalent PNG and
   keeps alpha, which the fog mask needs. Probed once against a 1px canvas;
   browsers that cannot encode it fall back to what they could always do. */
let webpOK = null;
function canEncodeWebP() {
  if (webpOK === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOK = String(c.toDataURL('image/webp')).startsWith('data:image/webp');
  }
  return webpOK;
}

function makeThumb(img) {
  const c = document.createElement('canvas');
  c.width = 176; c.height = 110;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0d11';
  x.fillRect(0, 0, c.width, c.height);
  const s = Math.max(c.width / img.width, c.height / img.height);
  const w = img.width * s, h = img.height * s;
  x.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
  return c.toDataURL(canEncodeWebP() ? 'image/webp' : 'image/jpeg', 0.6);
}

function blankSlot(img, src, name) {
  const scale = Math.min(1, FOG_MAX / Math.max(img.width, img.height));
  const fog = document.createElement('canvas');
  fog.width = Math.max(1, Math.round(img.width * scale));
  fog.height = Math.max(1, Math.round(img.height * scale));
  const fctx = fog.getContext('2d');
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, fog.width, fog.height);      // a new map starts fully hidden
  return {
    name, src, img, thumb: makeThumb(img),
    rotation: 0,
    cam: null,                                     // filled on first open
    gridType: S.gridType, gridSize: S.gridSize, gridShade: S.gridShade, gridOp: S.gridOp,
    effects: [],
    fog, fogScale: scale,
    fogURL: null, fogDirty: true,      // cached PNG for saving; see fogDataURL
  };
}

/* Encoding a 2560px fog mask is the expensive part of a save, so each slot
   keeps its last encode until fog.js marks the mask dirty. The mask is flat
   black under an alpha channel, and WebP stores alpha losslessly even in its
   lossy mode, so the edges survive the smaller file. */
function fogDataURL(m) {
  if (m.fogDirty || !m.fogURL) {
    m.fogURL = m.fog.toDataURL(canEncodeWebP() ? 'image/webp' : 'image/png');
    m.fogDirty = false;
  }
  return m.fogURL;
}

/* ---------- live map <-> slot ---------- */
function commitActive() {
  const m = S.maps[S.active];
  if (!m) return;
  m.img = S.img;
  m.rotation = S.rotation;
  m.cam = {...S.cam};
  m.gridType = S.gridType; m.gridSize = S.gridSize;
  m.gridShade = S.gridShade; m.gridOp = S.gridOp;
  m.effects = S.effects;
  m.fog = fogC; m.fogScale = fogScale;
}

function applySlot(i) {
  const m = S.maps[i];
  S.active = i;
  S.img = m.img;
  S.rotation = m.rotation;
  S.gridType = m.gridType; S.gridSize = m.gridSize;
  S.gridShade = m.gridShade; S.gridOp = m.gridOp;
  S.effects = m.effects;
  S.selected = -1;
  fogC = m.fog; fogCtx = fogC.getContext('2d'); fogScale = m.fogScale;
  S.cam = m.cam ? {...m.cam} : fitCam(gmCanvas);
  dropHint.style.display = 'none';
  syncControls();
  refreshSlots();
  requestRender();
}

/* Switch to slot i (0-based). Keeps the open map's work by committing first. */
function showSlot(i) {
  if (i < 0 || i >= S.maps.length || i === S.active) return;
  commitActive();
  applySlot(i);
  scheduleSave();
}

function addMap(img, src, name) {
  if (S.maps.length >= MAX_SLOTS) {
    setSaveStatus(`Nine map slots is the limit — remove one to add another`, 'warn');
    return;
  }
  commitActive();
  S.maps.push(blankSlot(img, src, name));
  applySlot(S.maps.length - 1);
  scheduleSave();
}

function removeMap(i) {
  if (i < 0 || i >= S.maps.length) return;
  S.maps.splice(i, 1);
  if (S.holdSlot === i) setPlayerMode('fit');        // the table was parked on it
  else if (S.holdSlot > i) S.holdSlot--;
  if (S.maps.length === 0) {
    S.active = -1; S.img = null; S.effects = []; S.selected = -1;
    fogC = null; fogCtx = null;
    dropHint.style.display = '';
    refreshSlots();
    requestRender();
  } else {
    S.active = -1;                                  // force applySlot to reload
    applySlot(Math.min(i, S.maps.length - 1));
  }
  scheduleSave();
}

function renameMap(i, name) {
  if (S.maps[i]) { S.maps[i].name = name; scheduleSave(); }
}

/* ---------- session file ---------- */
function buildSession() {
  commitActive();
  return {
    v: 1,
    active: S.active,
    playerMode: S.playerMode,
    fxColor: S.fxColor, mkColor: S.mkColor, mkIcon: S.mkIcon, brushSize: S.brushSize,
    maps: S.maps.map(m => ({
      name: m.name, src: m.src,
      rotation: m.rotation, cam: m.cam,
      gridType: m.gridType, gridSize: m.gridSize, gridShade: m.gridShade, gridOp: m.gridOp,
      effects: m.effects,
      fog: fogDataURL(m), fogScale: m.fogScale,
    })),
  };
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image failed to load'));
    im.src = src;
  });
}

async function restoreSession(data) {
  if (!data || !Array.isArray(data.maps)) throw new Error('not a battlemap session');
  const maps = [];
  for (const d of data.maps) {
    const img = await loadImg(d.src);
    const slot = blankSlot(img, d.src, d.name || 'Map');
    slot.rotation = d.rotation || 0;
    slot.cam = d.cam || null;
    slot.gridType = d.gridType || 'square';
    slot.gridSize = d.gridSize || 70;
    slot.gridShade = d.gridShade ?? 0;
    slot.gridOp = d.gridOp ?? 0.6;
    slot.effects = d.effects || [];
    if (d.fog) {
      const f = await loadImg(d.fog);
      const fx = slot.fog.getContext('2d');
      fx.clearRect(0, 0, slot.fog.width, slot.fog.height);
      fx.drawImage(f, 0, 0, slot.fog.width, slot.fog.height);
      slot.fogURL = d.fog; slot.fogDirty = false;
    }
    maps.push(slot);
  }
  S.maps = maps;
  S.active = -1;
  if (data.fxColor) S.fxColor = data.fxColor;
  if (data.mkColor) S.mkColor = data.mkColor;
  if (data.mkIcon) S.mkIcon = data.mkIcon;
  if (data.brushSize) S.brushSize = data.brushSize;
  setPlayerMode(data.playerMode === 'mirror' ? 'fit' : (data.playerMode || 'fit'));
  if (maps.length) applySlot(Math.min(Math.max(data.active | 0, 0), maps.length - 1));
  else { S.img = null; dropHint.style.display = ''; refreshSlots(); requestRender(); }
}

function saveSessionFile() {
  if (!S.maps.length) { setSaveStatus('Load a map before saving a session', 'warn'); return; }
  const blob = new Blob([JSON.stringify(buildSession())], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'battlemap-session.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  setSaveStatus('Session file saved', 'ok');
}

function openSessionFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      await restoreSession(JSON.parse(r.result));
      setSaveStatus(`Session opened — ${S.maps.length} map${S.maps.length === 1 ? '' : 's'}`, 'ok');
      scheduleSave();
    } catch (err) {
      setSaveStatus(`That file will not open: ${err.message}`, 'warn');
    }
  };
  r.readAsText(file);
}

/* ---------- autosave ----------

   Served over http (npx serve .), so IndexedDB is available in every browser
   and there is no size limit to work around: nine 4000px maps and their fog
   masks are tens of megabytes and that is fine. Opened as a file:// URL
   instead, Chrome blocks IndexedDB outright — then there is no autosave and
   the status line says so rather than pretending.

   localStorage is read once, to carry over a session saved by the older
   build, and then dropped. */
const SAVE_KEY = 'battlemap.session.v1';
const DB_NAME = 'battlemap', DB_STORE = 'session', DB_KEY = 'current';
let saveTimer = null;
let dbPromise = null;

const hasIDB = () => typeof indexedDB !== 'undefined' && indexedDB !== null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('IndexedDB is not available here'));
    });
  }
  return dbPromise;
}
function idbWrite(json) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(DB_STORE, 'readwrite');
    if (json === null) t.objectStore(DB_STORE).delete(DB_KEY);
    else t.objectStore(DB_STORE).put(json, DB_KEY);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('write aborted'));
  }));
}
function idbRead() {
  return db().then(d => new Promise((res, rej) => {
    const q = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_KEY);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  }));
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeSave, 1200);
}

function clock() {
  const t = new Date();
  return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
}
const jsonSize = json => (json.length / 1e6).toFixed(1) + ' MB';
const NO_STORE = 'No autosave here — serve the folder (npx serve .) or use Save session';

/* Ask the browser not to evict this origin under disk pressure. Secure
   contexts only, which localhost is; ignored everywhere else. */
function keepStorage() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

function writeSave() {
  if (!hasIDB()) { setSaveStatus(NO_STORE, 'warn'); return; }
  if (!S.maps.length) { idbWrite(null).catch(() => {}); return; }
  let json;
  try {
    json = JSON.stringify(buildSession());
  } catch (e) {
    setSaveStatus('Could not autosave this session', 'warn');
    return;
  }
  idbWrite(json)
    .then(() => setSaveStatus(`Autosaved ${clock()} · ${jsonSize(json)}`, 'ok'))
    .catch(err => setSaveStatus(`Autosave failed: ${err && err.name === 'QuotaExceededError'
      ? 'the browser is out of room for this site' : 'use Save session to keep this'}`, 'warn'));
}

/* Reads IndexedDB, then the old localStorage session once — a session saved
   by the previous build is carried over and the localStorage copy dropped. */
function restoreAutosave() {
  if (!hasIDB()) { setSaveStatus(NO_STORE, 'warn'); return Promise.resolve(); }
  keepStorage();
  let migrated = false;
  return idbRead().catch(() => null).then(json => {
    if (!json) {
      try { json = localStorage.getItem(SAVE_KEY); } catch (e) {}
      migrated = !!json;
    }
    if (!json) { setSaveStatus('No saved session yet', ''); return; }
    return restoreSession(JSON.parse(json)).then(() => {
      setSaveStatus(`Restored ${S.maps.length} map${S.maps.length === 1 ? '' : 's'} from autosave`, 'ok');
      if (S.maps.length) setDrawer(false);      // there is a map to look at
      if (migrated) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        scheduleSave();                          // and it lives in IndexedDB from now on
      }
    });
  }).catch(() => setSaveStatus('Saved session could not be read', 'warn'));
}

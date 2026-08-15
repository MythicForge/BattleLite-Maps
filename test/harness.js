// Minimal DOM/canvas stub so the battlemap scripts can be exercised in node.
// Not a browser — enough to catch load errors and drive the slot / camera /
// session logic. Real rendering is verified by opening index.html.
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js') + '/';

/* ---------- geometry (needs real math) ---------- */
class DOMPoint { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
class DOMMatrix {
  constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
  _mul(o) {
    const a = this.a * o.a + this.c * o.b, b = this.b * o.a + this.d * o.b;
    const c = this.a * o.c + this.c * o.d, d = this.b * o.c + this.d * o.d;
    const e = this.a * o.e + this.c * o.f + this.e, f = this.b * o.e + this.d * o.f + this.f;
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
    return this;
  }
  translateSelf(x, y) { return this._mul({a: 1, b: 0, c: 0, d: 1, e: x, f: y}); }
  scaleSelf(sx, sy = sx) { return this._mul({a: sx, b: 0, c: 0, d: sy, e: 0, f: 0}); }
  rotateSelf(deg) {
    const r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    return this._mul({a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0});
  }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    const m = new DOMMatrix();
    m.a = this.d / det; m.b = -this.b / det; m.c = -this.c / det; m.d = this.a / det;
    m.e = (this.c * this.f - this.d * this.e) / det;
    m.f = (this.b * this.e - this.a * this.f) / det;
    return m;
  }
  transformPoint(p) { return new DOMPoint(this.a * p.x + this.c * p.y + this.e, this.b * p.x + this.d * p.y + this.f); }
}

/* ---------- canvas ---------- */
const ctxStub = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return () => ({width: 40});
    if (k === 'createRadialGradient') return () => ({addColorStop() {}});
    if (k in t) return t[k];
    return () => {};
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
function makeCanvas() {
  return {
    width: 300, height: 150, style: {},
    getContext: () => ctxStub(),
    toDataURL: () => 'data:image/png;base64,AAAA',
    addEventListener() {}, appendChild() {},
  };
}

/* ---------- elements ---------- */
let elCount = 0;
function El(id = '') {
  const cls = new Set();
  const el = {
    id, tagName: 'DIV', style: {}, dataset: {}, children: [], value: '', textContent: '',
    clientWidth: 1600, clientHeight: 1000,
    _n: ++elCount,
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c),
      toggle: (c, on) => { on === undefined ? (cls.has(c) ? cls.delete(c) : cls.add(c)) : (on ? cls.add(c) : cls.delete(c)); },
      _set: cls,
    },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
    get className() { return [...cls].join(' '); },
    set innerHTML(v) { el._html = v; if (v === '') el.children.length = 0; },
    get innerHTML() { return el._html || ''; },
    appendChild(c) { el.children.push(c); return c; },
    querySelector: () => new El(),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, click() {}, focus() {},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 800, height: 600}),
    setPointerCapture() {},
  };
  return el;
}
const registry = {};
function reg(id, extra) { const e = El(id); Object.assign(e, extra || {}); registry[id] = e; return e; }
function segChildren(key, vals) {
  return vals.map(v => { const b = El(); b.dataset[key] = v; return b; });
}
reg('gmCanvas', makeCanvas());
registry.gmCanvas.width = 1600; registry.gmCanvas.height = 1000;
reg('gridType').children = segChildren('type', ['off', 'square', 'hex']);
reg('playerMode').children = segChildren('mode', ['fit', 'mirror', 'hold']);
reg('iconGrid');
reg('slots');

const document = {
  getElementById: id => registry[id] || (registry[id] = El(id)),
  createElement: t => (t === 'canvas' ? makeCanvas() : El()),
  querySelectorAll: () => registry.iconGrid.children,
  addEventListener() {},
  body: El(),
};

class Path2D {
  constructor(d) { this.d = d; this.parts = d ? [d] : []; }
  addPath(p) { this.parts.push(...(p.parts || [])); }
  arc() { this.parts.push('arc'); }
  ellipse() { this.parts.push('ellipse'); }
  rect() { this.parts.push('rect'); }
  roundRect() { this.parts.push('roundRect'); }
  moveTo() { this.parts.push('moveTo'); }
  lineTo() { this.parts.push('lineTo'); }
  closePath() { this.parts.push('closePath'); }
}
class Image {
  constructor() { this.width = 1000; this.height = 800; }
  set src(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0); }
  get src() { return this._src; }
}
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};


/* ---------- a fake IndexedDB ----------
   Enough of the API for maps.js: open -> upgrade -> transaction -> put/get/
   delete, all async like the real thing. Off by default so the localStorage
   fallback gets exercised too; run.js turns it on with useFakeIDB(). */
function fakeIndexedDB() {
  const stores = {};
  return {
    stores,
    open() {
      const req = {};
      setTimeout(() => {
        req.result = {
          createObjectStore(n) { stores[n] = {}; return {}; },
          transaction(n) {
            const tx = {
              oncomplete: null, onerror: null, onabort: null,
              objectStore: () => ({
                put(v, k) { (stores[n] = stores[n] || {})[k] = v; return {}; },
                get(k) {
                  const q = {};
                  setTimeout(() => { q.result = (stores[n] || {})[k]; if (q.onsuccess) q.onsuccess(); }, 0);
                  return q;
                },
                delete(k) { if (stores[n]) delete stores[n][k]; return {}; },
              }),
            };
            setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
          },
        };
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    },
  };
}
function useFakeIDB() {
  const fake = fakeIndexedDB();
  sandbox.indexedDB = fake;
  return fake;
}

const sandbox = {
  document, DOMMatrix, DOMPoint, Path2D, Image, localStorage, console,
  indexedDB: null,                    // maps.js falls back to localStorage until useFakeIDB()
  lucide: require('lucide'),          // the same package the browser loads
  requestAnimationFrame: cb => setTimeout(cb, 0),
  ResizeObserver: class { observe() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Blob: class {}, URL: {createObjectURL: () => 'blob:x', revokeObjectURL() {}},
  FileReader: class { readAsDataURL() {} readAsText() {} },
  alert: m => console.log('[alert]', m),
  confirm: () => true,
  prompt: () => 'renamed',
  devicePixelRatio: 1,
};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.open = () => null;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['state', 'icons', 'effects', 'fog', 'render', 'maps', 'map', 'input', 'ui'];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path + f + '.js', 'utf8'), sandbox, {filename: f + '.js'});
}
// top-level const/let in classic scripts live in script scope, not on window,
// so hand them out through an explicit accessor object
vm.runInContext(`this.api = {
  get S(){return S}, get MARKER_ICONS(){return MARKER_ICONS},
  get fogC(){return fogC},
  get pCanvas(){return pCanvas}, set pCanvas(v){pCanvas=v},
  get playerWin(){return playerWin}, set playerWin(v){playerWin=v},
  get pCtx(){return pCtx}, set pCtx(v){pCtx=v},
  Image, localStorage,
  iconPath, iconSVG, iconNode, addMap, showSlot, removeMap, renameMap, hitEffect, markerSize,
  setPlayerMode, matchPlayerView, playerCam, playerCamAsGM, fitCam,
  playerSrc, liveSrc, heldSlot, liveSlotIndex,
  buildSession, restoreSession, writeSave, restoreAutosave, setTool, jsonSize,
  saveStatusText: () => saveState.textContent,
  showPanel, togglePanel, escapeConsole, setDrawer, paintDock, canEncodeWebP, toWebP,
  get openPanel(){return openPanel},
  get flyouts(){return flyouts},
};`, sandbox);

module.exports = {sandbox, api: sandbox.api, ctxStub, makeCanvas, useFakeIDB};

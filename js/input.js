'use strict';
/* Pointer, wheel and keyboard input on the GM canvas.
   Tools: select (pan + pick effects), fog brushes, effect drag-out.
   Middle/right button or held Space always pans. */

/* One letter per dock key. M and V are already spoken for by the player
   camera, so the panel letters start at F. */
const PANEL_KEYS = {s: 'scenes', f: 'fog', k: 'marker', e: 'effects', g: 'grid', r: 'view'};

function canvasPos(e) {
  const r = gmCanvas.getBoundingClientRect();
  return {x: (e.clientX - r.left) * DPR, y: (e.clientY - r.top) * DPR};
}

gmCanvas.addEventListener('contextmenu', e => e.preventDefault());

gmCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (!S.img) return;
  const p = canvasPos(e);
  const before = screenToCam(p.x, p.y, S.cam, gmCanvas);
  const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  S.cam.scale = Math.min(20, Math.max(0.02, S.cam.scale * f));
  S.cam.x = before.x - (p.x - gmCanvas.width / 2) / S.cam.scale;
  S.cam.y = before.y - (p.y - gmCanvas.height / 2) / S.cam.scale;
  requestRender(true, S.follow);
}, {passive: false});

gmCanvas.addEventListener('pointerdown', e => {
  e.preventDefault();                            // stops middle-click autoscroll
  if (!S.img) return;
  gmCanvas.setPointerCapture(e.pointerId);
  const p = canvasPos(e);
  const mapP = screenToMap(p.x, p.y, S.cam, gmCanvas);
  const panOverride = e.button === 1 || e.button === 2 || spaceHeld;

  if (panOverride || S.tool === 'select') {
    if (!panOverride && S.tool === 'select') {
      // the players' frame sits on top of everything: reframing beats picking
      const grip = frameHit(p.x, p.y);
      if (grip) {
        drag = {kind: 'frame', mode: grip.mode, last: screenToCam(p.x, p.y, S.cam, gmCanvas)};
        gmCanvas.style.cursor = grip.mode === 'move' ? 'grabbing' : 'nwse-resize';
        return;
      }
      const hit = hitEffect(mapP);
      if (hit >= 0) {
        S.selected = hit;
        drag = {kind: 'move', idx: hit, last: mapP};
        requestRender(true, false);
        return;
      }
      if (S.selected !== -1) { S.selected = -1; requestRender(true, false); }
    }
    drag = {kind: 'pan', last: p};
    gmCanvas.style.cursor = 'grabbing';
    return;
  }
  if (S.tool === 'hide' || S.tool === 'reveal') {
    drag = {kind: 'fog', last: mapP, mode: S.tool};
    strokeFog(mapP, mapP, S.tool);
    return;
  }
  if (S.tool === 'marker') {
    // click drops one at cell size; dragging out from it scales it
    S.effects.push({
      type: 'marker', x1: mapP.x, y1: mapP.y, x2: mapP.x, y2: mapP.y,
      icon: S.mkIcon, size: markerSize(), color: S.mkColor,
    });
    S.selected = S.effects.length - 1;
    drag = {kind: 'effect'};
    requestRender();
    return;
  }
  // effect tools: drag out from anchor
  S.effects.push({type: S.tool, x1: mapP.x, y1: mapP.y, x2: mapP.x, y2: mapP.y, color: S.fxColor});
  S.selected = S.effects.length - 1;
  drag = {kind: 'effect'};
  requestRender();
});

gmCanvas.addEventListener('pointermove', e => {
  const p = canvasPos(e);
  mouse.x = p.x; mouse.y = p.y; mouse.over = true;
  if (!S.img) return;

  if (!drag) {
    if (S.tool === 'select') {
      const grip = frameHit(p.x, p.y);
      gmCanvas.style.cursor = !grip ? 'grab' : (grip.mode === 'move' ? 'move' : 'nwse-resize');
    }
    if (S.tool === 'hide' || S.tool === 'reveal' || S.tool === 'marker') requestRender(true, false);
    return;
  }
  const mapP = screenToMap(p.x, p.y, S.cam, gmCanvas);
  switch (drag.kind) {
    case 'pan':
      S.cam.x -= (p.x - drag.last.x) / S.cam.scale;
      S.cam.y -= (p.y - drag.last.y) / S.cam.scale;
      drag.last = p;
      requestRender(true, S.follow);
      break;
    case 'frame': {
      const camP = screenToCam(p.x, p.y, S.cam, gmCanvas);
      if (drag.mode === 'move') moveFrame(camP.x - drag.last.x, camP.y - drag.last.y);
      else resizeFrame(camP);
      drag.last = camP;
      requestRender(true, true);          // the table sees this as you do it
      break;
    }
    case 'fog':
      strokeFog(drag.last, mapP, drag.mode);
      drag.last = mapP;
      break;
    case 'effect': {
      const fx = S.effects[S.effects.length - 1];
      fx.x2 = mapP.x; fx.y2 = mapP.y;
      if (fx.type === 'marker') {
        const d = Math.hypot(fx.x2 - fx.x1, fx.y2 - fx.y1);
        fx.size = d > 6 ? Math.max(S.gridSize * 0.3, d * 2) : markerSize();
      }
      requestRender();
      break;
    }
    case 'move': {
      const fx = S.effects[drag.idx];
      const dx = mapP.x - drag.last.x, dy = mapP.y - drag.last.y;
      fx.x1 += dx; fx.y1 += dy; fx.x2 += dx; fx.y2 += dy;
      drag.last = mapP;
      requestRender();
      break;
    }
  }
});

gmCanvas.addEventListener('pointerup', e => {
  if (drag && drag.kind === 'effect') {
    const fx = S.effects[S.effects.length - 1];
    // a click with no drag is a stray for shapes, but is how markers are placed
    if (fx.type !== 'marker' && Math.hypot(fx.x2 - fx.x1, fx.y2 - fx.y1) < 4) {
      S.effects.pop();
      S.selected = -1;
    }
    requestRender();
  }
  if (drag) scheduleSave();
  drag = null;
  gmCanvas.style.cursor = 'grab';
});
gmCanvas.addEventListener('pointerleave', () => { mouse.over = false; requestRender(true, false); });

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { spaceHeld = true; e.preventDefault(); }
  if (e.key >= '1' && e.key <= '9') { showSlot(+e.key - 1); return; }
  if (e.key === 'm' || e.key === 'M') { setFollow(!S.follow); return; }
  if (e.key === 'p' || e.key === 'P') { sendPlayersTo(S.active, S.cam); return; }
  if (e.key === 'v' || e.key === 'V') { matchPlayerView(); return; }
  const panelKey = PANEL_KEYS[e.key.toLowerCase()];
  if (panelKey) {                                  // one letter per dock key
    if (panelKey === 'scenes') setDrawer(!document.body.classList.contains('drawer'));
    else togglePanel(panelKey);
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected >= 0) {
    S.effects.splice(S.selected, 1);
    S.selected = -1;
    requestRender();
    scheduleSave();
  }
  if (e.key === 'Escape') {
    if (drag && drag.kind === 'effect') { S.effects.pop(); drag = null; requestRender(); return; }
    if (escapeConsole()) return;                   // close the panel or drawer first
    S.selected = -1;
    setTool('select');
    requestRender();
  }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });

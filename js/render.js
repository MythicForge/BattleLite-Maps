'use strict';
/* Rendering: view transforms, cameras, the dirty-flag render loop, and
   all scene drawing for both GM and player canvases. */

/* ---------- dirty-flag render loop: zero work when idle ---------- */
let dirtyGM = false, dirtyP = false, rafPending = false;
function requestRender(gm = true, player = true) {
  dirtyGM = dirtyGM || gm;
  dirtyP = dirtyP || player;
  if (!rafPending) { rafPending = true; requestAnimationFrame(frame); }
}
function frame() {
  rafPending = false;
  if (dirtyGM) renderView(gmCtx, gmCanvas, false, S.cam, liveSrc());
  if (dirtyP && playerWin && !playerWin.closed) renderView(pCtx, pCanvas, true, playerCam(), playerSrc());
  dirtyGM = dirtyP = false;
}

/* ---------- what a canvas is drawing ----------
   The GM always draws the open map. The player screen draws the *held* map
   instead: hold parks the table on a scene as well as a camera, so the GM can
   switch slots to prep the next fight without the table seeing it. */
function liveSrc() {
  return {
    img: S.img, rotation: S.rotation, effects: S.effects, fog: fogC,
    gridType: S.gridType, gridSize: S.gridSize, gridShade: S.gridShade, gridOp: S.gridOp,
  };
}
/* The scene the table is parked on, when it is not the one the GM has open.
   Following drags them along; parked leaves them where they are. */
function parkedSlot() {
  return (!S.follow && S.playerSlot >= 0 && S.playerSlot !== S.active)
    ? S.maps[S.playerSlot] || null : null;
}
function playerSrc() {
  const m = parkedSlot();
  if (!m) return liveSrc();
  return {
    img: m.img, rotation: m.rotation, effects: m.effects, fog: m.fog,
    gridType: m.gridType, gridSize: m.gridSize, gridShade: m.gridShade, gridOp: m.gridOp,
  };
}

/* ---------- transforms ---------- */
// screen <- rotated space (the space cameras live in)
function camMatrix(cam, w, h) {
  const m = new DOMMatrix();
  m.translateSelf(w / 2, h / 2);
  m.scaleSelf(cam.scale, cam.scale);
  m.translateSelf(-cam.x, -cam.y);
  return m;
}
// screen <- map space
function viewMatrix(cam, w, h, src = liveSrc()) {
  const m = camMatrix(cam, w, h);
  if (src.img && src.rotation) {
    const cx = src.img.width / 2, cy = src.img.height / 2;
    m.translateSelf(cx, cy);
    m.rotateSelf(src.rotation);
    m.translateSelf(-cx, -cy);
  }
  return m;
}
function screenToMap(sx, sy, cam, canvas, src = liveSrc()) {
  const p = viewMatrix(cam, canvas.width, canvas.height, src).inverse()
    .transformPoint(new DOMPoint(sx, sy));
  return {x: p.x, y: p.y};
}
// rotated-space point under screen coords (camera space, ignoring image rotation)
function screenToCam(sx, sy, cam, canvas) {
  return {
    x: (sx - canvas.width / 2) / cam.scale + cam.x,
    y: (sy - canvas.height / 2) / cam.scale + cam.y,
  };
}
function rotatedBBox(src = liveSrc()) {
  const r = Math.abs(src.rotation * Math.PI / 180);
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return {w: src.img.width * c + src.img.height * s, h: src.img.width * s + src.img.height * c};
}
function fitCam(canvas, src = liveSrc()) {
  const bb = rotatedBBox(src);
  return {
    x: src.img.width / 2, y: src.img.height / 2,
    scale: Math.min(canvas.width / bb.w, canvas.height / bb.h) * 0.97,
  };
}

/* ---------- player camera ----------
   One camera, S.pcam, kept in GM-canvas terms so the GM canvas can draw it as
   a frame and the two views convert cleanly. Following overrides it live;
   everything else is the GM moving that frame by hand. */
function playerCam() {
  const src = playerSrc();
  if (!src.img || !pCanvas) return {x: 0, y: 0, scale: 1};
  const k = pCanvas.height / gmCanvas.height;
  if (S.follow) return {x: S.cam.x, y: S.cam.y, scale: S.cam.scale * k};
  const c = S.pcam || fitCam(gmCanvas, src);
  return {x: c.x, y: c.y, scale: c.scale * k};
}
/* The player's current framing expressed as a GM camera, so the GM can jump
   back to exactly what the table is looking at. */
function playerCamAsGM() {
  if (!S.img) return {...S.cam};
  if (S.follow) return {...S.cam};
  if (S.pcam) return {...S.pcam};
  return fitCam(gmCanvas, playerSrc());
}

/* ---------- the hold frame, as something you can grab ----------
   In hold the frame is the table's viewport, drawn in camera space, so it is
   axis-aligned on screen however the map is rotated. Dragging it moves what
   the players see without touching the GM camera — which is the point: you
   frame the fight for them, then go and look at the corridor.

   Only while the GM is on the held scene; if hold is parked on another slot
   there is nothing here to drag. */
function editableFrame() {
  return !S.follow && S.pcam && playerWin && !playerWin.closed && pCanvas && !parkedSlot();
}
function playerFrame() {
  if (!editableFrame()) return null;
  const pc = playerCam();
  return {x: pc.x, y: pc.y, hw: pCanvas.width / pc.scale / 2, hh: pCanvas.height / pc.scale / 2};
}
/* What is under the pointer: a corner resizes, an edge moves. Only the border
   grabs — the frame usually covers most of the canvas, and dragging inside it
   still has to pan the GM's own view. */
function frameHit(sx, sy) {
  const f = playerFrame();
  if (!f) return null;
  const p = screenToCam(sx, sy, S.cam, gmCanvas);
  const tol = 11 * DPR / S.cam.scale;
  const dx = Math.abs(p.x - f.x), dy = Math.abs(p.y - f.y);
  const onX = Math.abs(dx - f.hw) < tol, onY = Math.abs(dy - f.hh) < tol;
  const inX = dx < f.hw + tol, inY = dy < f.hh + tol;
  if (onX && onY) return {mode: 'resize'};
  if ((onX && inY) || (onY && inX)) return {mode: 'move'};
  return null;
}
/* Resize keeps the player screen's aspect — the frame *is* their screen — and
   works about the centre, so the shot you framed stays framed. */
function resizeFrame(camP) {
  const f = playerFrame();
  if (!f || !gmCanvas.height) return;
  const k = pCanvas.height / gmCanvas.height;
  const hw = Math.max(Math.abs(camP.x - f.x), Math.abs(camP.y - f.y) * (f.hw / f.hh));
  if (hw < 1) return;
  const scale = (pCanvas.width / (hw * 2)) / k;
  S.pcam.scale = Math.min(20, Math.max(0.02, scale));
}
function moveFrame(dx, dy) {
  S.pcam.x += dx;
  S.pcam.y += dy;
}

/* ---------- scene ---------- */
function renderView(ctx, canvas, isPlayer, cam, src = liveSrc()) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = isPlayer ? '#000' : '#0d0f13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!src.img) return;

  const m = viewMatrix(cam, canvas.width, canvas.height, src);
  ctx.setTransform(m);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.img, 0, 0);

  if (src.gridType !== 'off') drawGrid(ctx, canvas, cam, m, src);
  drawEffects(ctx, cam, isPlayer, src);

  // fog last: hides map, grid, effects and markers on the player screen
  if (src.fog) {
    ctx.globalAlpha = isPlayer ? 1 : 0.45;
    ctx.drawImage(src.fog, 0, 0, src.img.width, src.img.height);
    ctx.globalAlpha = 1;
  }

  if (!isPlayer) drawGMOverlay(ctx, canvas, cam, m);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawGrid(ctx, canvas, cam, m, src = liveSrc()) {
  const g = src.gridSize;
  if (g * cam.scale < 6) return;               // too dense to see — skip, saves CPU
  // visible map-space rect = bbox of the four screen corners
  const inv = m.inverse();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [sx, sy] of [[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]]) {
    const p = inv.transformPoint(new DOMPoint(sx, sy));
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  minX = Math.max(minX, 0); minY = Math.max(minY, 0);
  maxX = Math.min(maxX, src.img.width); maxY = Math.min(maxY, src.img.height);
  if (minX >= maxX || minY >= maxY) return;

  const v = src.gridShade;
  ctx.strokeStyle = `rgba(${v},${v},${v},${src.gridOp})`;
  ctx.lineWidth = 1.25 / cam.scale;
  ctx.beginPath();

  if (src.gridType === 'square') {
    for (let x = Math.floor(minX / g) * g; x <= maxX; x += g) {
      ctx.moveTo(x, minY); ctx.lineTo(x, maxY);
    }
    for (let y = Math.floor(minY / g) * g; y <= maxY; y += g) {
      ctx.moveTo(minX, y); ctx.lineTo(maxX, y);
    }
  } else {
    // pointy-top hexes; g = width across flats
    const R = g / Math.sqrt(3);                // circumradius
    const rowH = 1.5 * R;
    const j0 = Math.floor(minY / rowH) - 1, j1 = Math.ceil(maxY / rowH) + 1;
    const i0 = Math.floor(minX / g) - 1, i1 = Math.ceil(maxX / g) + 1;
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 20000) return;   // too many hexes to draw or see
    for (let j = j0; j <= j1; j++) {
      const cy = j * rowH;
      const off = (j & 1) ? g / 2 : 0;
      for (let i = i0; i <= i1; i++) {
        const cx = i * g + off;
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 180 * (60 * k - 30);
          const px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    }
  }
  ctx.stroke();
}

function drawEffects(ctx, cam, isPlayer, src = liveSrc()) {
  for (let i = 0; i < src.effects.length; i++) {
    const e = src.effects[i];
    const selected = !isPlayer && i === S.selected;
    if (e.type === 'marker') { drawMarker(ctx, e, cam, selected, src.rotation); continue; }
    effectPath(ctx, e);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = e.color;
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2 / cam.scale;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (selected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / cam.scale;
      ctx.setLineDash([6 / cam.scale, 4 / cam.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/* Markers counter-rotate so the icon reads upright however the map is turned. */
function drawMarker(ctx, e, cam, selected, rotation = S.rotation) {
  ctx.save();
  ctx.translate(e.x1, e.y1);
  if (rotation) ctx.rotate(-rotation * Math.PI / 180);
  drawIconMark(ctx, e.icon, e.size, e.color);
  ctx.restore();
  if (selected) {
    ctx.beginPath();
    ctx.arc(e.x1, e.y1, e.size * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 / cam.scale;
    ctx.setLineDash([6 / cam.scale, 4 / cam.scale]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawGMOverlay(ctx, canvas, cam, m) {
  // fog brush cursor ring
  if ((S.tool === 'hide' || S.tool === 'reveal') && mouse.over) {
    const p = screenToMap(mouse.x, mouse.y, cam, canvas);
    ctx.beginPath();
    ctx.arc(p.x, p.y, S.brushSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = S.tool === 'hide' ? 'rgba(255,80,80,.9)' : 'rgba(120,200,255,.9)';
    ctx.lineWidth = 1.5 / cam.scale;
    ctx.stroke();
  }
  // ghost of the marker about to be placed
  if (S.tool === 'marker' && mouse.over && !drag) {
    const p = screenToMap(mouse.x, mouse.y, cam, canvas);
    ctx.globalAlpha = 0.5;
    drawMarker(ctx, {x1: p.x, y1: p.y, icon: S.mkIcon, size: markerSize(), color: S.mkColor}, cam, false);
    ctx.globalAlpha = 1;
  }

  drawPlayerFrame(ctx, canvas, cam, m);

  // measurement while dragging out an effect
  if (drag && drag.kind === 'effect') {
    const e = S.effects[S.effects.length - 1];
    if (e.type === 'marker') return;
    const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
    const cells = len / S.gridSize;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${13 * DPR}px system-ui`;
    const txt = `${cells.toFixed(1)} cells / ${(cells * 5).toFixed(0)} ft`;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    const tw = ctx.measureText(txt).width;
    ctx.fillRect(mouse.x + 14 * DPR, mouse.y - 24 * DPR, tw + 12 * DPR, 20 * DPR);
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, mouse.x + 20 * DPR, mouse.y - 10 * DPR);
    ctx.setTransform(m);
  }
}

/* Outline of what the player screen is showing, so the GM can wander off and
   still see where the table's attention is parked. Pointless while mirroring —
   the frame would just trace the GM canvas edge. */
function drawPlayerFrame(ctx, canvas, cam, m) {
  if (!playerWin || playerWin.closed || !pCanvas || S.follow) return;

  // Parked on a different map: a rectangle would be drawn in another map's
  // coordinates and mean nothing here, so just name the scene they are on.
  const other = parkedSlot();
  if (other) {
    frameTag(ctx, canvas, m, `PLAYERS ARE ON ${other.name.toUpperCase()}`, null);
    return;
  }

  const pc = playerCam();
  const hw = pCanvas.width / pc.scale / 2, hh = pCanvas.height / pc.scale / 2;

  ctx.setTransform(camMatrix(cam, canvas.width, canvas.height));
  ctx.beginPath();
  ctx.rect(pc.x - hw, pc.y - hh, hw * 2, hh * 2);
  ctx.strokeStyle = 'rgba(216,162,71,.9)';
  ctx.lineWidth = 2 / cam.scale;
  ctx.setLineDash([10 / cam.scale, 7 / cam.scale]);
  ctx.stroke();
  ctx.setLineDash([]);

  // corner grips, so the frame reads as something you can take hold of
  if (editableFrame()) {
    const g = 5 / cam.scale;
    ctx.fillStyle = 'rgba(216,162,71,.95)';
    for (const gx of [pc.x - hw, pc.x + hw]) {
      for (const gy of [pc.y - hh, pc.y + hh]) ctx.fillRect(gx - g, gy - g, g * 2, g * 2);
    }
  }

  const cm = camMatrix(cam, canvas.width, canvas.height);
  frameTag(ctx, canvas, m, 'DRAG TO REFRAME · WHAT THE TABLE SEES',
           cm.transformPoint(new DOMPoint(pc.x - hw, pc.y - hh)));
}

/* Corner tag, drawn in screen space so it stays legible at any zoom. Anchors
   to the frame's top-left, or to the canvas corner when there is no frame. */
function frameTag(ctx, canvas, m, txt, tl) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${10 * DPR}px ui-monospace, monospace`;
  const tw = ctx.measureText(txt).width;
  const x = tl ? Math.max(2 * DPR, Math.min(tl.x, canvas.width - tw - 14 * DPR)) : 12 * DPR;
  const y = tl ? Math.max(16 * DPR, Math.min(tl.y, canvas.height - 4 * DPR)) : 26 * DPR;
  ctx.fillStyle = 'rgba(216,162,71,.92)';
  ctx.fillRect(x, y - 14 * DPR, tw + 10 * DPR, 15 * DPR);
  ctx.fillStyle = '#17140c';
  ctx.fillText(txt, x + 5 * DPR, y - 4 * DPR);
  ctx.setTransform(m);
}

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
  if (dirtyGM) renderView(gmCtx, gmCanvas, false, S.cam);
  if (dirtyP && playerWin && !playerWin.closed) renderView(pCtx, pCanvas, true, playerCam());
  dirtyGM = dirtyP = false;
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
function viewMatrix(cam, w, h) {
  const m = camMatrix(cam, w, h);
  if (S.img && S.rotation) {
    const cx = S.img.width / 2, cy = S.img.height / 2;
    m.translateSelf(cx, cy);
    m.rotateSelf(S.rotation);
    m.translateSelf(-cx, -cy);
  }
  return m;
}
function screenToMap(sx, sy, cam, canvas) {
  const p = viewMatrix(cam, canvas.width, canvas.height).inverse()
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
function rotatedBBox() {
  const r = Math.abs(S.rotation * Math.PI / 180);
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return {w: S.img.width * c + S.img.height * s, h: S.img.width * s + S.img.height * c};
}
function fitCam(canvas) {
  const bb = rotatedBBox();
  return {
    x: S.img.width / 2, y: S.img.height / 2,
    scale: Math.min(canvas.width / bb.w, canvas.height / bb.h) * 0.97,
  };
}

/* ---------- player camera ----------
   'fit'    the whole map, refit every frame
   'mirror' follows the GM camera live
   'hold'   parked on S.holdCam — the GM can go anywhere without moving it */
function playerCam() {
  if (!S.img || !pCanvas) return {x: 0, y: 0, scale: 1};
  const k = pCanvas.height / gmCanvas.height;
  if (S.playerMode === 'mirror') return {x: S.cam.x, y: S.cam.y, scale: S.cam.scale * k};
  if (S.playerMode === 'hold' && S.holdCam) {
    return {x: S.holdCam.x, y: S.holdCam.y, scale: S.holdCam.scale * k};
  }
  return fitCam(pCanvas);
}
/* The player's current framing expressed as a GM camera, so the GM can jump
   back to exactly what the table is looking at. */
function playerCamAsGM() {
  if (!S.img) return {...S.cam};
  if (S.playerMode === 'mirror') return {...S.cam};
  if (S.playerMode === 'hold' && S.holdCam) return {...S.holdCam};
  if (!pCanvas) return fitCam(gmCanvas);
  const pc = fitCam(pCanvas);
  const w = pCanvas.width / pc.scale, h = pCanvas.height / pc.scale;
  return {x: pc.x, y: pc.y, scale: Math.min(gmCanvas.width / w, gmCanvas.height / h)};
}

/* ---------- scene ---------- */
function renderView(ctx, canvas, isPlayer, cam) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = isPlayer ? '#000' : '#0d0f13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!S.img) return;

  const m = viewMatrix(cam, canvas.width, canvas.height);
  ctx.setTransform(m);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(S.img, 0, 0);

  if (S.gridType !== 'off') drawGrid(ctx, canvas, cam, m);
  drawEffects(ctx, cam, isPlayer);

  // fog last: hides map, grid, effects and markers on the player screen
  if (fogC) {
    ctx.globalAlpha = isPlayer ? 1 : 0.45;
    ctx.drawImage(fogC, 0, 0, S.img.width, S.img.height);
    ctx.globalAlpha = 1;
  }

  if (!isPlayer) drawGMOverlay(ctx, canvas, cam, m);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawGrid(ctx, canvas, cam, m) {
  const g = S.gridSize;
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
  maxX = Math.min(maxX, S.img.width); maxY = Math.min(maxY, S.img.height);
  if (minX >= maxX || minY >= maxY) return;

  const v = S.gridShade;
  ctx.strokeStyle = `rgba(${v},${v},${v},${S.gridOp})`;
  ctx.lineWidth = 1.25 / cam.scale;
  ctx.beginPath();

  if (S.gridType === 'square') {
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

function drawEffects(ctx, cam, isPlayer) {
  for (let i = 0; i < S.effects.length; i++) {
    const e = S.effects[i];
    const selected = !isPlayer && i === S.selected;
    if (e.type === 'marker') { drawMarker(ctx, e, cam, selected); continue; }
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
function drawMarker(ctx, e, cam, selected) {
  ctx.save();
  ctx.translate(e.x1, e.y1);
  if (S.rotation) ctx.rotate(-S.rotation * Math.PI / 180);
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
  if (!playerWin || playerWin.closed || !pCanvas || S.playerMode === 'mirror') return;
  const pc = playerCam();
  const hw = pCanvas.width / pc.scale / 2, hh = pCanvas.height / pc.scale / 2;
  const held = S.playerMode === 'hold';

  ctx.setTransform(camMatrix(cam, canvas.width, canvas.height));
  ctx.beginPath();
  ctx.rect(pc.x - hw, pc.y - hh, hw * 2, hh * 2);
  ctx.strokeStyle = held ? 'rgba(216,162,71,.9)' : 'rgba(216,162,71,.35)';
  ctx.lineWidth = 2 / cam.scale;
  ctx.setLineDash([10 / cam.scale, 7 / cam.scale]);
  ctx.stroke();
  ctx.setLineDash([]);

  // corner tag, in screen space so it stays legible at any zoom
  const cm = camMatrix(cam, canvas.width, canvas.height);
  const tl = cm.transformPoint(new DOMPoint(pc.x - hw, pc.y - hh));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const txt = held ? 'PLAYERS HELD HERE' : 'PLAYERS SEE WHOLE MAP';
  ctx.font = `${10 * DPR}px ui-monospace, monospace`;
  const tw = ctx.measureText(txt).width;
  const x = Math.max(2 * DPR, Math.min(tl.x, canvas.width - tw - 14 * DPR));
  const y = Math.max(16 * DPR, Math.min(tl.y, canvas.height - 4 * DPR));
  ctx.fillStyle = 'rgba(216,162,71,.92)';
  ctx.fillRect(x, y - 14 * DPR, tw + 10 * DPR, 15 * DPR);
  ctx.fillStyle = '#17140c';
  ctx.fillText(txt, x + 5 * DPR, y - 4 * DPR);
  ctx.setTransform(m);
}

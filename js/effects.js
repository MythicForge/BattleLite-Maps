'use strict';
/* Effect template geometry: path construction and hit testing.
   Effects live in map space as {type, x1,y1, x2,y2, color} where
   (x1,y1) is the anchor and (x2,y2) the drag point.

   Markers are the odd one out: {type:'marker', x1,y1, x2,y2, icon, size, color},
   drawn from icon geometry rather than a path (see render.js drawMarker), with
   (x1,y1) as the centre. They keep x2,y2 so dragging one moves it like any
   other effect. */

/* Default marker footprint: one grid cell, with a floor so it stays clickable
   on maps with tiny cells. */
function markerSize() {
  return Math.max(24, S.gridSize * 0.9);
}

/* Lines are 5 ft wide: one cell. */
function lineHalfWidth(g = S.gridSize) { return Math.max(4, g) / 2; }

/* The cone's three corners: apex at the anchor, and the far edge as wide as
   the cone is long (the 5e cone). */
function coneCorners(e) {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1, len = Math.hypot(dx, dy);
  const px = -dy / len, py = dx / len;          // perpendicular unit
  return [
    {x: e.x1, y: e.y1},
    {x: e.x2 + px * len / 2, y: e.y2 + py * len / 2},
    {x: e.x2 - px * len / 2, y: e.y2 - py * len / 2},
  ];
}

function effectPath(ctx, e, g = S.gridSize) {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  const len = Math.hypot(dx, dy);
  ctx.beginPath();
  switch (e.type) {
    case 'circle':
      ctx.arc(e.x1, e.y1, len, 0, Math.PI * 2);
      break;
    case 'square': {
      const x = Math.min(e.x1, e.x2), y = Math.min(e.y1, e.y2);
      ctx.rect(x, y, Math.abs(dx), Math.abs(dy));
      break;
    }
    case 'cone': {
      if (len < 1) break;
      const [a, b, c] = coneCorners(e);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
      ctx.closePath();
      break;
    }
    case 'line': {
      if (len < 1) break;
      const w = lineHalfWidth(g);
      const px = -dy / len * w, py = dx / len * w;
      ctx.moveTo(e.x1 + px, e.y1 + py);
      ctx.lineTo(e.x2 + px, e.y2 + py);
      ctx.lineTo(e.x2 - px, e.y2 - py);
      ctx.lineTo(e.x1 - px, e.y1 - py);
      ctx.closePath();
      break;
    }
  }
}

/* Is map point p inside effect e? `pad` grows the shape (for easier picking).
   One test serves both clicking an effect and working out the squares it hits. */
function effectContains(e, p, pad = 0, g = S.gridSize) {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  const len = Math.hypot(dx, dy);
  switch (e.type) {
    case 'marker':
      return Math.hypot(p.x - e.x1, p.y - e.y1) <= e.size * 0.6;
    case 'circle':
      return Math.hypot(p.x - e.x1, p.y - e.y1) <= len + pad;
    case 'square':
      return p.x >= Math.min(e.x1, e.x2) - pad && p.x <= Math.max(e.x1, e.x2) + pad &&
             p.y >= Math.min(e.y1, e.y2) - pad && p.y <= Math.max(e.y1, e.y2) + pad;
    case 'line': {
      if (len < 1) return false;
      const t = ((p.x - e.x1) * dx + (p.y - e.y1) * dy) / (len * len);
      if (t < -pad / len || t > 1 + pad / len) return false;
      const qx = e.x1 + t * dx, qy = e.y1 + t * dy;
      return Math.hypot(p.x - qx, p.y - qy) <= lineHalfWidth(g) + pad;
    }
    case 'cone': {
      if (len < 1) return false;
      const [a, b, c] = coneCorners(e);
      const s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
      const s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    }
  }
  return false;
}

/* Topmost effect containing map point p, or -1. */
function hitEffect(p) {
  for (let i = S.effects.length - 1; i >= 0; i--) {
    if (effectContains(S.effects[i], p, S.effects[i].type === 'line' ? 4 : 0)) return i;
  }
  return -1;
}

/* ---------- the grid ----------
   Snapping and squares-hit only mean something on a square grid; on hex or
   with the grid off, templates stay freehand. */
function squareGrid(src = liveSrc()) { return src.gridType === 'square' && src.gridSize > 0; }
function fxSnapOn() { return S.fxSnap && squareGrid(); }

/* Nearest grid intersection. */
function snapCorner(p, src = liveSrc()) {
  const g = src.gridSize, ox = src.gridOffX || 0, oy = src.gridOffY || 0;
  return {x: Math.round((p.x - ox) / g) * g + ox, y: Math.round((p.y - oy) / g) * g + oy};
}

/* Where a template starts. Spheres and cubes start on a grid corner. Cones and
   lines come off a creature's side, so they may also start mid-edge — which
   is what lets a 5 ft line run straight down one row instead of along a seam. */
function snapAnchor(type, p, src = liveSrc()) {
  const c = snapCorner(p, src);
  if (type === 'circle' || type === 'square') return c;
  const g = src.gridSize, ox = src.gridOffX || 0, oy = src.gridOffY || 0;
  const cands = [
    c,
    {x: Math.round((p.x - ox - g / 2) / g) * g + ox + g / 2, y: Math.round((p.y - oy) / g) * g + oy},
    {x: Math.round((p.x - ox) / g) * g + ox, y: Math.round((p.y - oy - g / 2) / g) * g + oy + g / 2},
  ];
  let best = cands[0], bd = Infinity;
  for (const q of cands) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/* Point the drag end at p, snapped: a cube's far corner lands on an
   intersection; a circle, cone or line keeps its direction and grows in whole
   cells, never shorter than one. */
function snapEffectEnd(fx, p) {
  if (fx.type === 'square') {
    const c = snapCorner(p);
    fx.x2 = c.x; fx.y2 = c.y;
    return;
  }
  const g = S.gridSize;
  const dx = p.x - fx.x1, dy = p.y - fx.y1, len = Math.hypot(dx, dy);
  const L = Math.max(1, Math.round(len / g)) * g;
  if (len < 1) { fx.x2 = fx.x1 + L; fx.y2 = fx.y1; return; }
  fx.x2 = fx.x1 + dx / len * L;
  fx.y2 = fx.y1 + dy / len * L;
}

/* Grid squares an effect hits: those whose centre it covers. The centre rule
   is the common table call, and it gives every template one plain answer. */
function coveredCells(e, src = liveSrc()) {
  if (e.type === 'marker' || !squareGrid(src)) return [];
  const g = src.gridSize, ox = src.gridOffX || 0, oy = src.gridOffY || 0;
  const pad = e.type === 'line' ? lineHalfWidth(g) : 0;
  const xs = [e.x1, e.x2], ys = [e.y1, e.y2];
  if (e.type === 'circle' || e.type === 'cone') {
    const r = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) * (e.type === 'cone' ? 1.2 : 1);
    xs.push(e.x1 - r, e.x1 + r); ys.push(e.y1 - r, e.y1 + r);
  }
  const i0 = Math.floor((Math.min(...xs) - pad - ox) / g), i1 = Math.ceil((Math.max(...xs) + pad - ox) / g);
  const j0 = Math.floor((Math.min(...ys) - pad - oy) / g), j1 = Math.ceil((Math.max(...ys) + pad - oy) / g);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) return [];   // a runaway drag, not a spell
  const out = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = ox + i * g, y = oy + j * g;
      if (effectContains(e, {x: x + g / 2, y: y + g / 2}, 1e-6 * g, g)) out.push({x, y});
    }
  }
  return out;
}

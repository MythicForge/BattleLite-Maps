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

function effectPath(ctx, e) {
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
      const px = -dy / len, py = dx / len;          // perpendicular unit
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2 + px * len / 2, e.y2 + py * len / 2);
      ctx.lineTo(e.x2 - px * len / 2, e.y2 - py * len / 2);
      ctx.closePath();
      break;
    }
    case 'line': {
      if (len < 1) break;
      const w = Math.max(4, S.gridSize * 0.25) / 2;
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

/* Topmost effect containing map point p, or -1. */
function hitEffect(p) {
  for (let i = S.effects.length - 1; i >= 0; i--) {
    const e = S.effects[i];
    const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
    const len = Math.hypot(dx, dy);
    switch (e.type) {
      case 'marker':
        if (Math.hypot(p.x - e.x1, p.y - e.y1) <= e.size * 0.6) return i;
        break;
      case 'circle':
        if (Math.hypot(p.x - e.x1, p.y - e.y1) <= len) return i;
        break;
      case 'square':
        if (p.x >= Math.min(e.x1, e.x2) && p.x <= Math.max(e.x1, e.x2) &&
            p.y >= Math.min(e.y1, e.y2) && p.y <= Math.max(e.y1, e.y2)) return i;
        break;
      case 'line': {
        if (len < 1) break;
        const t = Math.max(0, Math.min(1, ((p.x - e.x1) * dx + (p.y - e.y1) * dy) / (len * len)));
        const qx = e.x1 + t * dx, qy = e.y1 + t * dy;
        if (Math.hypot(p.x - qx, p.y - qy) <= Math.max(4, S.gridSize * 0.25) / 2 + 4) return i;
        break;
      }
      case 'cone': {
        if (len < 1) break;
        const px = -dy / len, py = dx / len;
        const a = {x: e.x1, y: e.y1};
        const b = {x: e.x2 + px * len / 2, y: e.y2 + py * len / 2};
        const c = {x: e.x2 - px * len / 2, y: e.y2 - py * len / 2};
        const s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        const s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
        const s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return i;
        break;
      }
    }
  }
  return -1;
}

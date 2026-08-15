'use strict';
/* Icons come straight from Lucide (ISC licence) at runtime.

   index.html loads node_modules/lucide/dist/umd/lucide.min.js as a classic
   script — a file on disk, so file:// is fine — and every icon in the set
   lands on the global `lucide`. Names are kebab-case here and PascalCase
   there. Using one is just naming it: no build step, no copied path data.

   An icon is a list of [tag, attrs] pairs in a 24x24 box, drawn with a
   2-unit round stroke. The same list feeds both the SVG buttons and the
   canvas markers. */

/* Palette order: the marks a GM reaches for mid-combat come first. */
const MARKER_ICONS = [
  'x', 'crosshair', 'target', 'circle-dot', 'arrow-up', 'map-pin',
  'flag', 'skull', 'triangle-alert', 'swords', 'shield', 'crown',
  'heart', 'flame', 'zap', 'star', 'eye', 'footprints',
  'door-closed', 'lock', 'key-round', 'box', 'tree-pine', 'users',
];

/* kebab-case -> Lucide's PascalCase key. Returns undefined for a name Lucide
   does not have, which is how the tests catch an icon renamed upstream. */
function iconNode(name) {
  const key = String(name).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  return lucide.icons[key];
}

/* ---------- SVG, for the dock, the drawer and the palette ---------- */
function iconSVG(name, size = 20) {
  const parts = (iconNode(name) || iconNode('x')).map(([tag, attrs]) => {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"` +
         ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}

/* ---------- Path2D, for canvas markers ---------- */
const iconPaths = new Map();
function iconPath(name) {
  let p = iconPaths.get(name);
  if (p) return p;
  p = new Path2D();
  for (const [tag, a] of iconNode(name) || iconNode('x')) {
    if (tag === 'path') { p.addPath(new Path2D(a.d)); continue; }
    const sub = new Path2D();                       // own subpath: no line from the previous shape
    if (tag === 'circle') {
      sub.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    } else if (tag === 'ellipse') {
      sub.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    } else if (tag === 'rect') {
      if (sub.roundRect) sub.roundRect(+a.x, +a.y, +a.width, +a.height, +(a.rx || 0));
      else sub.rect(+a.x, +a.y, +a.width, +a.height);
    } else if (tag === 'line') {
      sub.moveTo(+a.x1, +a.y1);
      sub.lineTo(+a.x2, +a.y2);
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = a.points.trim().split(/[\s,]+/).map(Number);
      sub.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) sub.lineTo(pts[i], pts[i + 1]);
      if (tag === 'polygon') sub.closePath();
    }
    p.addPath(sub);
  }
  iconPaths.set(name, p);
  return p;
}

/* Draw an icon centred on (0,0) of the current transform, sized `size` units.
   Stroked twice: a dark halo first so light icons stay readable on light maps. */
function drawIconMark(ctx, name, size, color) {
  const path = iconPath(name);
  ctx.save();
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.lineWidth = 4.5;
  ctx.stroke(path);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke(path);
  ctx.restore();
}

'use strict';
/* Marker icon geometry — Lucide (ISC licence), inlined.

   file:// URLs have no network, so the icons this app uses are embedded as
   shape data instead of loaded from the lucide package. Every icon lives in
   Lucide's 24x24 box and is drawn with a 2-unit round stroke, so the same data
   feeds both the sidebar SVG buttons and the canvas markers.

   Shape encoding: 'c cx cy r' = circle, 'r x y w h rx' = rounded rect,
   anything else is an SVG path 'd' string. */

const ICONS = {
  x: ['M18 6 6 18', 'm6 6 12 12'],
  crosshair: ['c 12 12 10', 'M22 12h-4', 'M6 12H2', 'M12 6V2', 'M12 22v-4'],
  target: ['c 12 12 10', 'c 12 12 6', 'c 12 12 2'],
  'circle-dot': ['c 12 12 10', 'c 12 12 1'],
  'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
  'map-pin': [
    'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    'c 12 10 3',
  ],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22V15'],
  skull: [
    'm12.5 17-.5-1-.5 1h1z',
    'M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z',
    'c 9 12 1', 'c 15 12 1',
  ],
  'triangle-alert': [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
    'M12 9v4', 'M12 17h.01',
  ],
  swords: [
    'M14.5 17.5 3 6V3h3l11.5 11.5', 'M13 19l6-6', 'M16 16l4 4', 'M19 21l2-2',
    'M14.5 6.5 18 3h3v3l-3.5 3.5', 'M5 14l4 4', 'M7 17l-3 3', 'M3 19l2 2',
  ],
  shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  ],
  crown: [
    'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    'M5 21h14',
  ],
  heart: [
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  ],
  flame: [
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  ],
  zap: [
    'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  ],
  star: [
    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  ],
  eye: [
    'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
    'c 12 12 3',
  ],
  footprints: [
    'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z',
    'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z',
    'M16 17h4', 'M4 13h4',
  ],
  'door-closed': ['M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14', 'M2 20h20', 'M14 12h.01'],
  lock: ['r 3 11 18 11 2', 'M7 11V7a5 5 0 0 1 10 0v4'],
  'key-round': [
    'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
    'c 16.5 7.5 .5',
  ],
  box: [
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'm3.3 7 8.7 5 8.7-5', 'M12 22V12',
  ],
  'tree-pine': [
    'm17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z',
    'M12 22v-3',
  ],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'c 12 7 4'],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c 9 7 4',
    'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75',
  ],
};

/* Palette order: the marks a GM reaches for mid-combat come first. */
const MARKER_ICONS = [
  'x', 'crosshair', 'target', 'circle-dot', 'arrow-up', 'map-pin',
  'flag', 'skull', 'triangle-alert', 'swords', 'shield', 'crown',
  'heart', 'flame', 'zap', 'star', 'eye', 'footprints',
  'door-closed', 'lock', 'key-round', 'box', 'tree-pine', 'users',
];

/* ---------- SVG, for sidebar buttons ---------- */
function iconSVG(name, size = 20) {
  const parts = (ICONS[name] || []).map(s => {
    const t = s.split(' ');
    if (t[0] === 'c') return `<circle cx="${t[1]}" cy="${t[2]}" r="${t[3]}"/>`;
    if (t[0] === 'r') return `<rect x="${t[1]}" y="${t[2]}" width="${t[3]}" height="${t[4]}" rx="${t[5]}"/>`;
    return `<path d="${s}"/>`;
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
  for (const s of ICONS[name] || ICONS.x) {
    const t = s.split(' ');
    if (t[0] === 'c') {
      const sub = new Path2D();                       // own subpath: no line from the previous shape
      sub.arc(+t[1], +t[2], +t[3], 0, Math.PI * 2);
      p.addPath(sub);
    } else if (t[0] === 'r') {
      const sub = new Path2D();
      if (sub.roundRect) sub.roundRect(+t[1], +t[2], +t[3], +t[4], +t[5]);
      else sub.rect(+t[1], +t[2], +t[3], +t[4]);
      p.addPath(sub);
    } else {
      p.addPath(new Path2D(s));
    }
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

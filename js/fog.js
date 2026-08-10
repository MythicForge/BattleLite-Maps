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

function hideAll() {
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.fillStyle = '#000';
  fogCtx.fillRect(0, 0, fogC.width, fogC.height);
  fogChanged();
  requestRender();
}

function revealAll() {
  fogCtx.clearRect(0, 0, fogC.width, fogC.height);
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

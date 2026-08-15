'use strict';
/* Getting map images in: file button, drag & drop, and clipboard paste.
   Every image loaded becomes a new map slot (see maps.js) and opens straight
   away. Images are read as data URLs so a session can be saved with them —
   and re-encoded as WebP on the way in, because a 6 MB PNG map is what pushes
   an autosave past the localStorage limit. */

const IMPORT_QUALITY = 0.85;

function prettyName(filename) {
  if (!filename) return `Map ${S.maps.length + 1}`;
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return `Map ${S.maps.length + 1}`;
  return base.length > 22 ? base.slice(0, 21) + '…' : base;
}

/* Data URLs are base64, so their length is about 4/3 of the bytes. */
function dataSize(url) { return (url.length * 0.75 / 1e6).toFixed(1) + ' MB'; }

/* Returns a WebP data URL, or the original when WebP is unavailable or comes
   out bigger (already-compressed jpegs sometimes do). */
function toWebP(img, src) {
  if (!canEncodeWebP()) return src;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  let url;
  try { url = c.toDataURL('image/webp', IMPORT_QUALITY); } catch (e) { return src; }
  return (url.startsWith('data:image/webp') && url.length < src.length) ? url : src;
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const name = prettyName(file.name);
      const src = toWebP(img, r.result);
      if (src === r.result) { addMap(img, src, name); return; }
      // load the converted image back, so the stage shows exactly what a
      // reopened session will show
      const webp = new Image();
      webp.onload = () => {
        const before = S.maps.length;
        addMap(webp, src, name);
        if (S.maps.length > before) {
          setSaveStatus(`${name} added — ${dataSize(r.result)} → ${dataSize(src)} as WebP`, 'ok');
        }
      };
      webp.onerror = () => addMap(img, r.result, name);
      webp.src = src;
    };
    img.onerror = () => setSaveStatus('That image could not be read', 'warn');
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

const fileInput = document.getElementById('fileInput');
document.getElementById('btnLoad').onclick = () => fileInput.click();
document.getElementById('btnAddMap').onclick = () => fileInput.click();
fileInput.onchange = e => {
  loadImageFile(e.target.files[0]);
  e.target.value = '';                     // let the same file be added twice
};
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => {
  e.preventDefault();
  loadImageFile(e.dataTransfer.files[0]);
});
window.addEventListener('paste', e => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) { loadImageFile(item.getAsFile()); break; }
  }
});

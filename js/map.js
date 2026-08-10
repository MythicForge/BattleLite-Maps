'use strict';
/* Getting map images in: file button, drag & drop, and clipboard paste.
   Every image loaded becomes a new map slot (see maps.js) and opens straight
   away. Images are read as data URLs so a session can be saved with them. */

function prettyName(filename) {
  if (!filename) return `Map ${S.maps.length + 1}`;
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return `Map ${S.maps.length + 1}`;
  return base.length > 22 ? base.slice(0, 21) + '…' : base;
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => addMap(img, r.result, prettyName(file.name));
    img.onerror = () => setSaveStatus('That image could not be read', 'warn');
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

document.getElementById('btnLoad').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = e => {
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

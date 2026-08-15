const {api, ctxStub, makeCanvas, useFakeIDB} = require('./harness');
const s = api;
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) fails++;
};
const tick = () => new Promise(r => setTimeout(r, 60));

(async () => {
  const S = s.S;

  // ---- icons build ----
  let bad = [];
  for (const n of s.MARKER_ICONS) { try { s.iconPath(n); } catch (e) { bad.push(n + ':' + e.message); } }
  ok('all palette icons build a Path2D', bad.length === 0, bad.join(','));
  ok('palette has 24 icons, all of them names Lucide knows',
     s.MARKER_ICONS.length === 24 && s.MARKER_ICONS.every(n => s.iconNode(n)),
     s.MARKER_ICONS.filter(n => !s.iconNode(n)).join(','));
  // the dock and drawer name their icons in the markup — an upstream rename
  // would silently turn them all into an X without this
  const markup = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const named = [...markup.matchAll(/data-icon="([^"]+)"/g)].map(m => m[1]);
  ok('every icon named in index.html exists in Lucide',
     named.length === 10 && named.every(n => s.iconNode(n)),
     named.filter(n => !s.iconNode(n)).join(','));
  ok('icon svg markup renders shapes', s.iconSVG('skull').includes('<circle') && s.iconSVG('lock').includes('<rect'));

  // ---- add two maps ----
  const mk = (w, h) => { const i = new s.Image(); i.width = w; i.height = h; return i; };
  s.addMap(mk(1000, 800), 'data:image/png;base64,A', 'Cavern');
  ok('first map opens', S.maps.length === 1 && S.active === 0 && S.img !== null);
  ok('new map starts fully hidden', s.fogC !== null && s.fogC.width === 1000);

  S.gridSize = 100;
  S.effects.push({type: 'marker', x1: 10, y1: 10, x2: 10, y2: 10, icon: 'x', size: 90, color: '#fff'});
  s.addMap(mk(600, 400), 'data:image/png;base64,B', 'Tavern');
  ok('second map opens and is empty', S.maps.length === 2 && S.active === 1 && S.effects.length === 0);
  ok('first map kept its marker + grid size', S.maps[0].effects.length === 1 && S.maps[0].gridSize === 100);
  ok('a new map inherits the cell size you were using', S.gridSize === 100);

  // ---- swap back by number ----
  s.showSlot(0);
  ok('switching back restores marker', S.active === 0 && S.effects.length === 1);
  ok('switching back restores grid size', S.gridSize === 100);
  ok('switching back restores that map image', S.img.width === 1000);
  ok('fog canvas follows the slot', s.fogC.width === 1000);
  const cam0 = {...S.cam};
  S.cam.x += 250;
  s.showSlot(1); s.showSlot(0);
  ok('each map remembers its own camera', Math.abs(S.cam.x - (cam0.x + 250)) < 0.001, S.cam.x);

  // ---- marker hit test ----
  ok('marker hit test picks it up', s.hitEffect({x: 15, y: 15}) === 0);
  ok('marker hit test misses outside', s.hitEffect({x: 400, y: 400}) === -1);
  ok('marker default size tracks cell size', s.markerSize() === 90);

  // ---- the player screen: a frame the GM moves, not a mode ----
  const pc = makeCanvas(); pc.width = 1920; pc.height = 1080;
  s.pCanvas = pc; s.pCtx = ctxStub(); s.playerWin = {closed: false};
  s.fitPlayers();
  ok('the table starts on the whole map',
     Math.abs(s.playerCam().scale - Math.min(1600 / 1000, 1000 / 800) * 0.97 * (1080 / 1000)) < 1e-9);

  s.setFollow(true);
  ok('following puts the table on the GM camera', s.playerCam().x === S.cam.x && S.follow === true);

  const shownToPlayers = {...S.cam};
  s.setFollow(false);
  ok('unfollowing parks them on what they were seeing',
     S.pcam.x === shownToPlayers.x && S.pcam.scale === shownToPlayers.scale);

  S.cam = {x: 5, y: 5, scale: 3};                       // GM wanders off
  ok('the table does not move while the GM wanders', s.playerCam().x === shownToPlayers.x);
  s.matchPlayerView();                                   // the "V" key
  ok('go to their view restores the exact camera',
     S.cam.x === shownToPlayers.x && S.cam.y === shownToPlayers.y && S.cam.scale === shownToPlayers.scale);
  s.setFollow(true);
  ok('following again after the jump moves nothing for them',
     Math.abs(s.playerCam().x - shownToPlayers.x) < 1e-9 &&
     Math.abs(s.playerCam().scale - shownToPlayers.scale * (1080 / 1000)) < 1e-9);
  s.setFollow(false);

  // sending a scene is the deliberate act; nothing else reaches the table
  S.cam = {x: 111, y: 222, scale: 2};
  s.sendPlayersTo(S.active, S.cam);
  ok('send puts them on this scene with this framing',
     S.playerSlot === S.active && s.playerCamAsGM().x === 111);

  // ---- the table keeps its scene while the GM preps another ----
  const theirImg = S.img;
  s.showSlot(1);                                         // GM goes to prep another map
  ok('the GM can switch maps without moving the table',
     s.playerSrc().img === theirImg && s.playerSrc().img !== S.img);
  ok('the GM canvas still draws the open map', s.liveSrc().img === S.img);
  ok('their scene is the one lit as live', s.liveSlotIndex() === 0 && S.active === 1,
     s.liveSlotIndex() + ' vs active ' + S.active);
  s.matchPlayerView();                                   // V — go to what they see
  ok('go to their view brings the GM back to their scene', S.active === 0);
  s.setFollow(true);
  ok('following drags them along to the GM scene', s.playerSrc().img === S.img);
  s.setFollow(false);

  // ---- the frame is draggable ----
  ok('the frame is live while the GM is on their scene', s.editableFrame() === true);
  const f = s.playerFrame();
  const toScreen = (x, y) => {
    const m = s.camMatrix(S.cam, 1600, 1000);
    return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  };
  ok('the frame centre does not grab — panning still works there',
     s.frameHit(...toScreen(f.x, f.y)) === null);
  ok('an edge grabs to move', (s.frameHit(...toScreen(f.x, f.y - f.hh)) || {}).mode === 'move');
  ok('a corner grabs to resize',
     (s.frameHit(...toScreen(f.x - f.hw, f.y - f.hh)) || {}).mode === 'resize');

  const before = {...S.pcam};
  s.moveFrame(40, -25);
  ok('dragging the frame moves only the table, not the GM camera',
     S.pcam.x === before.x + 40 && S.pcam.y === before.y - 25 && S.cam.x !== S.pcam.x);
  const wide = s.playerFrame();
  s.resizeFrame({x: wide.x + wide.hw * 2, y: wide.y});
  const grown = s.playerFrame();
  ok('a corner drag rescales and keeps the player screen aspect',
     Math.abs(grown.hw / grown.hh - wide.hw / wide.hh) < 1e-9 && grown.hw > wide.hw * 1.9);

  // adopting: a fresh scene gives the table the whole map, framed
  ok('a newly opened scene gives the table a real camera to drag',
     !!S.pcam && s.editableFrame() === true);

  // ---- session round trip ----
  const json = JSON.stringify(s.buildSession());
  ok('session serialises both maps', JSON.parse(json).maps.length === 2);
  S.maps = []; S.active = -1; S.img = null;
  await s.restoreSession(JSON.parse(json));
  await tick();
  ok('session restores both maps', S.maps.length === 2);
  ok('restored map keeps its name and marker',
     S.maps[0].name === 'Cavern' && S.maps[0].effects.length === 1);
  ok('restore never comes back following', S.follow === false);

  // ---- autosave: no storage at all (file:// in Chrome) ----
  s.writeSave();
  await tick();
  ok('without IndexedDB the status line says so, and nothing is written',
     s.saveStatusText().startsWith('No autosave here'));

  // ---- autosave: IndexedDB, no size cap ----
  const idb = useFakeIDB();
  s.writeSave();
  await tick();
  const stored = idb.stores.session && idb.stores.session.current;
  ok('autosave writes the session to IndexedDB', !!stored && JSON.parse(stored).maps.length === 2);
  ok('nothing refuses a session for being large', s.jsonSize('x'.repeat(2e7)) === '20.0 MB');
  S.maps = []; S.active = -1; S.img = null;
  await s.restoreAutosave();
  await tick();
  ok('autosave restores on load', S.maps.length === 2 && S.img !== null);

  // a session left behind by the localStorage build is carried over once
  idb.stores.session.current = null;
  s.localStorage.setItem('battlemap.session.v1', stored);
  S.maps = []; S.active = -1; S.img = null;
  await s.restoreAutosave();
  await tick();
  ok('an old localStorage session is migrated, then dropped',
     S.maps.length === 2 && s.localStorage.getItem('battlemap.session.v1') === null);

  // ---- fog encoding is cached ----
  let enc = 0;
  S.maps.forEach(m => {
    const orig = m.fog.toDataURL;
    m.fog.toDataURL = () => { enc++; return orig(); };
    m.fogDirty = false; m.fogURL = 'data:cached';
  });
  s.buildSession();
  ok('unchanged fog is not re-encoded on save', enc === 0, 'encodes=' + enc);
  S.maps[0].fogDirty = true;
  s.buildSession();
  ok('changed fog is re-encoded once', enc === 1, 'encodes=' + enc);

  // ---- dock flyouts and the drawer ----
  s.showPanel('grid');
  ok('opening a panel shows only that flyout',
     s.openPanel === 'grid' && s.flyouts.grid.hidden === false && s.flyouts.fog.hidden === true);
  s.togglePanel('grid');
  ok('the same key again closes it', s.openPanel === null && s.flyouts.grid.hidden === true);
  s.showPanel('fog');
  s.setDrawer(true);
  ok('Esc closes the panel before the drawer',
     s.escapeConsole() === true && s.openPanel === null &&
     s.escapeConsole() === true && s.escapeConsole() === false);

  // ---- image encoding ----
  ok('webp probe answers without throwing', typeof s.canEncodeWebP() === 'boolean');
  ok('no webp encoder means the original image is kept',
     s.canEncodeWebP() || s.toWebP({width: 10, height: 10}, 'data:image/png;base64,A') === 'data:image/png;base64,A');

  // ---- removing a slot ----
  s.removeMap(0);
  ok('removing a map leaves the other open', S.maps.length === 1 && S.maps[0].name === 'Tavern' && S.active === 0);
  s.removeMap(0);
  ok('removing the last map clears the stage', S.maps.length === 0 && S.img === null && S.active === -1);

  console.log(fails ? `\n${fails} failing` : '\nall passing');
  process.exit(fails ? 1 : 0);
})();

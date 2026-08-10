const {api, ctxStub, makeCanvas} = require('./harness');
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
  ok('palette has 24 icons, all defined in ICONS',
     s.MARKER_ICONS.length === 24 && s.MARKER_ICONS.every(n => s.ICONS[n]));
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

  // ---- player camera modes ----
  const pc = makeCanvas(); pc.width = 1920; pc.height = 1080;
  s.pCanvas = pc; s.pCtx = ctxStub(); s.playerWin = {closed: false};
  s.setPlayerMode('fit');
  ok('fit mode frames the whole map', Math.abs(s.playerCam().scale - Math.min(1920 / 1000, 1080 / 800) * 0.97) < 1e-9);

  s.setPlayerMode('mirror');
  ok('mirror follows the GM camera', s.playerCam().x === S.cam.x && S.mirror === true);

  const shownToPlayers = {...S.cam};
  s.setPlayerMode('hold');
  ok('hold parks on what they were seeing',
     S.holdCam.x === shownToPlayers.x && S.holdCam.scale === shownToPlayers.scale);
  ok('mirror flag clears when holding', S.mirror === false);

  S.cam = {x: 5, y: 5, scale: 3};                       // GM wanders off
  ok('players do not move while GM wanders', s.playerCam().x === shownToPlayers.x);
  s.matchPlayerView();                                   // the "V" key
  ok('jump to player view restores the exact camera',
     S.cam.x === shownToPlayers.x && S.cam.y === shownToPlayers.y && S.cam.scale === shownToPlayers.scale);
  s.setPlayerMode('mirror');
  ok('re-mirroring after the jump moves nothing for players',
     Math.abs(s.playerCam().x - shownToPlayers.x) < 1e-9 &&
     Math.abs(s.playerCam().scale - shownToPlayers.scale * (1080 / 1000)) < 1e-9);

  // ---- session round trip ----
  const json = JSON.stringify(s.buildSession());
  ok('session serialises both maps', JSON.parse(json).maps.length === 2);
  S.maps = []; S.active = -1; S.img = null;
  await s.restoreSession(JSON.parse(json));
  await tick();
  ok('session restores both maps', S.maps.length === 2);
  ok('restored map keeps its name and marker',
     S.maps[0].name === 'Cavern' && S.maps[0].effects.length === 1);
  ok('restore never comes back mirroring', S.playerMode !== 'mirror');

  // ---- autosave ----
  s.writeSave();
  ok('autosave writes to localStorage', !!s.localStorage.getItem('battlemap.session.v1'));
  S.maps = []; S.active = -1;
  s.restoreAutosave();
  await tick();
  ok('autosave restores on load', S.maps.length === 2 && S.img !== null);

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

  // ---- removing a slot ----
  s.removeMap(0);
  ok('removing a map leaves the other open', S.maps.length === 1 && S.maps[0].name === 'Tavern' && S.active === 0);
  s.removeMap(0);
  ok('removing the last map clears the stage', S.maps.length === 0 && S.img === null && S.active === -1);

  console.log(fails ? `\n${fails} failing` : '\nall passing');
  process.exit(fails ? 1 : 0);
})();

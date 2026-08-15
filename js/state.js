'use strict';
/* Shared application state and canvas handles. Loaded first; every other
   file reads and mutates these top-level globals.

   The fields at the top of S are the *live* map: whichever map slot is
   currently open. maps.js copies them in and out of S.maps on a slot switch,
   so the rest of the app never has to know slots exist. */

const S = {
  img: null,
  rotation: 0,                       // degrees
  cam: {x: 0, y: 0, scale: 1},       // GM camera: map point (in rotated space) at canvas center
  gridType: 'square',                // 'off' | 'square' | 'hex'
  gridSize: 70,                      // map px per cell
  gridShade: 0,                      // 0..255
  gridOp: 0.6,
  effects: [],                       // {type, x1,y1,x2,y2, color} — markers add {icon, size}
  selected: -1,

  brushSize: 80,                     // map px diameter
  tool: 'select',                    // select | hide | reveal | circle | line | cone | square | marker
  fxColor: '#ff4444',
  mkColor: '#ffd166',
  mkIcon: 'x',

  maps: [],                          // map slots, see maps.js
  active: -1,                        // index into S.maps, -1 = nothing loaded

  /* The table's view is always an explicit thing, not a mode: a camera and
     the scene it is parked on. `follow` is the one live link to the GM —
     with it off, nothing the GM does reaches the table until they send it. */
  pcam: null,                        // player camera {x,y,scale}, in GM-canvas terms
  playerSlot: -1,                    // scene the table is on; -1 until a map exists
  follow: false,                     // table tracks the GM camera *and* scene changes
};

const MAX_SLOTS = 9;                 // 1–9 hotkeys
const FOG_MAX = 2560;                // cap fog mask resolution
let fogC = null, fogCtx = null, fogScale = 1;

const gmCanvas = document.getElementById('gmCanvas');
const gmCtx = gmCanvas.getContext('2d');
const stage = document.getElementById('stage');
const dropHint = document.getElementById('dropHint');
const DPR = window.devicePixelRatio || 1;

let playerWin = null, pCanvas = null, pCtx = null;

/* input state (written by input.js, read by render.js for overlays) */
const mouse = {x: 0, y: 0, over: false};
let drag = null;   // {kind:'pan'|'fog'|'effect'|'move', ...}
let spaceHeld = false;

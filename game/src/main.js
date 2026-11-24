// Neon Harbor: Rogue Run — the boot and the loop.
//
// Owns the canvas, the screen state machine (title → play → pause /
// run over), the fixed-step loop, and the wiring between input, world,
// sound and renderer. The title floats over a demo world that drives
// itself; a finished run keeps its money and story progress in
// localStorage, so the harbour remembers you between visits.
//
// With ?shot=<scene>&seed=<n> in the address the game instead stages
// one deterministic scene from shots.js, draws it once, and sets
// window.__shotReady — that is how the entry's screenshots were taken.

import { STEP, VIEW } from './config.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { World, autopilotControl, emptyControl } from './world.js';
import { drawScene, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_OVER } from './render.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'neon-harbor-rogue-run.save';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');
const params = new URLSearchParams(window.location.search);

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// -------------------------------------------------------------- shot staging

if (params.has('shot')) {
  const seed = Number.parseInt(params.get('seed') || '1', 10) || 1;
  const staged = stageShot(params.get('shot'), seed);
  drawScene(ctx, staged.world, { screen: staged.screen, hint: false, savedNote: '' });
  window.__shotReady = true;
} else {
  runGame();
}

// ------------------------------------------------------------------ saving

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.offerIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function storeSave(world) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Private windows refuse storage; the run simply is not kept.
  }
}

// ------------------------------------------------------------------ the game

function runGame() {
  const input = new Input(canvas);
  const sound = new Sound();
  const saved = loadSave();
  let screen = SCREEN_TITLE;
  let world = new World((Date.now() % 2147483647) + 1, { demo: true });
  let overTimer = -1;
  let accumulator = 0;
  let lastStamp = performance.now();

  const announce = (text) => { statusLine.textContent = text; };
  announce('Neon Harbor: Rogue Run. Title screen: press Enter to start.');

  function startRun() {
    const keep = saved ?? world.saveData();
    world = new World((Date.now() % 2147483647) + 1, {
      money: screen === SCREEN_OVER ? world.money : keep.money,
      offerIndex: screen === SCREEN_OVER ? world.offerIndex : keep.offerIndex,
    });
    screen = SCREEN_PLAY;
    overTimer = -1;
    sound.unlock();
    announce('The run begins. See Vesper at the Sail & Anchor bar for work.');
  }

  function playerControl() {
    const control = emptyControl();
    control.move = input.axis();
    control.run = input.held('ShiftLeft') || input.held('ShiftRight');
    control.drive = input.drive();
    control.interact = input.wasPressed('KeyE') || input.wasPressed('KeyF');
    control.toggleMinimap = input.wasPressed('KeyC');
    control.fire = input.pointer.down;
    control.aimX = world.camX - VIEW.width / 2 + input.pointer.x;
    control.aimY = world.camY - VIEW.height / 2 + input.pointer.y;
    return control;
  }

  function handleScreenKeys() {
    if (input.wasPressed('KeyM')) sound.setMuted(!sound.muted);
    if (input.clicked) sound.unlock();
    if (screen === SCREEN_TITLE && (input.wasPressed('Enter') || input.clicked)) startRun();
    else if (screen === SCREEN_OVER && overTimer < 0 && (input.wasPressed('Enter') || input.clicked)) startRun();
    else if (screen === SCREEN_PLAY && (input.wasPressed('KeyP') || input.wasPressed('Escape'))) {
      screen = SCREEN_PAUSE;
      storeSave(world);
      announce('Paused.');
    } else if (screen === SCREEN_PAUSE) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) screen = SCREEN_PLAY;
      else if (input.wasPressed('Enter')) startRun();
    }
  }

  function drainEvents() {
    for (const event of world.events) {
      sound.playEvent(event);
      if (event.type === 'busted' || event.type === 'wasted') {
        overTimer = 1.1;
        storeSave(world);
      }
      if (event.type === 'cash') storeSave(world);
      if (event.type === 'spray') storeSave(world); // a respray spends money too
    }
    world.events.length = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastStamp) / 1000;
    lastStamp = now;
    if (dt > 0.25) dt = 0.25;

    handleScreenKeys();

    if (screen !== SCREEN_PAUSE) {
      accumulator += dt;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        if (screen === SCREEN_TITLE) world.step(STEP, autopilotControl(world));
        else if (screen === SCREEN_PLAY) world.step(STEP, playerControl());
        else world.step(STEP, emptyControl());
      }
      drainEvents();
      sound.update(world, dt);
      if (overTimer > 0) {
        overTimer -= dt;
        if (overTimer <= 0) {
          overTimer = -1;
          screen = SCREEN_OVER;
          announce(`Run over: ${world.endKind}. Press Enter to run again.`);
        }
      }
      if (screen === SCREEN_TITLE && world.time > 150) {
        world = new World((Date.now() % 2147483647) + 1, { demo: true });
      }
    }

    drawScene(ctx, world, {
      screen,
      hint: screen === SCREEN_PLAY && world.time < 10,
      savedNote: saved ? `Welcome back — $${saved.money} and Vesper's ledger kept.` : '',
      muted: sound.muted,
    });
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

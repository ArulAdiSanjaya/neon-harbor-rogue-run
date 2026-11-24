// Neon Harbor: Rogue Run — the boot and the loop.
//
// Owns the canvas, the screen state machine (title → play → pause /
// run over), the fixed-step loop, and the wiring between input, world,
// sound and renderer. The title floats over a demo world that drives
// itself; a finished run keeps its money and story progress in
// localStorage, so the harbour remembers you between visits. C
// toggles the minimap between the whole city and a zoomed-in view
// around the player; the choice is session-only and never saved.
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
import { drawHeistBoard } from './heistui.js';

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
  let minimapZoom = false; // C toggles it; render.js reads it from the view
  let helpOpen = false; // H toggles the controls card; render.js reads it from the view
  let heistOpen = false; // J toggles the Harbor Heist League board near the warehouse
  let accumulator = 0;
  let lastStamp = performance.now();

  const announce = (text) => { statusLine.textContent = text; };
  announce('Neon Harbor: Rogue Run. Title screen: press Enter to start. Hire a crew at their hangouts, race at the marina gate, run cab fares with the meter.');

  function startRun() {
    const keep = saved ?? world.saveData();
    world = new World((Date.now() % 2147483647) + 1, {
      money: screen === SCREEN_OVER ? world.money : keep.money,
      offerIndex: screen === SCREEN_OVER ? world.offerIndex : keep.offerIndex,
      // Crew hires/levels and race best times carry over with the save.
      save: screen === SCREEN_OVER ? world.saveData() : keep,
    });
    screen = SCREEN_PLAY;
    overTimer = -1;
    sound.unlock();
    announce('The run begins. See Vesper at the Sail & Anchor bar for work. Hire crew at their ringed hangouts (E on foot), race at the marina gate (E in a car), and take cab fares — riders hail a car with its light on, T toggles the light.');
  }

  function playerControl() {
    const control = emptyControl();
    control.move = input.axis();
    control.run = input.held('ShiftLeft') || input.held('ShiftRight');
    control.drive = input.drive();
    control.interact = input.wasPressed('KeyE') || input.wasPressed('KeyF');
    control.fire = input.pointer.down;
    control.aimX = world.camX - VIEW.width / 2 + input.pointer.x;
    control.aimY = world.camY - VIEW.height / 2 + input.pointer.y;
    return control;
  }

  function handleScreenKeys() {
    if (input.wasPressed('KeyM')) sound.setMuted(!sound.muted);
    if (input.wasPressed('KeyC')) minimapZoom = !minimapZoom;
    if (screen === SCREEN_PLAY && input.helpToggle()) helpOpen = !helpOpen;
    // The cab light is read once a frame, here — never inside the
    // fixed step, where one press could flip it twice in a frame.
    if (screen === SCREEN_PLAY && input.cabLightToggle()) {
      const on = world.taxi.toggleLight();
      world.notify(on ? 'Cab light ON — riders will hail your car' : 'Cab light OFF — the riders will wait for another cab');
      announce(on ? 'Cab light on.' : 'Cab light off.');
    }
    // Harbor Heist League board: J toggles it near the warehouse, E
    // on foot at the board opens it too (world sets boardOpen). While
    // it is open, 1-6 select a heist and Enter starts the selected one.
    if (world.heist.boardOpen) {
      heistOpen = true;
      world.heist.boardOpen = false;
    }
    if (screen === SCREEN_PLAY && input.heistBoardToggle()) {
      if (heistOpen) heistOpen = false;
      else if (world.heist.nearBoard(world.player.x, world.player.y)) heistOpen = true;
    }
    if (heistOpen && screen === SCREEN_PLAY) {
      for (let n = 0; n < 6; n += 1) {
        if (input.wasPressed(`Digit${n + 1}`)) world.heist.selectHeist(n);
      }
      if (input.wasPressed('Enter') && world.heist.startSelected(world)) heistOpen = false;
      // X walks away from a live heist while the board is open.
      if (input.wasPressed('KeyX')) world.heist.abortHeist(world);
    }
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
      // A hire, a race win or a paid fare changes the save too
      // (crew roster, best times, cab ledger).
      if (event.type === 'hire' || event.type === 'raceWin' || event.type === 'taxiDropoff') storeSave(world);
      // A fenced heist changes the save too (league rep, completed heists).
      if (event.type === 'heist') storeSave(world);
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
      savedNote: saved
        ? `Welcome back — $${saved.money} and Vesper's ledger kept.${saved.crew && Object.keys(saved.crew.hired || {}).length ? ` Crew: ${Object.keys(saved.crew.hired).join(', ')}.` : ''}${saved.race && Object.values(saved.race.bestTimes || {}).some(Boolean) ? ' Race best times kept.' : ''}${saved.taxi && saved.taxi.stats && saved.taxi.stats.fares ? ` Cab: ${saved.taxi.stats.fares} fares, $${saved.taxi.stats.earned} earned.` : ''}`
        : '',
      muted: sound.muted,
      minimapZoom,
      help: helpOpen,
    });
    if (heistOpen && screen === SCREEN_PLAY) drawHeistBoard(ctx, world);
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

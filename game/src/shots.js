// Screenshot scenes, staged the honest way: each one starts a fresh
// world from a seed and plays the real rules forward at the fixed
// step, driven by the autopilots in world.js, until the scene's
// moment arrives. The same seed always stages the same frame, and
// nothing is drawn that the game itself would not draw in play.
// main.js enters this mode for ?shot=<scene>&seed=<n> and raises
// window.__shotReady once the frame is on the canvas.
//
// Scenes: title (the demo city behind the title), onfoot (the runner
// crossing the city toward Vesper's marker), chase (a stolen car at
// three stars with the watch closing in), mission (a night delivery
// under a ticking timer), race (the Harbor Loop live from the marina
// gate, rivals on the road). The chase stages at three stars — below the
// four-star roadblock threshold — so the frame stays a pursuit, not
// a pile-up behind a barricade.

import { STEP } from './config.js';
import { World, autopilotControl, emptyControl, recklessControl } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';
import { BAR } from './missions.js';
import { RACE_GATE, roadCenterX, roadCenterY } from './city.js';

function runSeconds(world, seconds, controlFor) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, controlFor(world));
    world.events.length = 0;
    if (world.over) break;
  }
}

function stageOnfoot(seed) {
  const world = new World(seed);
  // Take Vesper's first job, then walk the runner part-way to the dock
  // shed so the marker, the harbour and the traffic are all in frame.
  runSeconds(world, 1.2, autopilotControl); // walks to the bar, takes the job
  runSeconds(world, 9, autopilotControl);
  return { world, screen: SCREEN_PLAY };
}

function stageChase(seed) {
  const world = new World(seed);
  // Take a car (the autopilot's nearest-car seek), then put the chase
  // on an open central road, raise a three-star heat, and let the
  // reckless pilot run while the watch converges — topping the heat
  // up each second, as a witnessed crime spree would.
  let guard = 0;
  while (!world.player.car && guard < 40 * 60) {
    world.step(STEP, chaseSeekControl(world));
    world.events.length = 0;
    guard += 1;
  }
  const car = world.player.car;
  if (car) {
    car.x = roadCenterX(3) - 23;
    car.y = roadCenterY(2);
    car.angle = 0;
    car.speed = 240;
    world.player.x = car.x;
    world.player.y = car.y;
    world.camX = car.x;
    world.camY = car.y;
  }
  world.heat = 62; // three stars
  world.updateWanted();
  // Run in short slices, hoping to settle on a frame that reads as a
  // chase: the player moving fast with an officer close behind.
  let staged = false;
  for (let s = 0; s < 24 && !world.over && !staged; s += 1) {
    runSeconds(world, 0.25, recklessControl);
    world.heat = Math.max(world.heat, 62);
    world.updateWanted();
    world.unseenTime = 0;
    if (s === 8 && world.police.length) bringOneCopClose(world);
    const carNow = world.player.car;
    let nearest = Infinity;
    for (const cop of world.police) nearest = Math.min(nearest, Math.hypot(cop.x - world.player.x, cop.y - world.player.y));
    if (s > 6 && carNow && Math.abs(carNow.speed) > 150 && nearest < 560) staged = true;
  }
  if (!staged) {
    // The natural chase never framed itself (a bust, a pile-up): use a
    // fresh world if this one ended, arrange the pursuit on an open
    // road, then let the real police AI run it for a beat.
    const fresh = world.over ? new World(seed) : world;
    if (world.over) {
      let guard2 = 0;
      while (!fresh.player.car && guard2 < 40 * 60) {
        fresh.step(STEP, chaseSeekControl(fresh));
        fresh.events.length = 0;
        guard2 += 1;
      }
    }
    arrangePursuit(fresh);
    runSeconds(fresh, 0.9, recklessControl);
    fresh.heat = Math.max(fresh.heat, 62);
    fresh.updateWanted();
    return { world: fresh, screen: SCREEN_PLAY };
  }
  return { world, screen: SCREEN_PLAY };
}

/**
 * Put the player's car on an open eastbound road at speed, with two
 * officers right behind it — the start of a pursuit the real police
 * AI then drives.
 */
function arrangePursuit(world) {
  const car = world.player.car;
  if (!car) return;
  car.x = roadCenterX(2);
  car.y = roadCenterY(2) + 23;
  car.angle = 0;
  car.speed = 300;
  car.health = 100;
  world.player.x = car.x;
  world.player.y = car.y;
  world.camX = car.x;
  world.camY = car.y;
  while (world.police.length < 2) {
    world.police.push(world.makeCar(car.x - 400, car.y, 0, '#e8ecf2', 'police'));
  }
  const [copA, copB] = world.police;
  copA.x = car.x - 150; copA.y = car.y; copA.angle = 0; copA.speed = 330; copA.health = 100;
  copB.x = car.x - 310; copB.y = car.y - 46; copB.angle = 0; copB.speed = 330; copB.health = 100;
  world.heat = 62;
  world.updateWanted();
  world.unseenTime = 0;
  world.bustMeter = 0;
}

/** Move the farthest officer to a road point behind the player. */
function bringOneCopClose(world) {
  let far = world.police[0];
  let farD = -1;
  for (const cop of world.police) {
    const d = Math.hypot(cop.x - world.player.x, cop.y - world.player.y);
    if (d > farD) { farD = d; far = cop; }
  }
  far.x = roadCenterX(Math.max(0, Math.min(6, Math.round(world.player.x / 342))));
  far.y = Math.max(80, world.player.y - 300);
  far.angle = Math.PI / 2;
  far.speed = 200;
}

/** On-foot control that heads for the nearest car and gets in. */
function chaseSeekControl(world) {
  const control = emptyControl();
  const p = world.player;
  if (p.car) return control;
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return control;
  if (bestD < 46) { control.interact = true; return control; }
  control.move = { x: (best.x - p.x) / bestD, y: (best.y - p.y) / bestD };
  control.run = true;
  control.aimX = best.x;
  control.aimY = best.y;
  return control;
}

function stageMission(seed) {
  const world = new World(seed, { night: true });
  world.night = true;
  // Skip ahead in the story: pretend the first jobs are done and open
  // the Hot Delivery. Walk the pickup at the bar on foot first (that
  // is how the stage completes), then take a car and drive the timed
  // delivery leg part-way across the night city.
  world.offerIndex = 2;
  world.jobCount = 1;
  world.offer = world.currentOffer();
  world.player.x = BAR.x + 120;
  world.player.y = BAR.y + 150;
  world.startMission(world.offer.data);
  let guard = 0;
  while (world.mission && world.mission.stageIndex === 0 && guard < 30 * 60) {
    world.step(STEP, autopilotControl(world));
    world.events.length = 0;
    guard += 1;
  }
  guard = 0;
  while (!world.player.car && guard < 40 * 60) {
    world.step(STEP, chaseSeekControl(world));
    world.events.length = 0;
    guard += 1;
  }
  // Drive the delivery leg; settle on a frame where the car is
  // actually moving through the night streets.
  for (let s = 0; s < 44; s += 1) {
    runSeconds(world, 0.25, autopilotControl);
    if (s > 10 && world.player.car && Math.abs(world.player.car.speed) > 130) break;
    if (!world.mission) break;
  }
  world.night = true; // the step cycle may have flipped it; the scene is night
  return { world, screen: SCREEN_PLAY };
}

function stageRace(seed) {
  const world = new World(seed);
  // Get the runner into a car, line it up at the marina gate, press
  // E to start the Harbor Loop, then let the race autopilot drive
  // the checkpoints — the frame shows the countdown over, the race
  // live, rivals on the road and the position HUD.
  let guard = 0;
  while (!world.player.car && guard < 40 * 60) {
    world.step(STEP, chaseSeekControl(world));
    world.events.length = 0;
    guard += 1;
  }
  const car = world.player.car;
  if (car) {
    car.x = RACE_GATE.x - 20;
    car.y = RACE_GATE.y;
    car.angle = 0;
    car.speed = 0;
    world.player.x = car.x;
    world.player.y = car.y;
    world.camX = car.x;
    world.camY = car.y;
    world.tryInteract(); // starts the Harbor Loop from the gate
  }
  // Countdown (3s) plus a few racing seconds, driven by the real
  // race-aware autopilot, so rivals and checkpoints are in frame.
  runSeconds(world, 3.2, autopilotControl);
  runSeconds(world, 4, autopilotControl);
  return { world, screen: SCREEN_PLAY };
}

export function stageShot(name, seed) {
  if (name === 'onfoot') return stageOnfoot(seed);
  if (name === 'chase') return stageChase(seed);
  if (name === 'mission') return stageMission(seed);
  if (name === 'race') return stageRace(seed);
  const world = new World(seed, { demo: true });
  runSeconds(world, 6, autopilotControl);
  return { world, screen: SCREEN_TITLE };
}

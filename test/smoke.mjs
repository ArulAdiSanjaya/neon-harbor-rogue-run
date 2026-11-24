// Headless smoke test for the Harbor Heat rewrite — runs the real
// game logic in Node, no browser, no DOM. Each case prints PASS or
// FAIL; the process exits non-zero if any case fails.
//
//   node test/smoke.mjs

import { STEP, WANTED } from '../game/src/config.js';
import { World, emptyControl } from '../game/src/world.js';
import { STORY, makeJob, BAR } from '../game/src/missions.js';
import { makeRng } from '../game/src/random.js';
import { roadCenterX, roadCenterY } from '../game/src/city.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function stepN(world, n, controlFor) {
  for (let i = 0; i < n; i += 1) {
    world.step(STEP, controlFor ? controlFor(world) : emptyControl());
    world.events.length = 0;
    if (world.over) break;
  }
}

/** Put the player (and their car, if any) at a point, standing still. */
function teleport(world, x, y) {
  world.player.x = x;
  world.player.y = y;
  if (world.player.car) {
    world.player.car.x = x;
    world.player.car.y = y;
    world.player.car.speed = 0;
  }
  world.camX = x;
  world.camY = y;
}

/** Hand the player the nearest parked car, the way E would. */
function giveCar(world) {
  const car = world.cars.find((c) => c.kind === 'parked');
  if (!car) throw new Error('no parked car to take');
  world.cars.splice(world.cars.indexOf(car), 1);
  car.kind = 'player';
  world.player.car = car;
  world.drivenCar = car;
  world.player.x = car.x;
  world.player.y = car.y;
  return car;
}

/** Step until the current stage completes or the guard runs out. */
function runStage(world, x, y, guardSteps = 30) {
  teleport(world, x, y);
  const before = world.mission ? world.mission.stageIndex : -1;
  for (let i = 0; i < guardSteps; i += 1) {
    world.step(STEP, emptyControl());
    world.events.length = 0;
    if (!world.mission) return 'done';
    if (world.mission.stageIndex !== before) return 'advanced';
    if (world.over) return 'over';
  }
  return 'stuck';
}

// ------------------------------------------------------- mission 5: Harbor Lights

check('story has 5 missions, #5 is Harbor Lights paying $750',
  STORY.length === 5 && STORY[4].title === 'Harbor Lights' && STORY[4].pay === 750,
  `STORY.length=${STORY.length}`);

{
  const w = new World(7, { money: 0 });
  w.offerIndex = 8; // storyIdx 4: the fifth story offer
  w.offer = w.currentOffer();
  check('mission 5 is offered after mission 4 (offerIndex 8)',
    w.offer.kind === 'story' && w.offer.data.title === 'Harbor Lights');
  w.startMission(w.offer.data);
  const m5 = w.mission.data;
  const [pickup, survive, deliver] = m5.stages;
  check('mission 5 stage 1 is the marina pickup',
    runStage(w, pickup.x, pickup.y) === 'advanced' && w.mission.stageIndex === 1);
  check('survive stage opens at 4 stars', w.wanted === 4 && w.mission.data.stages[1].kind === 'survive',
    `wanted=${w.wanted}`);
  // Survive the 60-second hold in a car: keep the runner moving
  // between road points and keep any officer from sitting on them,
  // the way a driving player would — the hold itself is under test.
  giveCar(w);
  let holdOk = true;
  let endKind = '';
  const holdSteps = Math.ceil(62 / STEP);
  for (let i = 0; i < holdSteps; i += 1) {
    if (i % 120 === 0) {
      teleport(w, roadCenterX((i / 120) % 7), roadCenterY(2));
      const car = w.player.car;
      car.angle = 0;
      car.speed = 250;
      car.health = 100;
      w.player.health = 100;
    }
    for (const cop of w.police) {
      if (Math.hypot(cop.x - w.player.x, cop.y - w.player.y) < 320) {
        cop.x = w.player.x + 800;
        cop.y = w.player.y - 800;
      }
    }
    w.step(STEP, emptyControl());
    w.events.length = 0;
    if (w.over) { holdOk = false; endKind = w.endKind; break; }
    if (!w.mission) break; // hold finished early (should not)
    if (w.mission.stageIndex !== 1) break; // hold finished
  }
  check('survive stage completes after the 60s hold at 4 stars',
    holdOk && w.mission && w.mission.stageIndex === 2,
    `stageIndex=${w.mission?.stageIndex}, over=${w.over}, endKind=${endKind}`);
  check('mission 5 delivery leg completes and pays exactly $750',
    runStage(w, deliver.x, deliver.y) === 'done' && w.money === 750 && !w.mission,
    `money=${w.money}, mission=${w.mission ? 'still open' : 'none'}`);
}

// ------------------------------------------------------------- roadblocks

{
  const w = new World(11, { money: 500 });
  const car = giveCar(w);
  car.angle = 0; // eastbound on a road
  teleport(w, roadCenterX(2), roadCenterY(2));
  car.angle = 0;
  w.heat = 90; // four stars
  w.updateWanted();
  stepN(w, 30);
  check('roadblock spawns at 4 stars', Boolean(w.roadblock),
    `wanted=${w.wanted}, roadblock=${w.roadblock ? 'yes' : 'no'}`);
  const rb = w.roadblock;
  check('roadblock is two cruisers plus a barricade',
    rb && rb.cars.length === 2 && Boolean(rb.barricade),
    rb ? `cars=${rb.cars.length}, barricade=${Boolean(rb.barricade)}` : 'no roadblock');
  // Ram it: re-approach at speed until the pieces break or it clears.
  let damaged = false;
  let cleared = false;
  for (let i = 0; i < 1500 && w.roadblock && !w.over; i += 1) {
    const block = w.roadblock;
    w.heat = Math.max(w.heat, 90); // hold the heat at 4 stars for the test
    w.updateWanted();
    if (block.barricade && block.barricade.health < 45) damaged = true;
    if (block.cars.some((c) => c.health < 55)) damaged = true;
    const c = w.player.car;
    c.x = block.x - block.dirX * 110;
    c.y = block.y - block.dirY * 110;
    c.angle = Math.atan2(block.dirY, block.dirX);
    c.speed = 320;
    c.health = Math.max(c.health, 60);
    w.player.x = c.x;
    w.player.y = c.y;
    w.step(STEP, emptyControl());
    w.events.length = 0;
    if (!w.roadblock) { cleared = true; break; }
  }
  check('roadblock is rammable (pieces take damage / it clears)',
    damaged || cleared, `damaged=${damaged}, cleared=${cleared}`);
  // Heat drop clears a fresh block.
  if (!w.roadblock) {
    w.roadblockCooldown = 0;
    w.heat = 90;
    w.updateWanted();
    stepN(w, 30);
  }
  check('roadblock re-spawns at 4 stars after a clear', Boolean(w.roadblock));
  if (w.roadblock) {
    w.heat = 0;
    w.updateWanted();
    stepN(w, 30);
    check('roadblock clears when heat drops below 4', !w.roadblock);
  }
  // Escape clears a fresh block.
  w.roadblockCooldown = 0;
  w.heat = 90;
  w.updateWanted();
  stepN(w, 30);
  if (w.roadblock) {
    const block = w.roadblock;
    teleport(w, block.x + block.dirX * 220, block.y + block.dirY * 220);
    stepN(w, 5);
    check('roadblock clears when the player escapes past it', !w.roadblock);
  } else {
    check('roadblock clears when the player escapes past it', false, 'no roadblock to escape');
  }
}

{
  // Five stars also sets a block.
  const w = new World(12, { money: 0 });
  giveCar(w);
  teleport(w, roadCenterX(3), roadCenterY(2));
  w.heat = 130; // five stars
  w.updateWanted();
  stepN(w, 30);
  check('roadblock spawns at 5 stars', Boolean(w.roadblock) && w.wanted === 5,
    `wanted=${w.wanted}`);
}

// ------------------------------------------------------------- spray shop

{
  const w = new World(13, { money: 200 });
  const car = giveCar(w);
  car.health = 40;
  w.heat = 90;
  w.updateWanted();
  teleport(w, w.sprayShop.x, w.sprayShop.y);
  // One step: the spray fires at the end of it, so read the star
  // count on that same step — later steps decay the heat further,
  // which is the base game's unseen-heat fade, not the spray.
  w.step(STEP, emptyControl());
  const sprayed = w.events.some((e) => e.type === 'spray');
  w.events.length = 0;
  check('spray shop charges exactly $80', w.money === 120, `money=${w.money}`);
  check('spray shop repairs the car to full health', car.health === 100, `health=${car.health}`);
  check('spray shop removes exactly 1 star (4 -> 3)',
    w.wanted === 3 && w.heat === WANTED.starHeat[3] && sprayed,
    `wanted=${w.wanted}, heat=${w.heat}, sprayed=${sprayed}`);
}

{
  // Broke: less than $80, wanted, in a car.
  const w = new World(14, { money: 50 });
  const car = giveCar(w);
  car.health = 40;
  w.heat = 90;
  w.updateWanted();
  teleport(w, w.sprayShop.x, w.sprayShop.y);
  stepN(w, 5);
  check('spray shop charges nothing when broke', w.money === 50, `money=${w.money}`);
  check('spray shop does not repair when broke', car.health === 40, `health=${car.health}`);
  check('spray shop shows the need-$80 notice when broke',
    Boolean(w.notice) && w.notice.text.includes('$80'), `notice=${w.notice?.text ?? 'none'}`);
}

{
  // On foot: no trigger at all.
  const w = new World(15, { money: 200 });
  w.heat = 90;
  w.updateWanted();
  teleport(w, w.sprayShop.x, w.sprayShop.y);
  stepN(w, 5);
  const sprayed = w.events.some((e) => e.type === 'spray');
  check('spray shop never triggers on foot', w.money === 200 && !sprayed && w.wanted === 4,
    `money=${w.money}, wanted=${w.wanted}`);
}

// ------------------------------------------------- getaway-driver chains

{
  const rng = makeRng(99);
  const first = makeJob(rng, 0);
  const second = makeJob(rng, 1);
  const third = makeJob(rng, 2);
  check('normal single jobs are unchanged (2 stages, no chain flag)',
    first.stages.length === 2 && !first.chain && second.stages.length === 2 && !second.chain);
  check('every 3rd free-roam job is a chained 3-drop route',
    third.chain === true && third.stages.length === 4 && third.title.startsWith('Getaway driver'),
    `chain=${third.chain}, stages=${third.stages.length}`);
  check('chain job has one shared timer and distance-scaled pay',
    typeof third.sharedTimer === 'number' && third.sharedTimer > 60 && third.pay > first.pay,
    `sharedTimer=${third.sharedTimer}, pay=${third.pay} vs single ${first.pay}`);

  const w = new World(17, { money: 0 });
  w.startMission(third);
  const shared = third.sharedTimer;
  const t0 = runStage(w, third.stages[0].x, third.stages[0].y);
  check('chain pickup completes', t0 === 'advanced' && w.mission.stageIndex === 1);
  const timerAfterPickup = w.mission.timer;
  check('chain timer starts at the shared timer',
    timerAfterPickup !== null && timerAfterPickup <= shared && timerAfterPickup > shared - 5,
    `timer=${timerAfterPickup}, shared=${shared}`);
  const t1 = runStage(w, third.stages[1].x, third.stages[1].y);
  const timerAfterDrop1 = w.mission ? w.mission.timer : null;
  check('chain drop 1 completes on the same clock (no fresh timer)',
    t1 === 'advanced' && timerAfterDrop1 !== null && timerAfterDrop1 < timerAfterPickup,
    `timer=${timerAfterDrop1}, was=${timerAfterPickup}`);
  const t2 = runStage(w, third.stages[2].x, third.stages[2].y);
  const timerAfterDrop2 = w.mission ? w.mission.timer : null;
  check('chain drop 2 completes on the same clock',
    t2 === 'advanced' && timerAfterDrop2 !== null && timerAfterDrop2 < timerAfterDrop1,
    `timer=${timerAfterDrop2}, was=${timerAfterDrop1}`);
  const t3 = runStage(w, third.stages[3].x, third.stages[3].y);
  check('chain drop 3 completes the job and pays the scaled amount',
    t3 === 'done' && w.money === third.pay, `money=${w.money}, pay=${third.pay}`);
}

// ------------------------------------------------------- minimap + saves

{
  const w = new World(19);
  check('minimap starts unzoomed', w.minimapZoom === false);
  const c = emptyControl();
  c.toggleMinimap = true;
  w.step(STEP, c);
  check('pressing C zooms the minimap', w.minimapZoom === true);
  w.step(STEP, c);
  check('pressing C again returns to the default view', w.minimapZoom === false);
}

{
  const w = new World(21, { money: 123, offerIndex: 4 });
  const saved = w.saveData();
  check('save format unchanged (money + offerIndex only)',
    saved.money === 123 && saved.offerIndex === 4 && Object.keys(saved).length === 2,
    JSON.stringify(saved));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

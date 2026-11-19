// The simulation: Neon Harbor itself, stepped at a fixed rate.
//
// Everything the game simulates lives here and nowhere else — the
// player on foot and in cars, traffic that follows the road grid,
// pedestrians on the sidewalks, the harbour watch (police) with its
// wanted ladder, gunfire, and the mission state machine that walks
// Vesper's story and the free-roam jobs. step() takes a plain control
// object (from input.js in play, from the autopilots in shots.js and
// the title demo) and pushes happenings onto world.events for the
// sound synth to voice. Nothing in this file draws or touches the DOM.

import { CAR, CITY, PLAYER, POLICE, WANTED } from './config.js';
import { makeRng } from './random.js';
import {
  CAR_COLORS, buildCity, collideCircle, nearestRoadX, nearestRoadY, roadCenterX, roadCenterY,
} from './city.js';
import { BAR, STORY, makeJob } from './missions.js';

const TAU = Math.PI * 2;

function angleWrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export class World {
  constructor(seed, options = {}) {
    this.city = buildCity(seed);
    this.rng = makeRng(seed * 31 + 7);
    this.demo = Boolean(options.demo);
    this.time = 0;
    this.night = Boolean(options.night);
    this.events = [];
    this.over = false;
    this.endKind = null; // 'busted' | 'wasted'
    this.money = options.money ?? 0;
    this.offerIndex = options.offerIndex ?? 0;
    this.jobCount = 0;

    this.player = {
      x: BAR.x + 30, y: BAR.y + 66, vx: 0, vy: 0,
      angle: -Math.PI / 2, health: PLAYER.health, car: null,
      fireCooldown: 0, hurtTimer: 0,
    };
    this.camX = this.player.x;
    this.camY = this.player.y;

    this.cars = [];
    this.police = [];
    this.peds = [];
    this.heat = 0;
    this.wanted = 0;
    this.unseenTime = 99;
    this.bustMeter = 0;
    this.crimeTimers = {};
    this.missionCar = null;

    this.spawnTraffic();
    this.spawnParked();
    this.spawnPeds();

    this.mission = null;         // { data, stageIndex, timer }
    this.dialogue = null;        // { speaker, text, until }
    this.notice = null;          // { text, until }
    this.offer = this.currentOffer();

    if (this.demo) this.say('VESPER', 'The harbour never sleeps. Neither do its debts.', 8);
  }

  // ------------------------------------------------------------ setup

  currentOffer() {
    // Story jobs alternate with street work: story, job, story, job…
    const storyIdx = Math.floor(this.offerIndex / 2);
    if (this.offerIndex % 2 === 1 || storyIdx >= STORY.length) {
      return { kind: 'job', data: makeJob(this.rng, this.jobCount) };
    }
    return { kind: 'story', data: STORY[storyIdx] };
  }

  spawnTraffic() {
    for (let i = 0; i < 13; i += 1) {
      const vertical = this.rng.chance(0.5);
      const line = vertical
        ? roadCenterX(this.rng.int(0, CITY.cols))
        : roadCenterY(this.rng.int(0, CITY.rows));
      const along = this.rng.range(120, (vertical ? CITY.height : CITY.width) - 200);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const car = this.makeCar(
        vertical ? line + (dir > 0 ? -23 : 23) : along,
        vertical ? along : line + (dir > 0 ? 23 : -23),
        vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
        this.rng.pick(CAR_COLORS),
        'traffic',
      );
      car.axis = vertical ? 'v' : 'h';
      car.dir = dir;
      car.speed = this.rng.range(120, 190);
      car.cruise = car.speed;
      this.cars.push(car);
    }
  }

  spawnParked() {
    for (let i = 0; i < 16; i += 1) {
      const vertical = this.rng.chance(0.5);
      const line = vertical
        ? roadCenterX(this.rng.int(0, CITY.cols))
        : roadCenterY(this.rng.int(0, CITY.rows));
      const along = this.rng.range(90, (vertical ? CITY.height : CITY.width) - 260);
      const side = this.rng.chance(0.5) ? -1 : 1;
      const car = this.makeCar(
        vertical ? line + side * 33 : along,
        vertical ? along : line + side * 33,
        vertical ? Math.PI / 2 : 0,
        this.rng.pick(CAR_COLORS),
        'parked',
      );
      car.speed = 0;
      this.cars.push(car);
    }
  }

  spawnPeds() {
    for (let i = 0; i < 22; i += 1) {
      const vertical = this.rng.chance(0.5);
      const line = vertical
        ? roadCenterX(this.rng.int(0, CITY.cols))
        : roadCenterY(this.rng.int(0, CITY.rows));
      const side = this.rng.chance(0.5) ? -1 : 1;
      const along = this.rng.range(60, (vertical ? CITY.height : CITY.width) - 200);
      this.peds.push({
        x: vertical ? line + side * 57 : along,
        y: vertical ? along : line + side * 57,
        axis: vertical ? 'v' : 'h', dir: this.rng.chance(0.5) ? 1 : -1, side,
        speed: this.rng.range(38, 62), state: 'walk', timer: 0,
        color: this.rng.pick(['#d95f4b', '#4b8fd9', '#e0c33c', '#7ac74f', '#c86dd7', '#e8e8e8', '#5fd0c5']),
        dangerX: 0, dangerY: 0,
      });
    }
  }

  makeCar(x, y, angle, color, kind) {
    return {
      x, y, angle, speed: 0, health: CAR.health, color, kind,
      axis: 'v', dir: 1, cruise: 150, skidding: false, smoke: 0,
      hitCooldown: 0,
    };
  }

  // ------------------------------------------------------------- talk

  say(speaker, text, seconds = 6) {
    this.dialogue = { speaker, text, until: this.time + seconds };
  }

  notify(text, seconds = 3.5) {
    this.notice = { text, until: this.time + seconds };
  }

  saveData() {
    return { money: this.money, offerIndex: this.offerIndex };
  }

  // ----------------------------------------------------------- crimes

  commitCrime(kind) {
    if (this.demo) return;
    const now = this.time;
    if (this.crimeTimers[kind] && now - this.crimeTimers[kind] < 1.2) return;
    this.crimeTimers[kind] = now;
    const before = this.wanted;
    this.heat += WANTED.crime[kind] || 4;
    this.updateWanted();
    if (this.wanted > before) this.events.push({ type: 'star' });
    // A crime near a witness resets the "unseen" clock only if police
    // are already close; fresh crimes are reported after a short lag.
    if (this.police.length) this.unseenTime = Math.min(this.unseenTime, 2.5);
  }

  updateWanted() {
    let stars = 0;
    for (let i = 1; i < WANTED.starHeat.length; i += 1) {
      if (this.heat >= WANTED.starHeat[i]) stars = i;
    }
    this.wanted = stars;
  }

  // --------------------------------------------------------- missions

  startMission(data) {
    this.mission = { data, stageIndex: 0, timer: null };
    this.say('VESPER MARLOWE', data.intro, 7);
    this.beginStage();
  }

  beginStage() {
    const stage = this.mission.data.stages[this.mission.stageIndex];
    this.mission.timer = stage.timer ?? null;
    if (stage.spice) {
      this.heat += WANTED.crime.missionSpice;
      this.updateWanted();
      this.events.push({ type: 'star' });
    }
    if (stage.kind === 'steal' || (stage.kind === 'reach' && this.mission.data.title === 'Loud Exit')) {
      const gold = stage.kind === 'steal';
      this.missionCar = this.makeCar(stage.x + 60, stage.y, -Math.PI / 2, gold ? '#e8c33c' : '#3fb0a5', 'mission');
      this.cars.push(this.missionCar);
    }
  }

  stageTarget() {
    if (this.mission) return this.mission.data.stages[this.mission.stageIndex];
    return null;
  }

  completeStage() {
    const m = this.mission;
    this.events.push({ type: 'pickup' });
    m.stageIndex += 1;
    if (m.stageIndex >= m.data.stages.length) {
      this.money += m.data.pay;
      this.events.push({ type: 'cash' });
      this.say('VESPER MARLOWE', `${m.data.outro}  (+$${m.data.pay})`, 6);
      this.notify(`Mission complete: ${m.data.title} — $${m.data.pay}`);
      this.mission = null;
      this.missionCar = null;
      this.offerIndex += 1;
      if (this.offer?.kind === 'job') this.jobCount += 1;
      this.offer = this.currentOffer();
    } else {
      this.notify('Objective updated');
      this.beginStage();
    }
  }

  failMission(reason) {
    this.say('VESPER MARLOWE', `${reason} The offer stands — come back to the Sail & Anchor and we try again.`, 6);
    this.notify(`Mission failed: ${this.mission.data.title}`);
    this.mission = null;
    this.missionCar = null;
  }

  /** The E key: start an offered job, or get in / out of a car. */
  tryInteract() {
    if (this.over) return;
    const p = this.player;
    if (p.car) {
      const car = p.car;
      p.car = null;
      this.drivenCar = null;
      car.kind = car.kind === 'mission' ? 'mission' : 'parked';
      car.speed = 0;
      this.cars.push(car);
      p.x = car.x + Math.cos(car.angle - Math.PI / 2) * 30;
      p.y = car.y + Math.sin(car.angle - Math.PI / 2) * 30;
      collideCircle(this.city, p, PLAYER.radius);
      this.events.push({ type: 'enter' });
      return;
    }
    // Nearest car wins over the job board when both are close.
    let best = null;
    let bestD = 52;
    for (const car of [...this.cars, ...this.police]) {
      if (car.health <= 0) continue;
      const d = dist(p, car);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      if (best.kind === 'traffic') this.commitCrime('stealCar');
      if (best.kind === 'police') { this.commitCrime('stealCar'); this.commitCrime('hitPolice'); }
      const idx = this.cars.indexOf(best);
      if (idx >= 0) this.cars.splice(idx, 1);
      const pIdx = this.police.indexOf(best);
      if (pIdx >= 0) this.police.splice(pIdx, 1);
      best.kind = 'player';
      p.car = best;
      this.drivenCar = best;
      this.events.push({ type: 'enter' });
      return;
    }
    if (!this.mission && dist(p, BAR) < 64) {
      this.startMission(this.offer.data);
    }
  }

  // -------------------------------------------------------------- step

  step(dt, control) {
    if (this.over) return;
    this.time += dt;
    if (!this.demo && Math.floor(this.time / 110) % 2 === 1) this.night = true;
    else if (!this.demo) this.night = false;

    this.stepPlayer(dt, control);
    this.stepTraffic(dt);
    this.stepPeds(dt);
    this.stepPolice(dt);
    this.stepWanted(dt);
    this.stepMission(dt);
    this.stepCarCollisions(dt);

    const focus = this.player.car ?? this.player;
    this.camX += (focus.x - this.camX) * Math.min(1, dt * 5);
    this.camY += (focus.y - this.camY) * Math.min(1, dt * 5);
  }

  stepPlayer(dt, control) {
    const p = this.player;
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);

    if (control.interact) this.tryInteract();

    if (p.car) {
      const car = p.car;
      const d = control.drive;
      const accel = d.throttle >= 0 ? CAR.accel : CAR.reverseAccel;
      car.speed += d.throttle * accel * dt;
      const drag = car.speed * (d.handbrake ? 1.6 : 0.55) * dt;
      car.speed -= drag;
      if (!d.throttle) car.speed -= car.speed * 0.8 * dt;
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
      if (Math.abs(car.speed) < 4 && !d.throttle) car.speed = 0;
      const speedRatio = Math.min(1, Math.abs(car.speed) / 130);
      const turn = d.handbrake ? CAR.handbrakeTurn : CAR.turnRate;
      car.angle += d.steer * turn * speedRatio * dt * (car.speed < 0 ? -1 : 1);
      car.skidding = Boolean(d.handbrake && Math.abs(car.speed) > 130 && d.steer !== 0);
      const before = Math.abs(car.speed);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const hit = collideCircle(this.city, car, CAR.radius);
      if (hit > 1.5 && before > 60) {
        const damage = (before - 60) / 22;
        car.health -= damage;
        if (before > 150) this.events.push({ type: 'crash' });
        this.events.push({ type: 'hit' });
        car.speed = -car.speed * 0.28;
        if (car.health <= 0) this.endRun('wasted');
      } else if (hit > 0) {
        car.speed *= 0.6;
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      return;
    }

    // On foot.
    const axis = control.move;
    const len = Math.hypot(axis.x, axis.y);
    const speed = control.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (len > 0.01) {
      p.vx = (axis.x / len) * speed;
      p.vy = (axis.y / len) * speed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle = Math.atan2(axis.y, axis.x);
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    collideCircle(this.city, p, PLAYER.radius);

    if (p.hurtTimer === 0 && this.wanted === 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + dt * 2.2);
    }

    if (control.fire) this.fireWeapon(dt, control);
  }

  fireWeapon(dt, control) {
    const p = this.player;
    if (p.fireCooldown > 0) return;
    const dx = control.aimX - p.x;
    const dy = control.aimY - p.y;
    const aimDist = Math.hypot(dx, dy);
    if (aimDist < 40) {
      // Close enough to shove instead: no bang, small effect.
      p.fireCooldown = 0.3;
      for (const ped of this.peds) {
        if (ped.state !== 'down' && Math.hypot(ped.x - p.x, ped.y - p.y) < 44) {
          ped.state = 'flee'; ped.timer = 2.5; ped.dangerX = p.x; ped.dangerY = p.y;
          this.commitCrime('hitPed');
        }
      }
      return;
    }
    p.fireCooldown = 0.24;
    p.angle = Math.atan2(dy, dx);
    this.events.push({ type: 'shot' });
    this.commitCrime('shotFired');
    this.muzzle = { x: p.x, y: p.y, angle: p.angle, until: this.time + 0.05 };
    for (const ped of this.peds) pedFleeFrom(ped, p.x, p.y, 190);

    const ux = dx / aimDist;
    const uy = dy / aimDist;
    let bestT = 430;
    let target = null;
    let targetKind = null;
    const testCircle = (obj, r, kind) => {
      const rx = obj.x - p.x;
      const ry = obj.y - p.y;
      const t = rx * ux + ry * uy;
      if (t < 0 || t > bestT) return;
      const perp = Math.abs(rx * uy - ry * ux);
      if (perp < r) { bestT = t; target = obj; targetKind = kind; }
    };
    for (const ped of this.peds) if (ped.state !== 'down') testCircle(ped, 13, 'ped');
    for (const car of this.cars) testCircle(car, 24, 'car');
    for (const cop of this.police) testCircle(cop, 24, 'police');
    // Buildings stop the bullet.
    for (const b of this.city.buildings) {
      for (let t = 20; t < bestT; t += 14) {
        const sx = p.x + ux * t;
        const sy = p.y + uy * t;
        if (sx > b.x && sx < b.x + b.w && sy > b.y && sy < b.y + b.h) { bestT = t; target = null; break; }
      }
      if (!target && bestT < 430) break;
    }
    if (!target) return;
    if (targetKind === 'ped') {
      target.state = 'down';
      target.timer = 7;
      this.commitCrime('hitPed');
      this.events.push({ type: 'hit' });
    } else {
      target.health -= targetKind === 'police' ? 20 : 13;
      this.events.push({ type: 'hit' });
      if (targetKind === 'police') this.commitCrime('hitPolice');
      if (target.health <= 0 && targetKind === 'police') target.smoke = 1;
    }
  }

  stepTraffic(dt) {
    const all = this.drivenCar ? [...this.cars, this.drivenCar] : this.cars;
    for (const car of this.cars) {
      if (car.kind !== 'traffic') continue;
      // Slow for whatever is ahead.
      let ahead = false;
      for (const other of all) {
        if (other === car) continue;
        const fx = car.x + Math.cos(car.angle) * 52;
        const fy = car.y + Math.sin(car.angle) * 52;
        if (Math.hypot(other.x - fx, other.y - fy) < 30) { ahead = true; break; }
      }
      if (!ahead && this.player.car) {
        const fx = car.x + Math.cos(car.angle) * 52;
        const fy = car.y + Math.sin(car.angle) * 52;
        if (Math.hypot(this.player.car.x - fx, this.player.car.y - fy) < 30) ahead = true;
      }
      const targetSpeed = ahead ? 0 : car.cruise;
      car.speed += Math.sign(targetSpeed - car.speed) * Math.min(Math.abs(targetSpeed - car.speed), 200 * dt);
      // Gridlock insurance: a car boxed in for a few seconds eases back
      // into its lane centre and rolls on, so jams dissolve instead of
      // freezing an intersection for the whole session.
      if (Math.abs(car.speed) < 8) {
        car.stuck = (car.stuck || 0) + dt;
        if (car.stuck > 2.5) {
          car.stuck = 0;
          if (car.axis === 'v') car.x = nearestRoadX(car.x) + (car.dir > 0 ? -23 : 23);
          else car.y = nearestRoadY(car.y) + (car.dir > 0 ? 23 : -23);
          car.speed = car.cruise * 0.6;
        }
      } else car.stuck = 0;

      if (car.axis === 'v') {
        car.y += car.dir * car.speed * dt;
        const laneX = nearestRoadX(car.x) + (car.dir > 0 ? -23 : 23);
        car.x += (laneX - car.x) * Math.min(1, dt * 3);
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const crossY = nearestRoadY(car.y);
        if (Math.abs(car.y - crossY) < 10 && Math.abs(car.x - nearestRoadX(car.x)) < 30 && this.rng.chance(0.006)) {
          car.axis = 'h';
          car.dir = this.rng.chance(0.5) ? 1 : -1;
        }
        if (car.y < 60) { car.dir = 1; }
        if (car.y > CITY.height - 190) { car.dir = -1; }
      } else {
        car.x += car.dir * car.speed * dt;
        const laneY = nearestRoadY(car.y) + (car.dir > 0 ? 23 : -23);
        car.y += (laneY - car.y) * Math.min(1, dt * 3);
        car.angle = car.dir > 0 ? 0 : Math.PI;
        const crossX = nearestRoadX(car.x);
        if (Math.abs(car.x - crossX) < 10 && Math.abs(car.y - nearestRoadY(car.y)) < 30 && this.rng.chance(0.006)) {
          car.axis = 'v';
          car.dir = this.rng.chance(0.5) ? 1 : -1;
        }
        if (car.x < 60) car.dir = 1;
        if (car.x > CITY.width - 60) car.dir = -1;
      }
      collideCircle(this.city, car, CAR.radius);
    }
  }

  stepPeds(dt) {
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) { ped.state = 'walk'; }
        continue;
      }
      if (ped.state === 'flee') {
        ped.timer -= dt;
        const dx = ped.x - ped.dangerX;
        const dy = ped.y - ped.dangerY;
        const d = Math.hypot(dx, dy) || 1;
        ped.x += (dx / d) * 150 * dt;
        ped.y += (dy / d) * 150 * dt;
        collideCircle(this.city, ped, 11);
        if (ped.timer <= 0) ped.state = 'walk';
        continue;
      }
      if (ped.axis === 'v') {
        ped.y += ped.dir * ped.speed * dt;
        const targetX = nearestRoadX(ped.x) + ped.side * 57;
        ped.x += (targetX - ped.x) * Math.min(1, dt * 2);
        const crossY = nearestRoadY(ped.y);
        if (Math.abs(ped.y - crossY) < 8 && this.rng.chance(0.004)) { ped.axis = 'h'; ped.dir = this.rng.chance(0.5) ? 1 : -1; }
        if (ped.y < 50) ped.dir = 1;
        if (ped.y > CITY.height - 200) ped.dir = -1;
      } else {
        ped.x += ped.dir * ped.speed * dt;
        const targetY = nearestRoadY(ped.y) + ped.side * 57;
        ped.y += (targetY - ped.y) * Math.min(1, dt * 2);
        const crossX = nearestRoadX(ped.x);
        if (Math.abs(ped.x - crossX) < 8 && this.rng.chance(0.004)) { ped.axis = 'v'; ped.dir = this.rng.chance(0.5) ? 1 : -1; }
        if (ped.x < 50) ped.dir = 1;
        if (ped.x > CITY.width - 50) ped.dir = -1;
      }
      // Cars are danger: step aside from a fast one bearing down.
      for (const car of this.cars) {
        if (Math.abs(car.speed) > 130 && Math.hypot(car.x - ped.x, car.y - ped.y) < 70) {
          pedFleeFrom(ped, car.x, car.y, 70);
        }
      }
    }
  }

  stepPolice(dt) {
    if (this.demo) return;
    // Spawn / despawn to match the wanted level.
    const desired = this.wanted;
    if (this.police.length < desired) {
      this.spawnTimer = (this.spawnTimer || 0) - dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 1.6;
        const col = this.rng.int(0, CITY.cols);
        const row = this.rng.int(0, CITY.rows);
        const x = roadCenterX(col);
        const y = roadCenterY(row);
        if (Math.hypot(x - this.player.x, y - this.player.y) > 520) {
          const cop = this.makeCar(x, y, 0, '#e8ecf2', 'police');
          this.police.push(cop);
        }
      }
    } else if (this.police.length > desired) {
      let far = null;
      let farD = 850;
      for (const cop of this.police) {
        const d = dist(cop, this.player);
        if (d > farD) { farD = d; far = cop; }
      }
      if (far) this.police.splice(this.police.indexOf(far), 1);
    }

    let anySee = false;
    for (const cop of this.police) {
      if (cop.health <= 0) { cop.speed = 0; continue; }
      const target = this.player;
      const d = dist(cop, target);
      if (d < POLICE.sightRange) anySee = true;
      const desiredAngle = Math.atan2(target.y - cop.y, target.x - cop.x);
      const diff = angleWrap(desiredAngle - cop.angle);
      cop.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 3 * dt + Math.sign(diff) * 0.4 * dt));
      const want = d > 90 ? POLICE.maxSpeed : Math.max(60, d * 1.4);
      cop.speed += Math.sign(want - cop.speed) * Math.min(Math.abs(want - cop.speed), POLICE.accel * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      const hit = collideCircle(this.city, cop, CAR.radius);
      if (hit > 1) cop.speed *= 0.45;
    }
    if (anySee) this.unseenTime = 0;

    // The bust meter: pinned and slow with an officer on top of you.
    const p = this.player;
    const playerSpeed = p.car ? Math.abs(p.car.speed) : Math.hypot(p.vx, p.vy);
    let pinned = false;
    if (this.wanted > 0) {
      for (const cop of this.police) {
        if (cop.health > 0 && dist(cop, p) < POLICE.bustRadius && playerSpeed < 55) pinned = true;
      }
    }
    if (pinned) {
      this.bustMeter += dt / POLICE.bustSeconds;
      if (this.bustMeter >= 1) this.endRun('busted');
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.7);
    }
  }

  stepWanted(dt) {
    this.unseenTime += dt;
    if (!this.demo && this.unseenTime > WANTED.decayDelay && this.heat > 0) {
      this.heat = Math.max(0, this.heat - WANTED.decayRate * dt);
      this.updateWanted();
    }
  }

  stepMission(dt) {
    if (!this.mission) return;
    const m = this.mission;
    if (m.timer !== null) {
      m.timer -= dt;
      if (m.timer <= 0) { this.failMission('Too slow — the buyer walked.'); return; }
    }
    const stage = m.data.stages[m.stageIndex];
    const p = this.player;
    if (stage.kind === 'steal') {
      if (p.car && p.car === this.missionCar) this.completeStage();
      return;
    }
    if (stage.kind === 'escape') {
      if (this.wanted === 0 && dist(p, stage) < 52) this.completeStage();
      return;
    }
    if (dist(p, stage) < 48) this.completeStage();
  }

  stepCarCollisions(dt) {
    const movers = [];
    if (this.player.car) movers.push(this.player.car);
    for (const c of this.cars) if (c.kind === 'traffic' || c === this.missionCar) movers.push(c);
    for (const cop of this.police) movers.push(cop);
    const all = [...this.cars, ...this.police];
    if (this.player.car && !all.includes(this.player.car)) all.push(this.player.car);

    for (const a of movers) {
      for (const b of all) {
        if (a === b) continue;
        const d = dist(a, b);
        if (d > 0.01 && d < CAR.radius * 2 - 2) {
          const rel = Math.abs(a.speed) + Math.abs(b.speed) * 0.4;
          const push = (CAR.radius * 2 - 2 - d) / 2;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          a.x -= ux * push; a.y -= uy * push;
          if (b.kind !== 'parked' || true) { b.x += ux * push; b.y += uy * push; }
          if (rel > 90) {
            const dmg = (rel - 90) / 26;
            a.health -= dmg * 0.6;
            b.health -= dmg;
            if (a.hitCooldown <= 0) {
              this.events.push({ type: 'crash' });
              a.hitCooldown = 0.4;
              if (a === this.player.car) {
                this.commitCrime(b.kind === 'police' ? 'hitPolice' : 'hitCar');
              }
            }
          }
          if (b.kind === 'parked') b.kind = 'traffic-hit';
          a.speed *= 0.55;
          if (b.kind === 'traffic') b.speed *= 0.4;
        }
      }
      a.hitCooldown = Math.max(0, a.hitCooldown - dt);
    }

    // Cars versus pedestrians and the on-foot player.
    for (const car of all) {
      if (Math.abs(car.speed) < 26) continue;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 30) {
          ped.state = 'down';
          ped.timer = 8;
          this.events.push({ type: 'hit' });
          if (car === this.player.car || car.kind === 'player') this.commitCrime('hitPed');
        }
      }
      const p = this.player;
      if (!p.car && Math.hypot(p.x - car.x, p.y - car.y) < 32) {
        const dmg = Math.min(38, Math.abs(car.speed) / 11);
        p.health -= dmg;
        p.hurtTimer = 5;
        p.x += Math.cos(car.angle) * 26;
        p.y += Math.sin(car.angle) * 26;
        this.events.push({ type: 'crash' });
        if (p.health <= 0) this.endRun('wasted');
      }
    }
  }

  endRun(kind) {
    if (this.over) return;
    this.over = true;
    this.endKind = kind;
    this.events.push({ type: kind });
  }
}

function pedFleeFrom(ped, x, y, range) {
  if (ped.state === 'down') return;
  if (Math.hypot(ped.x - x, ped.y - y) < range) {
    ped.state = 'flee';
    ped.timer = Math.max(ped.timer || 0, 2.2);
    ped.dangerX = x;
    ped.dangerY = y;
  }
}

// ------------------------------------------------------------ autopilots
// Used by the title demo and the screenshot staging: they read the
// world and answer with the same control object a player produces.

export function emptyControl() {
  return {
    move: { x: 0, y: 0 }, run: false,
    drive: { throttle: 0, steer: 0, handbrake: false },
    interact: false, fire: false, aimX: 0, aimY: 0,
  };
}

export function autopilotControl(world) {
  const control = emptyControl();
  const p = world.player;
  const target = world.stageTarget() || (world.mission ? null : { x: BAR.x, y: BAR.y });
  const goal = target || { x: world.city.width / 2, y: world.city.height / 2 };

  if (p.car) {
    const diff = angleWrap(Math.atan2(goal.y - p.car.y, goal.x - p.car.x) - p.car.angle);
    control.drive.steer = Math.max(-1, Math.min(1, diff * 2.2));
    control.drive.throttle = Math.abs(diff) > 2.5 ? -0.7 : 1;
    control.drive.handbrake = Math.abs(diff) > 1.15 && Math.abs(p.car.speed) > 200;
    // Unstuck routine: nosed into a wall at walking pace, reverse out
    // with opposite lock for a beat, then carry on.
    if (Math.abs(p.car.speed) < 22) world._stuckT = (world._stuckT || 0) + 1 / 60;
    else world._stuckT = 0;
    if (world._stuckT > 0.8) {
      world._reverseT = 0.9;
      world._stuckT = 0;
    }
    if (world._reverseT > 0) {
      world._reverseT -= 1 / 60;
      control.drive.throttle = -1;
      control.drive.steer = -control.drive.steer;
      control.drive.handbrake = false;
    }
    control.aimX = goal.x; control.aimY = goal.y;
    return control;
  }
  // On foot: head for the goal; if a stage wants a car, take the nearest.
  let dest = goal;
  const stage = world.stageTarget();
  if (!stage && !world.mission) dest = { x: BAR.x, y: BAR.y };
  const dx = dest.x - p.x;
  const dy = dest.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 14) {
    control.move = { x: dx / d, y: dy / d };
    control.run = d > 200;
  }
  control.aimX = dest.x; control.aimY = dest.y;
  // Start the offered job when standing at the bar.
  if (!world.mission && Math.hypot(p.x - BAR.x, p.y - BAR.y) < 58 && world.time > 1) {
    control.interact = true;
  }
  return control;
}

/** A joyrider for the chase scene: fast, sloppy, and drawn to the goal. */
export function recklessControl(world) {
  const control = autopilotControl(world);
  if (world.player.car) {
    control.drive.throttle = 1;
    control.drive.handbrake = Math.abs(control.drive.steer) > 0.75 && Math.abs(world.player.car.speed) > 240;
  }
  return control;
}

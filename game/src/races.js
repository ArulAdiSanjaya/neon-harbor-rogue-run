// Street races: four illegal circuits run from the marina gate.
//
//   Harbor Loop — 4 checkpoints, prize $150
//   Downtown Sprint — 5 checkpoints, prize $250
//   Marina Grand Tour — 6 checkpoints, prize $400
//   Night Market Run — 5 checkpoints, prize $300
//
// Every checkpoint sits on a road centre and consecutive checkpoints
// share one road, so each leg is a straight drive down a street with
// a turn at the end — a circuit a player can actually race, not a
// diagonal cut through buildings. The state machine is
// idle → countdown (3-2-1-GO) → racing → finished, and two rival cars
// run the same checkpoint route on the road grid (Manhattan routing:
// along one road, then the next), so the live position — 1st/2nd/3rd
// by checkpoints passed, then distance to the next one — is a real
// contest. Winning pays the prize; 2nd pays half, 3rd a quarter.
// Best times persist per circuit in the save.
//
// This file owns the circuits, the state machine and the rivals.
// world.js owns the wiring: it starts a race from the gate in
// tryInteract, steps it, adds the prize and the heat, and tells
// stepMission when a race finished first.

import { RACE } from './config.js';
import { RACE_GATE, roadCenterX, roadCenterY } from './city.js';

// Checkpoint lists as [col, row] grid points, turned into road
// centres below. Legs are axis-aligned on purpose (see header) and
// every circuit opens EAST along the waterfront road from the gate,
// so a car lined up at the gate faces its first checkpoint.
const CIRCUIT_POINTS = {
  harbor: [[5, 4], [6, 4], [6, 2], [4, 2]],
  downtown: [[5, 4], [6, 4], [6, 1], [3, 1], [0, 1]],
  marina: [[5, 4], [6, 4], [6, 2], [4, 2], [2, 2], [0, 2]],
  // Night Market Run: east along the waterfront, north up the far
  // east road, then a long west run past the night market stalls
  // on row 3 — the only circuit that finishes heading west.
  nightmarket: [[5, 4], [6, 4], [6, 3], [3, 3], [0, 3]],
};

export const RACE_DEFS = [
  {
    id: 'harbor',
    name: 'Harbor Loop',
    prize: RACE.prizes.harbor,
    checkpoints: CIRCUIT_POINTS.harbor.map(([c, r]) => ({ x: roadCenterX(c), y: roadCenterY(r) })),
  },
  {
    id: 'downtown',
    name: 'Downtown Sprint',
    prize: RACE.prizes.downtown,
    checkpoints: CIRCUIT_POINTS.downtown.map(([c, r]) => ({ x: roadCenterX(c), y: roadCenterY(r) })),
  },
  {
    id: 'marina',
    name: 'Marina Grand Tour',
    prize: RACE.prizes.marina,
    checkpoints: CIRCUIT_POINTS.marina.map(([c, r]) => ({ x: roadCenterX(c), y: roadCenterY(r) })),
  },
  {
    id: 'nightmarket',
    name: 'Night Market Run',
    prize: RACE.prizes.nightmarket,
    checkpoints: CIRCUIT_POINTS.nightmarket.map(([c, r]) => ({ x: roadCenterX(c), y: roadCenterY(r) })),
  },
];

export function raceDef(id) {
  return RACE_DEFS.find((d) => d.id === id) || RACE_DEFS[0];
}

const PLACE_NAMES = ['1st', '2nd', '3rd'];
const RIVAL_COLORS = ['#d06ba8', '#7ac74f'];

export class RaceSystem {
  constructor() {
    this.state = 'idle'; // 'idle' | 'countdown' | 'racing' | 'finished'
    this.circuitIndex = 0; // next circuit the gate offers
    this.circuit = null;
    this.checkpointIndex = 0;
    this.elapsed = 0;
    this.countdownT = 0;
    this.countdownShown = -1;
    this.rivals = []; // { x, y, angle, speed, checkpointIndex, color }
    this.position = 3;
    this.wrongWay = false;
    this.wrongWayT = 0;
    this.prevDist = Infinity;
    this.bestTimes = { harbor: null, downtown: null, marina: null, nightmarket: null };
    this.history = []; // newest first, capped at 8 finishes
    this.lastResult = null; // { circuitId, place, time, prize, isBest }
    this.finishSeq = 0; // increments on every finish (missions watch it)
    this.pendingPrize = 0; // world collects and pays this once
    this.bannerUntil = 0; // world time until the finish banner hides
    this.startX = 0;
    this.startY = 0;
  }

  // ------------------------------------------------------------ queries

  get nextCircuit() {
    return RACE_DEFS[this.circuitIndex % RACE_DEFS.length];
  }

  get nextCheckpoint() {
    if (!this.circuit) return null;
    return this.circuit.checkpoints[this.checkpointIndex] || null;
  }

  get active() {
    return this.state === 'countdown' || this.state === 'racing';
  }

  get checkpointCount() {
    return this.circuit ? this.circuit.checkpoints.length : 0;
  }

  /** Seconds formatted m:ss.t for the HUD and the banner. */
  static formatTime(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--:--.-';
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }

  /** Best time for one circuit, or null if it has never been run. */
  bestTimeFor(circuitId) {
    return this.bestTimes[circuitId] ?? null;
  }

  /** The last few finishes, newest first — the player's race record. */
  recentResults(limit = 5) {
    return this.history.slice(0, limit);
  }

  /** How many races the player has finished, all circuits together. */
  get racesRun() {
    return this.history.length;
  }

  /**
   * Harbor Heist League: a proven wheelman moves goods for more.
   * Each circuit win is worth 2% on a fence payout, capped at 10%
   * — the fence pays for a driver the watch never catches.
   */
  getawayBonus() {
    const wins = this.history.filter((r) => r.place === 1).length;
    return Math.min(0.1, 0.02 * wins);
  }

  // -------------------------------------------------------------- start

  /**
   * Start the next circuit from the gate. The player car lines up
   * at the gate; rivals queue behind it. Returns the circuit def.
   */
  startNext(gateX, gateY) {
    return this.start(this.circuitIndex % RACE_DEFS.length, gateX, gateY);
  }

  start(index, gateX, gateY) {
    const def = RACE_DEFS[index % RACE_DEFS.length];
    this.circuit = def;
    this.circuitIndex = index % RACE_DEFS.length;
    this.checkpointIndex = 0;
    this.elapsed = 0;
    this.countdownT = RACE.countdownSeconds;
    this.countdownShown = -1;
    this.state = 'countdown';
    this.position = 3;
    this.wrongWay = false;
    this.wrongWayT = 0;
    this.prevDist = Infinity;
    this.lastResult = null;
    this.pendingPrize = 0;
    this.startX = gateX;
    this.startY = gateY;
    // Rivals queue behind the gate on the waterfront road, facing
    // the first checkpoint, so the start reads as a grid line-up.
    this.rivals = [0, 1].map((i) => ({
      x: gateX - 70 - i * 62,
      y: gateY + (i === 0 ? -24 : 24),
      angle: 0,
      speed: 0,
      checkpointIndex: 0,
      color: RIVAL_COLORS[i],
    }));
    return def;
  }

  abort() {
    if (this.state === 'idle') return;
    this.state = 'idle';
    this.circuit = null;
    this.rivals = [];
    this.wrongWay = false;
  }

  // -------------------------------------------------------------- step

  /**
   * Step the race. `world` is read for the player position and
   * written for heat (racing is illegal) and events (countdown
   * beeps, checkpoint chimes, the win arpeggio).
   */
  update(dt, world) {
    if (this.state === 'idle' || this.state === 'finished') return;
    const p = world.player;

    if (this.state === 'countdown') {
      const shown = Math.ceil(this.countdownT);
      if (shown !== this.countdownShown) {
        this.countdownShown = shown;
        world.events.push({ type: 'raceCountdown', count: shown });
      }
      this.countdownT -= dt;
      if (this.countdownT <= 0) {
        this.state = 'racing';
        this.elapsed = 0;
        world.events.push({ type: 'raceGo' });
        this.prevDist = this.distToNext(p);
      }
      return;
    }

    // Racing: the clock runs, the heat climbs, rivals drive on.
    this.elapsed += dt;
    world.heat += RACE.heatPerSecond * dt;
    world.updateWanted();
    this.stepRivals(dt);
    this.updatePosition(p);

    const cp = this.nextCheckpoint;
    if (!cp) return;
    const d = Math.hypot(p.x - cp.x, p.y - cp.y);
    if (d < RACE.checkpointRadius) {
      this.checkpointIndex += 1;
      this.wrongWay = false;
      this.wrongWayT = 0;
      world.events.push({ type: 'raceCheckpoint' });
      if (this.checkpointIndex >= this.circuit.checkpoints.length) {
        this.finish(world);
        return;
      }
      this.prevDist = this.distToNext(p);
    } else {
      // Wrong-way: the next checkpoint has been getting further
      // away for a sustained beat while the player is moving.
      const speed = p.car ? Math.abs(p.car.speed) : Math.hypot(p.vx, p.vy);
      if (speed > 60 && d > this.prevDist + 2) {
        this.wrongWayT += dt;
        if (this.wrongWayT > 1.2) this.wrongWay = true;
      } else {
        this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2);
        if (this.wrongWayT === 0) this.wrongWay = false;
      }
      this.prevDist = d;
    }
  }

  distToNext(p) {
    const cp = this.nextCheckpoint;
    if (!cp) return 0;
    return Math.hypot(p.x - cp.x, p.y - cp.y);
  }

  /** Live position by checkpoints passed, then distance to next. */
  updatePosition(p) {
    let ahead = 0;
    for (const rival of this.rivals) {
      if (rival.checkpointIndex > this.checkpointIndex) ahead += 1;
      else if (rival.checkpointIndex === this.checkpointIndex) {
        const cp = this.nextCheckpoint;
        if (cp) {
          const rd = Math.hypot(rival.x - cp.x, rival.y - cp.y);
          if (rd < this.distToNext(p) - 5) ahead += 1;
        }
      }
    }
    this.position = Math.min(3, ahead + 1);
  }

  // ------------------------------------------------------------- rivals

  /**
   * Rivals drive the checkpoint route on the road grid: along the
   * current road toward the checkpoint's column (or row), then turn
   * onto the next leg. A rival behind the player pushes a little
   * harder (catch-up), one ahead cruises — the race stays a contest
   * without ever being scripted to win.
   */
  stepRivals(dt) {
    for (const rival of this.rivals) {
      const cp = this.circuit.checkpoints[rival.checkpointIndex];
      if (!cp) { rival.speed = Math.max(0, rival.speed - 300 * dt); continue; }
      const dx = cp.x - rival.x;
      const dy = cp.y - rival.y;
      const d = Math.hypot(dx, dy);
      if (d < RACE.checkpointRadius) {
        rival.checkpointIndex += 1;
        continue;
      }
      const behind = rival.checkpointIndex < this.checkpointIndex
        || (rival.checkpointIndex === this.checkpointIndex && this.state === 'racing');
      const targetSpeed = behind ? RACE.rivalCatchup : RACE.rivalSpeed;
      rival.speed += Math.sign(targetSpeed - rival.speed) * Math.min(Math.abs(targetSpeed - rival.speed), 320 * dt);
      // Manhattan routing: close the bigger axis first, so the rival
      // stays on roads instead of cutting through buildings.
      let tx;
      let ty;
      if (Math.abs(dx) > 48) { tx = rival.x + Math.sign(dx) * 100; ty = rival.y; }
      else { tx = rival.x; ty = rival.y + Math.sign(dy) * 100; }
      const want = Math.atan2(ty - rival.y, tx - rival.x);
      let diff = want - rival.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rival.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 5 * dt));
      rival.x += Math.cos(rival.angle) * rival.speed * dt;
      rival.y += Math.sin(rival.angle) * rival.speed * dt;
    }
  }

  // ------------------------------------------------------------- finish

  finish(world) {
    this.updatePosition(world.player);
    const place = this.position;
    const time = this.elapsed;
    const circuitId = this.circuit.id;
    const prevBest = this.bestTimes[circuitId];
    const isBest = prevBest === null || time < prevBest;
    if (isBest) this.bestTimes[circuitId] = time;
    const share = place === 1 ? 1 : place === 2 ? RACE.secondPlaceShare : RACE.thirdPlaceShare;
    const prize = Math.round(this.circuit.prize * share);
    this.pendingPrize = prize;
    this.lastResult = { circuitId, place, time, prize, isBest, name: this.circuit.name };
    this.history.unshift({ ...this.lastResult });
    if (this.history.length > 8) this.history.length = 8;
    this.finishSeq += 1;
    this.bannerUntil = world.time + 6;
    this.state = 'finished';
    this.circuitIndex = (this.circuitIndex + 1) % RACE_DEFS.length;
    this.rivals = [];
    if (place === 1) world.events.push({ type: 'raceWin' });
    else world.events.push({ type: 'raceCheckpoint' });
  }

  // -------------------------------------------------------------- save

  serialize() {
    return {
      bestTimes: { ...this.bestTimes },
      circuitIndex: this.circuitIndex,
      history: this.history.slice(0, 8),
    };
  }

  load(data) {
    if (!data || typeof data !== 'object') return;
    if (data.bestTimes) {
      for (const def of RACE_DEFS) {
        const t = Number(data.bestTimes[def.id]);
        if (Number.isFinite(t) && t > 0) this.bestTimes[def.id] = t;
      }
    }
    if (Array.isArray(data.history)) {
      this.history = data.history
        .filter((r) => r && RACE_DEFS.some((d) => d.id === r.circuitId) && Number.isFinite(Number(r.time)))
        .slice(0, 8)
        .map((r) => ({ circuitId: r.circuitId, place: r.place, time: Number(r.time), prize: Number(r.prize) || 0, isBest: Boolean(r.isBest), name: raceDef(r.circuitId).name }));
    }
    if (Number.isFinite(Number(data.circuitIndex))) {
      this.circuitIndex = Math.abs(Math.floor(Number(data.circuitIndex))) % RACE_DEFS.length;
    }
  }
}

export { RACE_GATE };

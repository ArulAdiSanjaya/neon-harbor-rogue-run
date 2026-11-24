// Harbor Heist League — the multi-stage heist system for Neon Harbor.
//
// Six heists, each in four acts: CASE the target, GRAB the goods,
// drive the GETAWAY against a clock, then FENCE the loot at a buyer.
// A heist is planned on the board at the old warehouse on the
// south-west road (press J nearby, or E on foot): the board shows
// which heists the League has unlocked, the crew roles the hired
// specialists fill, and the fence buyers waiting in the city. Crew
// roles matter — a hired driver stretches the getaway clock, a
// lookout cools the grab heat, muscle shortens the grab and lifts
// the take — and the rival Gull Kings notice every success, so the
// heat keeps climbing as the League's reputation grows. Loot is only
// money once it is fenced: get busted or wasted mid-heist and the
// goods are gone with the run.
//
// This file owns the league state machine; the fence buyers and
// getaway math live in heistjobs.js, the chain story and ranks in
// heistchain.js, the rival crew in heistrival.js, and all drawing in
// heistui.js. world.js steps it once per fixed step and pays out
// through pendingPayout, the same way cab fares pay out.

import { HEIST } from './config.js';
import { FENCE_SPOTS, HEIST_BOARD, roadCenterX, roadCenterY } from './city.js';
import { LEAGUE_ABANDON_LINES, LEAGUE_BRIEFINGS, LEAGUE_STAGE_LINES, leagueRank } from './heistchain.js';
import { bestFenceOffer, casingWaypoints, getawayRing } from './heistjobs.js';

export const LEAGUE_FIXER = 'THE BROKER — heist league fixer';

// ------------------------------------------------------------------ defs
//
// A heist def is the plan on the board: where to case, where to
// grab, where the getaway ring sits, what the goods are worth, how
// much heat the grab draws, how long the getaway clock runs, and
// what the League pays in reputation for pulling it off. The chain
// unlocks in order — each heist opens when the one before it is
// fenced — so the finale only shows for a crew that earned it.

export const HEIST_DEFS = [
  {
    id: 'dockside-smash',
    name: 'Dockside Smash',
    target: 'Dock shed, south-west corner',
    goods: 'Crates of smuggled synth-glass',
    loot: 400,
    rep: 100,
    grabHeat: 6,
    getawaySeconds: 50,
    case: { x: roadCenterX(0), y: roadCenterY(4), hold: 5 },
    grab: { x: roadCenterX(0), y: roadCenterY(4), hold: 4 },
    getaway: { x: roadCenterX(5), y: roadCenterY(0) },
  },
  {
    id: 'neon-vault',
    name: 'Neon Vault',
    target: 'Sign shop vault, midtown',
    goods: 'A week of neon-sign takings',
    loot: 900,
    rep: 200,
    grabHeat: 9,
    getawaySeconds: 55,
    case: { x: roadCenterX(2), y: roadCenterY(1), hold: 5 },
    grab: { x: roadCenterX(2), y: roadCenterY(1), hold: 4 },
    getaway: { x: roadCenterX(0), y: roadCenterY(0) },
  },
  {
    id: 'marina-yacht',
    name: 'Marina Yacht Lift',
    target: 'The white yacht at the marina',
    goods: 'Yacht safe: chips and a gold watch',
    loot: 1400,
    rep: 300,
    grabHeat: 12,
    getawaySeconds: 60,
    case: { x: roadCenterX(4), y: roadCenterY(4), hold: 6 },
    grab: { x: roadCenterX(4), y: roadCenterY(4), hold: 4 },
    getaway: { x: roadCenterX(1), y: roadCenterY(0) },
  },
  {
    id: 'tower-penthouse',
    name: 'Tower Penthouse',
    target: 'Penthouse, north-east towers',
    goods: 'Penthouse art and a crypto wallet',
    loot: 2200,
    rep: 400,
    grabHeat: 16,
    getawaySeconds: 65,
    case: { x: roadCenterX(5), y: roadCenterY(0), hold: 6 },
    grab: { x: roadCenterX(5), y: roadCenterY(0), hold: 5 },
    getaway: { x: roadCenterX(0), y: roadCenterY(4) },
  },
  {
    id: 'harbor-vault',
    name: 'Harbor Vault',
    target: 'Harbourmaster vault, central pier',
    goods: 'Harbourmaster strongbox: bonds',
    loot: 3500,
    rep: 550,
    grabHeat: 20,
    getawaySeconds: 70,
    case: { x: roadCenterX(3), y: roadCenterY(2), hold: 6 },
    grab: { x: roadCenterX(3), y: roadCenterY(2), hold: 5 },
    getaway: { x: roadCenterX(6), y: roadCenterY(4) },
  },
  {
    id: 'golden-tide',
    name: 'Golden Tide',
    target: 'The Golden Tide casino boat',
    goods: 'The casino boat float: everything',
    loot: 6000,
    rep: 800,
    grabHeat: 26,
    getawaySeconds: 80,
    case: { x: roadCenterX(1), y: roadCenterY(3), hold: 7 },
    grab: { x: roadCenterX(1), y: roadCenterY(3), hold: 5 },
    getaway: { x: roadCenterX(5), y: roadCenterY(4) },
  },
];

export function heistDef(id) {
  return HEIST_DEFS.find((d) => d.id === id) || null;
}

// Crew roles on the board. Each role is filled, when possible, by
// the hired specialist who fits it best; an empty role simply pays
// no bonus, so a solo runner can still run every heist.
export const HEIST_ROLES = [
  { slot: 'driver', label: 'Driver', member: 'lena', blurb: '+25% getaway clock' },
  { slot: 'lookout', label: 'Lookout', member: 'jax', blurb: '−20% grab heat' },
  { slot: 'muscle', label: 'Muscle', member: 'marcus', blurb: '−30% grab time, +10% take' },
];

const STAGE_LABELS = {
  case: 'CASE the target',
  grab: 'GRAB the goods',
  getaway: 'GETAWAY — reach the ring',
  fence: 'FENCE the loot',
};

// ------------------------------------------------------------------ system

export class HeistSystem {
  constructor() {
    this.completed = []; // heist ids fenced, in order
    this.rep = 0; // league reputation
    this.active = null; // { def, stageIndex, holdT, getawayT, ring, loot, clean }
    this.lootHeld = 0; // value of the goods in hand, $0 until fenced
    this.selected = 0; // board selection, index into HEIST_DEFS
    this.boardOpen = false; // set by world.tryInteract; main.js polls it
    this.pendingPayout = 0; // paid once by world.stepHeist
    this.stats = { heists: 0, fenced: 0, cleanGetaways: 0, bestTake: 0, failed: 0 };
  }

  // ------------------------------------------------------------- board

  isUnlocked(def) {
    const idx = HEIST_DEFS.indexOf(def);
    if (idx <= 0) return true;
    return this.completed.includes(HEIST_DEFS[idx - 1].id);
  }

  isCompleted(def) {
    return this.completed.includes(def.id);
  }

  selectedDef() {
    return HEIST_DEFS[Math.max(0, Math.min(HEIST_DEFS.length - 1, this.selected))];
  }

  selectHeist(index) {
    this.selected = Math.max(0, Math.min(HEIST_DEFS.length - 1, index));
  }

  rank() {
    return leagueRank(this.rep);
  }

  /** Roles the hired crew fills, by best fit: driver Lena, lookout Jax, muscle Marcus. */
  crewRoles(world) {
    const roles = {};
    for (const role of HEIST_ROLES) {
      roles[role.slot] = world.crew.isHired(role.member) ? role.member : null;
    }
    return roles;
  }

  roleBonus(world, slot) {
    const roles = this.crewRoles(world);
    if (!roles[slot]) return 0;
    if (slot === 'driver') return 0.25 + 0.05 * world.crew.driverLevel();
    if (slot === 'lookout') return 0.2 + 0.04 * world.crew.mechanicLevel();
    if (slot === 'muscle') return 0.1 + 0.02 * world.crew.shooterLevel();
    return 0;
  }

  grabHoldSeconds(world, def) {
    const base = def.grab.hold;
    const roles = this.crewRoles(world);
    return roles.muscle ? base * 0.7 : base;
  }

  getawaySeconds(world, def) {
    return def.getawaySeconds * (1 + this.roleBonus(world, 'driver'));
  }

  // ------------------------------------------------------------ places

  nearBoard(x, y) {
    return Math.hypot(x - HEIST_BOARD.x, y - HEIST_BOARD.y) < HEIST_BOARD.radius;
  }

  nearestFence(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const spot of FENCE_SPOTS) {
      const d = Math.hypot(x - spot.x, y - spot.y);
      if (d < bestD) { bestD = d; best = spot; }
    }
    return bestD < HEIST.fenceRadius ? best : null;
  }

  // ------------------------------------------------------------- start

  /** Start the selected heist from the board. Returns false with a notice when it cannot start. */
  startSelected(world) {
    const def = this.selectedDef();
    if (this.active) {
      world.notify(`Already running ${this.active.def.name} — fence it or fail it first`);
      return false;
    }
    if (!this.isUnlocked(def)) {
      world.notify(`${def.name} is locked — fence ${HEIST_DEFS[HEIST_DEFS.indexOf(def) - 1].name} first`);
      return false;
    }
    if (this.isCompleted(def)) {
      world.notify(`${def.name} is already fenced — the League only pays once per job`);
      return false;
    }
    return this.startHeist(world, def.id);
  }

  startHeist(world, id) {
    const def = heistDef(id);
    if (!def || this.active) return false;
    // Prep money: a heist costs an eighth of its take up front —
    // the Broker's cut for the plan, the lookouts and the clean car.
    const prep = Math.round(def.loot / 8);
    if (world.money < prep) {
      world.notify(`${def.name} needs $${prep} in prep money — you have $${world.money}`);
      return false;
    }
    world.money -= prep;
    const ring = getawayRing(def, world.rng);
    this.active = {
      def,
      stageIndex: 0,
      holdT: 0,
      getawayT: this.getawaySeconds(world, def),
      ring,
      loot: def.loot,
      clean: true,
      casePoints: casingWaypoints({ x: def.case.x, y: def.case.y }, world.rng),
      caseIndex: 0,
    };
    this.lootHeld = 0;
    const brief = LEAGUE_BRIEFINGS[id];
    world.events.push({ type: 'heistPlan' });
    world.say(LEAGUE_FIXER, brief ? brief.intro : `${def.name}: case it, grab it, drive it, fence it.`, 7);
    world.notify(`${def.name} — ${def.target}. ${STAGE_LABELS.case} first`);
    return true;
  }

  stageKind() {
    if (!this.active) return null;
    const kinds = ['case', 'grab', 'getaway', 'fence'];
    return kinds[this.active.stageIndex] || null;
  }

  stageTarget() {
    if (!this.active) return null;
    const { def } = this.active;
    const kind = this.stageKind();
    if (kind === 'case') {
      // Casing walks three road-snapped waypoints around the
      // target, in order — the current one is the live ring.
      const pt = this.active.casePoints[this.active.caseIndex]
        || { x: def.case.x, y: def.case.y };
      return { x: pt.x, y: pt.y };
    }
    if (kind === 'grab') return { x: def.grab.x, y: def.grab.y };
    if (kind === 'getaway') return { x: this.active.ring.x, y: this.active.ring.y };
    if (kind === 'fence') {
      const p = this.active.fenceSpot || FENCE_SPOTS[0];
      return { x: p.x, y: p.y };
    }
    return null;
  }

  stageLabel() {
    if (!this.active) return '';
    if (this.stageKind() === 'case') {
      return `CASE the target (${this.active.caseIndex + 1}/${this.active.casePoints.length})`;
    }
    return STAGE_LABELS[this.stageKind()] || '';
  }

  /** The Broker's line for the stage just entered, if there is one. */
  sayStage(world, kind) {
    if (!this.active) return;
    const lines = LEAGUE_STAGE_LINES[this.active.def.id];
    if (lines && lines[kind]) world.say(LEAGUE_FIXER, lines[kind], 6);
  }

  // ------------------------------------------------------------- update

  /** One fixed step of the active heist: hold timers on case/grab, the getaway clock, the fence wait. */
  update(dt, world) {
    if (!this.active) return;
    const a = this.active;
    const kind = this.stageKind();
    const p = world.player;
    if (kind === 'case') {
      // Casing walks the waypoints in order, two seconds at each:
      // stepping out bleeds the hold, like the grab's patience rule.
      const target = this.stageTarget();
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d < HEIST.stageRadius) {
        a.holdT += dt;
        if (a.holdT >= HEIST.caseHoldSeconds) {
          a.holdT = 0;
          a.caseIndex += 1;
          if (a.caseIndex >= a.casePoints.length) this.completeStage(world);
          else world.notify(`Cased ${a.caseIndex}/${a.casePoints.length} — next point marked`);
        }
      } else {
        a.holdT = Math.max(0, a.holdT - dt * 2);
      }
      return;
    }
    if (kind === 'grab') {
      const target = a.def.grab;
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d < HEIST.stageRadius) {
        a.holdT += dt;
        if (a.holdT >= this.grabHoldSeconds(world, a.def)) this.completeStage(world);
      } else {
        // Stepping out resets the hold — casing takes patience.
        a.holdT = Math.max(0, a.holdT - dt * 2);
      }
      return;
    }
    if (kind === 'getaway') {
      a.getawayT -= dt;
      const d = Math.hypot(p.x - a.ring.x, p.y - a.ring.y);
      if (d < HEIST.stageRadius && p.car) {
        if (a.getawayT > 0) {
          this.stats.cleanGetaways += 1;
          world.notify('Clean getaway — the watch never saw the ring');
        }
        this.completeStage(world);
        return;
      }
      if (a.getawayT <= 0) {
        // Clock ran out: the run is hot now — heat up, take cut, but
        // the heist goes on to the fence at a discount.
        a.clean = false;
        a.loot = Math.round(a.loot * 0.75);
        world.heat += HEIST.hotGetawayHeat;
        world.updateWanted();
        world.events.push({ type: 'star' });
        world.notify('Getaway clock ran out — hot run, take cut 25%, heat up');
        this.completeStage(world);
      }
      return;
    }
    // Fence stage: waits for E at a fence spot (world.tryInteract
    // calls tryFence); standing here just holds the goods.
  }

  /** E on foot at a fence spot while the fence stage is live. */
  tryFence(world) {
    if (!this.active || this.stageKind() !== 'fence') return false;
    const spot = this.nearestFence(world.player.x, world.player.y);
    if (!spot) return false;
    this.active.fenceSpot = spot;
    this.completeStage(world);
    return true;
  }

  completeStage(world) {
    const a = this.active;
    if (!a) return;
    const kind = this.stageKind();
    if (kind === 'case') {
      a.stageIndex = 1;
      a.holdT = 0;
      world.events.push({ type: 'heistPlan' });
      this.sayStage(world, 'grab');
      world.notify(`${a.def.name}: cased. ${STAGE_LABELS.grab} — ${a.def.goods}`);
      return;
    }
    if (kind === 'grab') {
      const roles = this.crewRoles(world);
      const heatCut = roles.lookout ? 1 - this.roleBonus(world, 'lookout') : 1;
      const heat = Math.round(a.def.grabHeat * heatCut);
      world.heat += heat;
      world.updateWanted();
      world.commitCrime('heistGrab');
      this.lootHeld = a.loot;
      a.stageIndex = 2;
      a.holdT = 0;
      a.getawayT = this.getawaySeconds(world, a.def);
      world.events.push({ type: 'heistGrab' });
      this.sayStage(world, 'getaway');
      world.notify(`${a.def.name}: grabbed $${a.loot} of goods — heat +${heat}. ${STAGE_LABELS.getaway} (${Math.round(a.getawayT)}s)`);
      return;
    }
    if (kind === 'getaway') {
      a.stageIndex = 3;
      const offer = bestFenceOffer(a.loot, world);
      this.sayStage(world, 'fence');
      world.say(LEAGUE_FIXER, `Goods in hand. ${offer.buyer.name} pays best — $${offer.payout} after the cut. Get to a fence.`, 7);
      world.notify(`${a.def.name}: ${STAGE_LABELS.fence} — best buyer ${offer.buyer.name} ($${offer.payout})`);
      return;
    }
    if (kind === 'fence') {
      const offer = bestFenceOffer(a.loot, world);
      const payout = offer.payout;
      this.pendingPayout += payout;
      this.rep += a.def.rep;
      this.completed.push(a.def.id);
      this.stats.heists += 1;
      this.stats.fenced += payout;
      this.stats.bestTake = Math.max(this.stats.bestTake, payout);
      this.lootHeld = 0;
      // A fenced heist levels the hired crew, like a finished
      // mission does, and the Broker cools the heat down a quarter
      // — a clean fence buys a quieter harbour.
      const levelled = world.crew.onMissionComplete();
      if (levelled.length) {
        world.notify(`Crew levelled up: ${levelled.map((m) => `${m.short} Lv${m.level}`).join(', ')}`);
      }
      world.heat = Math.max(0, Math.round(world.heat * 0.75));
      world.updateWanted();
      const brief = LEAGUE_BRIEFINGS[a.def.id];
      world.events.push({ type: 'heistFence' });
      world.say(LEAGUE_FIXER, brief ? brief.outro : `${a.def.name} fenced. The League remembers.`, 7);
      world.notify(`${a.def.name} fenced for $${payout} (+${a.def.rep} rep) — ${this.rank().title}`);
      this.active = null;
    }
  }

  /** Busted or wasted mid-heist: the goods and the run are gone. */
  failHeist(world, reason) {
    if (!this.active) return;
    const name = this.active.def.name;
    this.active = null;
    this.lootHeld = 0;
    this.stats.failed += 1;
    world.notify(`${name} failed (${reason}) — the goods are gone`);
  }

  /** Walk away from a live heist from the board (X): the goods stay where they are. */
  abortHeist(world) {
    if (!this.active) return false;
    const name = this.active.def.name;
    const line = LEAGUE_ABANDON_LINES[world.rng.int(0, LEAGUE_ABANDON_LINES.length - 1)];
    this.active = null;
    this.lootHeld = 0;
    this.stats.failed += 1;
    world.rival.noteFailure();
    world.say(LEAGUE_FIXER, line, 6);
    world.notify(`${name} abandoned — the goods stay where they are`);
    return true;
  }

  // -------------------------------------------------------------- save

  serialize() {
    return {
      completed: [...this.completed],
      rep: this.rep,
      selected: this.selected,
      stats: { ...this.stats },
    };
  }

  load(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.completed)) {
      this.completed = data.completed.filter((id) => typeof id === 'string');
    }
    if (Number.isFinite(Number(data.rep))) this.rep = Math.max(0, Math.floor(Number(data.rep)));
    if (Number.isFinite(Number(data.selected))) {
      this.selected = Math.max(0, Math.min(HEIST_DEFS.length - 1, Math.floor(Number(data.selected))));
    }
    if (data.stats && typeof data.stats === 'object') {
      for (const key of ['heists', 'fenced', 'cleanGetaways', 'bestTake', 'failed']) {
        const v = Number(data.stats[key]);
        if (Number.isFinite(v)) this.stats[key] = Math.max(0, Math.floor(v));
      }
    }
  }
}

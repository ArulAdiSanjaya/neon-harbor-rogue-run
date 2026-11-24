// Cab work: the harbour's riders hail a car with its cab light on.
//
// A fare runs in three acts. First a rider waits on a sidewalk,
// waving, with a patience clock that runs out after a couple of
// minutes. Then the meter runs: it starts at the base fare and
// ticks a dollar per stretch of road driven with the rider aboard.
// Then the destination pays: the meter plus a tip graded on the
// ride — on time and smooth earns, a shunt costs tip, a late ride
// earns none. Every fifth fare is a VIP: double fare, timed clock,
// named riders. Night fares pay half again.
//
// The rider also has a preference, and the tip grades it: a
// hurried rider pays for speed and nothing for dawdling, a scenic
// rider pays for a slow drive past the lamps. Racing with a rider
// aboard is not done — the rider bails the moment the flag goes
// up — and stepping out of the car mid-fare ends it unpaid.
//
// The cab light (T) starts on. Switch it off and the riders stop
// hailing. Fares, earnings, best tip and five-star rides persist
// in the save, and Dario's Cab Boss chain watches finishSeq: only
// a fare completed after its stage begins counts toward it.
//
// This file owns the fare state machine, the meter and the tip
// grading. world.js owns the wiring: it boards a rider from
// tryInteract, steps the system, pays the pending payout once,
// and tells stepMission when a fare finished; render.js draws the
// rider, the destination and the meter.

import { CITY, TAXI } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';

// The riders of Neon Harbor: ordinary folk with somewhere to be.
// kind steers which lines they get; a chatty rider talks, a quiet
// one keeps it short, an impatient one watches the clock out loud.
// Nothing here is borrowed from anywhere else.
export const TAXI_RIDERS = [
  {
    name: 'Mara', kind: 'chatty', color: '#d95f4b',
    board: 'Mara — midtown, please. And do not spare the horses.',
    thanks: 'Five stars. You drive like the harbour owes you money.',
    late: 'Late. I had a table booked. The fare is yours, the tip is not.',
    bail: 'A race? With me in the back seat? Let me out. Right now.',
  },
  {
    name: 'Pete', kind: 'quiet', color: '#4b8fd9',
    board: 'Pete. North side. No talking, no radio, no detours.',
    thanks: 'Clean run. Here is your money. Keep the change.',
    late: 'You are late. I am not angry. I am just not tipping.',
    bail: 'Racing? I am seventy-one. Out. Now.',
  },
  {
    name: 'Sable', kind: 'chatty', color: '#c86dd7',
    board: 'Sable — the waterfront, darling. I have a boat to catch and a story to tell.',
    thanks: 'Oh, you are good. The harbour should pay you extra. I will.',
    late: 'My boat left, darling. The fare stands. The tip sailed with it.',
    bail: 'Darling, I did not sign up for a getaway. Stop the car.',
  },
  {
    name: 'Rook', kind: 'impatient', color: '#e0c33c',
    board: 'Rook. East side. I am already late, so drive like you mean it.',
    thanks: 'On time, no dents. That is how you earn a tip.',
    late: 'Too slow. The meter is all you get.',
    bail: 'No. No races with a fare aboard. I am out.',
  },
  {
    name: 'Ivy', kind: 'quiet', color: '#7ac74f',
    board: 'Ivy. The park, please. Slow past the lamps — I like the lights.',
    thanks: 'That was a gentle ride. Thank you.',
    late: 'The lamps are still there. The tip, sadly, is not.',
    bail: 'Please stop. I would rather walk than race.',
  },
  {
    name: 'Dax', kind: 'impatient', color: '#5fd0c5',
    board: 'Dax — downtown, fast. My crew is waiting and they do not wait.',
    thanks: 'Fast and in one piece. That is worth extra.',
    late: 'My crew waited. My tip did not.',
    bail: 'Race on your own time, not mine. I am out.',
  },
  {
    name: 'Noor', kind: 'chatty', color: '#e8e8e8',
    board: 'Noor here — the north towers. Tell me something good about this city on the way.',
    thanks: 'You know your streets. Here — for the tour as much as the ride.',
    late: 'The story was good. The timing was not.',
    bail: 'A race? I will take my chances on foot, thanks.',
  },
  {
    name: 'Cass', kind: 'quiet', color: '#8fa63f',
    board: 'Cass. The depot road. Drive steady.',
    thanks: 'Steady hands. Steady tip.',
    late: 'Steady is not the same as slow. No tip.',
    bail: 'Stop the car. I walk from here.',
  },
  {
    name: 'Theo', kind: 'chatty', color: '#d06ba8',
    board: 'Theo — the club, please. I am DJing tonight and the crowd is already restless.',
    thanks: 'You got me there before the first track. The crowd owes you one too.',
    late: 'The crowd waited. My tip did not.',
    bail: 'A race is not on my rider. Stop, please.',
  },
  {
    name: 'June', kind: 'impatient', color: '#3fb0a5',
    board: 'June. The hospital, quick — my shift starts in ten and the buses are useless.',
    thanks: 'On time for my shift. You are a lifesaver, literally.',
    late: 'My shift started without me. The fare is all you get.',
    bail: 'I have a shift to make, not a race to survive. Out.',
  },
  {
    name: 'Silas', kind: 'quiet', color: '#8a6d4b',
    board: 'Silas. The old lighthouse road. I have walked it for forty years; tonight I ride.',
    thanks: 'A quiet ride for a quiet man. Well done.',
    late: 'Forty years I walked it faster. No tip.',
    bail: 'Young man, I have survived forty years by never racing. Stop.',
  },
  {
    name: 'Priya', kind: 'chatty', color: '#ff8a3c',
    board: 'Priya — the noodle bar on row two. I will tell you about my grandmother on the way. She ran a cab too.',
    thanks: 'Grandmother would have approved. Five stars, and a story for the road.',
    late: 'Grandmother never ran late. Neither should you.',
    bail: 'Grandmother never raced her fares either. Let me out.',
  },
];

const VIP_NAMES = ['Madame Okafor', 'Councillor Brandt', 'Chef Anselm', 'The Duchess'];
const VIP_COLOR = '#ff4fd8';

/** A readable destination label from a grid point, for the meter. */
export function taxiDestLabel(x, y) {
  const col = Math.round((x - 46) / CITY.pitch);
  const row = Math.round((y - 46) / CITY.pitch);
  const side = col <= 1 ? 'west end' : col <= 3 ? 'midtown' : col <= 5 ? 'east side' : 'far east';
  const band = row === 0 ? 'north side' : row <= 2 ? 'uptown' : row === 3 ? 'downtown' : 'waterfront';
  return `the ${side} ${band}`;
}

export class TaxiSystem {
  constructor() {
    this.lightOn = TAXI.lightOn;
    this.state = 'idle'; // 'idle' | 'waiting' | 'riding'
    this.rider = null; // { name, kind, color, x, y, waitT, destX, destY, destLabel, vip, pref }
    this.spawnT = 2; // a rider hails soon after the run starts
    this.fare = 0; // dollars on the meter right now
    this.distanceDriven = 0;
    this.rideT = 0;
    this.parTime = 0;
    this.vipClock = 0;
    this.crashes = 0;
    this.lastCrashNoteT = -99; // one crash counts once per 1.5 s of ride
    this.lastCarX = 0;
    this.lastCarY = 0;
    this.bannerUntil = 0; // world time until the fare banner hides
    this.fareCount = 0;
    this.finishSeq = 0; // increments on every completed fare
    this.vipFinishSeq = 0; // increments only on a completed VIP fare
    this.pendingPayout = 0; // world collects and pays this once
    this.lastResult = null; // { name, fare, tip, total, rating, vip, night, pref }
    this.lastFares = []; // newest first, capped at 5 — the cab ledger's memory
    this.stats = { fares: 0, earned: 0, tips: 0, bestTip: 0, fiveStars: 0, vips: 0, nightFares: 0 };
  }

  // ------------------------------------------------------------ queries

  /** Where the world should point the marker and arrow: the rider,
   * the destination, or nothing when no fare is live. */
  currentTarget() {
    if (this.state === 'waiting' && this.rider) return { x: this.rider.x, y: this.rider.y };
    if (this.state === 'riding' && this.rider) return { x: this.rider.destX, y: this.rider.destY };
    return null;
  }

  /** The live meter reading: the base fare plus a dollar per
   * distance block driven with the rider aboard. A VIP doubles at
   * payout, not on the meter — the rider sees the same meter as
   * everyone else. */
  meterFare() {
    return TAXI.baseFare + Math.floor(this.distanceDriven / TAXI.perDistanceUnits) * TAXI.perDistance;
  }

  /** Seconds left on a VIP's clock, or null for a regular fare. */
  vipTimeLeft() {
    if (this.state !== 'riding' || !this.rider || !this.rider.vip) return null;
    return Math.max(0, this.vipClock);
  }

  // -------------------------------------------------------------- light

  /**
   * Flip the cab light. Switching it off sends a waiting rider
   * home — the light is the promise, and a dark cab makes none.
   * Returns the new state.
   */
  toggleLight() {
    this.lightOn = !this.lightOn;
    if (!this.lightOn && this.state === 'waiting') {
      this.rider = null;
      this.state = 'idle';
      this.spawnT = TAXI.spawnDelay;
    }
    return this.lightOn;
  }

  // --------------------------------------------------------------- step

  /** Step the fare machine. `world` is read for the player and the
   * race, and written for notices, dialogue and payout events. */
  update(dt, world) {
    if (this.state === 'idle') {
      if (!this.lightOn) return;
      this.spawnT -= dt;
      if (this.spawnT <= 0) this.spawnRider(world);
      return;
    }

    if (this.state === 'waiting') {
      const r = this.rider;
      if (!r) { this.state = 'idle'; this.spawnT = TAXI.spawnDelay; return; }
      r.waitT += dt;
      if (r.waitT > TAXI.maxWait) {
        world.notify(`${r.name} gave up waiting and walked off`);
        this.rider = null;
        this.state = 'idle';
        this.spawnT = TAXI.spawnDelay;
        world.events.push({ type: 'taxiLeft' });
      }
      return;
    }

    // Riding: the meter, the clock, the bail rules.
    const p = world.player;
    if (!p.car) {
      this.cancelRide(world, 'You left the cab — the rider walked off unpaid');
      return;
    }
    if (world.race.active) {
      this.bailRide(world);
      return;
    }
    const dx = p.car.x - this.lastCarX;
    const dy = p.car.y - this.lastCarY;
    this.distanceDriven += Math.hypot(dx, dy);
    this.lastCarX = p.car.x;
    this.lastCarY = p.car.y;
    this.rideT += dt;
    this.fare = this.meterFare();
    if (this.rider.vip) {
      this.vipClock -= dt;
      if (this.vipClock <= 0 && !this.rider.clockWarned) {
        this.rider.clockWarned = true;
        world.say(this.rider.name.toUpperCase(), 'The clock just ran out — the double fare stands, but there will be no tip.', 5);
      }
    }
    const destD = Math.hypot(p.x - this.rider.destX, p.y - this.rider.destY);
    if (destD < TAXI.dropoffRadius) this.completeFare(world);
  }

  // -------------------------------------------------------------- spawn

  /** Hail a rider: pick a sidewalk spot away from the player and a
   * destination a real drive away, weighted toward the far side of
   * town so a fare is a trip, not a shuffle. */
  spawnRider(world) {
    const rng = world.rng;
    const p = world.player;
    let spot = null;
    for (let tries = 0; tries < 12 && !spot; tries += 1) {
      const col = rng.int(0, CITY.cols);
      const row = rng.int(0, CITY.rows);
      const side = rng.chance(0.5) ? -1 : 1;
      const vertical = rng.chance(0.5);
      const x = vertical ? roadCenterX(col) + side * 57 : roadCenterX(col);
      const y = vertical ? roadCenterY(row) : roadCenterY(row) + side * 57;
      if (Math.hypot(x - p.x, y - p.y) > 260) spot = { x, y };
    }
    if (!spot) {
      this.spawnT = TAXI.spawnDelay;
      return;
    }
    // Destinations: every intersection, weighted by how far it is
    // from the rider, so fares mostly cross town.
    const cands = [];
    for (let col = 0; col <= CITY.cols; col += 1) {
      for (let row = 0; row <= CITY.rows; row += 1) {
        const x = roadCenterX(col);
        const y = roadCenterY(row);
        const d = Math.hypot(x - spot.x, y - spot.y);
        if (d > 500) cands.push({ item: { x, y }, weight: d });
      }
    }
    if (!cands.length) {
      this.spawnT = TAXI.spawnDelay;
      return;
    }
    const dest = rng.weightedPick(cands);
    const isVip = (this.fareCount + 1) % TAXI.vipEvery === 0;
    const archetype = rng.weightedPick([
      { item: 'chatty', weight: 4 },
      { item: 'quiet', weight: 3 },
      { item: 'impatient', weight: 3 },
    ]);
    // What the rider wants from the drive: a VIP always wants it
    // fast (the clock says so); anyone else may want a hurry, a
    // slow scenic ride past the lamps, or just a smooth trip. The
    // preference grades the tip — a hurried rider pays for speed,
    // a scenic rider pays for taking it slow.
    const pref = isVip ? 'hurry' : rng.weightedPick([
      { item: 'any', weight: 5 },
      { item: 'hurry', weight: 3 },
      { item: 'scenic', weight: 2 },
    ]);
    let riderDef = TAXI_RIDERS.find((r) => r.kind === archetype) || TAXI_RIDERS[0];
    if (isVip) {
      riderDef = {
        name: rng.pick(VIP_NAMES), kind: 'vip', color: VIP_COLOR,
        board: 'A VIP booking — double fare, and my clock is already running. Drive.',
        thanks: 'Impeccable. The double fare is yours, and so is this.',
        late: 'The clock ran out. The double fare stands — the tip does not.',
        bail: 'Unacceptable. I will take another cab. Or walk. Either way, not this one.',
      };
    }
    this.rider = {
      name: riderDef.name, kind: riderDef.kind, color: riderDef.color,
      board: riderDef.board, thanks: riderDef.thanks, late: riderDef.late, bail: riderDef.bail,
      x: spot.x, y: spot.y, waitT: 0,
      destX: dest.x, destY: dest.y, destLabel: taxiDestLabel(dest.x, dest.y),
      vip: isVip, clockWarned: false, pref,
    };
    this.state = 'waiting';
    world.events.push({ type: 'taxiHail' });
    const prefNote = pref === 'hurry' ? ' — wants it FAST' : pref === 'scenic' ? ' — wants a slow, scenic ride' : '';
    world.notify(isVip
      ? `VIP fare: ${this.rider.name} is waiting — double fare, timed`
      : `${this.rider.name} is hailing a cab${prefNote} — drive over in your car and press E`);
  }

  // -------------------------------------------------------------- board

  /** The player, in a car, takes the waiting rider aboard. Returns
   * true when a fare starts (false when nobody is waiting). */
  boardRider(world) {
    if (this.state !== 'waiting' || !this.rider) return false;
    const p = world.player;
    if (!p.car) return false;
    const r = this.rider;
    const routeDist = Math.hypot(r.destX - r.x, r.destY - r.y);
    this.state = 'riding';
    this.fare = TAXI.baseFare;
    this.distanceDriven = 0;
    this.rideT = 0;
    this.crashes = 0;
    this.lastCarX = p.car.x;
    this.lastCarY = p.car.y;
    this.parTime = r.vip
      ? Math.max(TAXI.vipMinTime, routeDist * TAXI.vipTimePerUnit)
      : routeDist / TAXI.parSpeed;
    this.vipClock = r.vip ? this.parTime : 0;
    world.events.push({ type: 'taxiPickup' });
    world.say(r.name.toUpperCase(), r.board, 6);
    const prefNote = r.pref === 'hurry' ? ' — fast, please' : r.pref === 'scenic' ? ' — slow and scenic, please' : '';
    world.notify(r.vip
      ? `VIP aboard — ${r.destLabel}, double fare, ${Math.ceil(this.parTime)}s on the clock`
      : `Fare aboard — take ${r.name} to ${r.destLabel}${prefNote}`);
    return true;
  }

  /** A crash with a rider aboard: the tip shrinks, and the rider
   * says so. Called by the world's collision step, at most once
   * per crash event — a grinding wall scrape counts as one crash
   * per 1.5 seconds, not one per step. */
  noteCrash(world) {
    if (this.state !== 'riding' || !this.rider) return;
    if (world.time - this.lastCrashNoteT < 1.5) return;
    this.lastCrashNoteT = world.time;
    this.crashes += 1;
    if (this.crashes === 1) {
      world.say(this.rider.name.toUpperCase(), 'Careful! That crash just cost you your tip.', 4);
    } else if (this.crashes === 2) {
      world.say(this.rider.name.toUpperCase(), 'Again? Drive like my fare depends on it — because it does.', 4);
    }
  }

  // ------------------------------------------------------------- finish

  /** The destination is reached: grade the ride, pay the meter
   * plus tip, and bank the result for the HUD and the save. The
   * tip grades the rider's preference as well as the clock: a
   * hurried rider pays double for speed and nothing for dawdling,
   * a scenic rider pays for a slow drive past the lamps, and a
   * crash always costs — the rider felt it, whatever they asked for. */
  completeFare(world) {
    const r = this.rider;
    const onTime = this.rideT <= this.parTime;
    const vipLate = r.vip && this.vipClock <= 0;
    const avgSpeed = this.rideT > 0 ? this.distanceDriven / this.rideT : 0;
    let tip = TAXI.tipBase + (onTime && !vipLate ? TAXI.tipSpeedBonus : 0)
      - this.crashes * TAXI.tipCrashCut;
    if (vipLate) tip = 0;
    if (r.pref === 'hurry') {
      // A hurried rider doubles the speed bonus — or pays nothing
      // at all for a slow ride, whatever the clock said.
      tip = onTime ? tip + TAXI.tipSpeedBonus : 0;
    } else if (r.pref === 'scenic') {
      // A scenic rider pays for taking it slow: under 220 units a
      // second through the streets earns $8; rushing loses $4.
      tip += avgSpeed < 220 ? 8 : -4;
    }
    tip = Math.max(0, Math.round(tip * (1 + world.crew.taxiTipBonus())));
    // Night rates: after dark the harbour pays half again on the meter.
    const night = world.night;
    const fare = Math.round((r.vip ? this.fare * 2 : this.fare) * (night ? TAXI.nightMultiplier : 1));
    const total = fare + tip;
    let rating = 5 - Math.min(3, this.crashes) - (onTime ? 0 : 1);
    if (vipLate) rating = Math.min(rating, 3);
    rating = Math.max(1, rating);
    this.pendingPayout = total;
    this.lastResult = { name: r.name, fare, tip, total, rating, vip: r.vip, night, pref: r.pref };
    this.bannerUntil = world.time + 6; // the fare banner shows for six seconds
    this.lastFares.unshift({ name: r.name, rating, total, vip: r.vip, night, pref: r.pref });
    if (this.lastFares.length > 5) this.lastFares.length = 5;
    this.stats.fares += 1;
    this.stats.earned += total;
    this.stats.tips += tip;
    this.stats.bestTip = Math.max(this.stats.bestTip, tip);
    if (rating === 5) this.stats.fiveStars += 1;
    if (r.vip) {
      this.stats.vips += 1;
      this.vipFinishSeq += 1;
    }
    if (night) this.stats.nightFares += 1;
    this.fareCount += 1;
    this.finishSeq += 1;
    world.events.push({ type: 'taxiDropoff' });
    world.say(r.name.toUpperCase(), onTime && !vipLate ? r.thanks : r.late, 6);
    world.notify(tip > 0
      ? `Fare complete: $${fare}${night ? ' (night rates)' : ''} + $${tip} tip — ${rating}★ from ${r.name}`
      : `Fare complete: $${fare}${night ? ' (night rates)' : ''} — ${rating}★ from ${r.name} (no tip)`);
    this.rider = null;
    this.state = 'idle';
    this.spawnT = TAXI.spawnDelay;
    this.fare = 0;
    this.distanceDriven = 0;
  }

  /** The rider leaves mid-ride: a race started, or the driver got
   * out of the car. The fare is lost, the meter dies with it. */
  bailRide(world) {
    const r = this.rider;
    if (r) world.say(r.name.toUpperCase(), r.bail, 5);
    world.events.push({ type: 'taxiBail' });
    world.notify(r ? `${r.name} bailed — the fare is gone` : 'The fare is gone');
    this.rider = null;
    this.state = 'idle';
    this.spawnT = TAXI.spawnDelay;
    this.fare = 0;
    this.distanceDriven = 0;
  }

  /** Same as a bail, with the driver's own reason on the notice. */
  cancelRide(world, reason) {
    this.bailRide(world);
    world.notify(reason);
  }

  // --------------------------------------------------------------- save

  serialize() {
    return {
      lightOn: this.lightOn,
      fareCount: this.fareCount,
      stats: { ...this.stats },
      lastFares: this.lastFares.slice(0, 5),
    };
  }

  load(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.lightOn === 'boolean') this.lightOn = data.lightOn;
    if (Number.isFinite(Number(data.fareCount))) this.fareCount = Math.max(0, Math.floor(Number(data.fareCount)));
    if (data.stats && typeof data.stats === 'object') {
      for (const key of ['fares', 'earned', 'tips', 'bestTip', 'fiveStars', 'vips', 'nightFares']) {
        const v = Number(data.stats[key]);
        if (Number.isFinite(v)) this.stats[key] = Math.max(0, Math.floor(v));
      }
    }
    if (Array.isArray(data.lastFares)) {
      this.lastFares = data.lastFares
        .filter((f) => f && typeof f.name === 'string' && Number.isFinite(Number(f.total)))
        .slice(0, 5)
        .map((f) => ({
          name: f.name, rating: Math.max(1, Math.min(5, Number(f.rating) || 1)),
          total: Number(f.total), vip: Boolean(f.vip), night: Boolean(f.night),
        }));
    }
  }
}

// The crew: three specialists who hang out around Neon Harbor and
// join the player's run for a one-off hire fee. A hired member trails
// the player on foot as a follower (a coloured ring with their
// initial), levels up once per mission finished while hired, and
// their perk scales with level — so a veteran crew is worth far more
// than the hire price. Hired ids and levels persist in the save.
//
//   Jax "Wrench" Calloway — Mechanic: the player's car slowly
//     self-repairs, and crash damage is cut.
//   Lena "Ghost" Voss — Driver: the player's car is faster and
//     turns sharper, and wanted heat decays faster.
//   Marcus "Boom" Reid — Shooter: gun damage up, and pedestrians
//     flee from gunfire from further away.
//
// This file owns the roster, the hire/level rules and the follower
// movement. world.js owns the wiring: it calls hire/level hooks from
// tryInteract and completeStage, reads the perk helpers from its
// driving, combat and wanted steps, and saves/loads via serialize().

import { CREW } from './config.js';
import { CREW_HANGOUTS, collideCircle } from './city.js';

export const CREW_DEFS = [
  {
    id: 'jax',
    name: 'Jax "Wrench" Calloway',
    short: 'Jax',
    initial: 'J',
    role: 'Mechanic',
    cost: 150,
    color: '#ff8a3c',
    perk: 'Car slowly self-repairs; crash damage cut',
    perkShort: 'Auto-repair + less crash damage',
  },
  {
    id: 'lena',
    name: 'Lena "Ghost" Voss',
    short: 'Lena',
    initial: 'L',
    role: 'Driver',
    cost: 250,
    color: '#3fd2ff',
    perk: 'Faster car, sharper handling, heat fades sooner',
    perkShort: '+Top speed & handling, faster heat decay',
  },
  {
    id: 'marcus',
    name: 'Marcus "Boom" Reid',
    short: 'Marcus',
    initial: 'M',
    role: 'Shooter',
    cost: 200,
    color: '#ff5348',
    perk: 'Gun damage up; peds flee further from gunfire',
    perkShort: '+Gun damage, peds flee further',
  },
];

export function crewDef(id) {
  return CREW_DEFS.find((d) => d.id === id) || null;
}

// What the crew says: a hire line when they join, a line when they
// level up, and idle chatter the world drops into dialogue every
// minute or so while they are hired — the crew talks back.
export const CREW_LINES = {
  jax: {
    hire: 'Hand me a wrench and a prayer. This car will never die on you again.',
    levelUp: 'Learned a new trick under the hood. She runs sweeter already.',
    chatter: [
      'That rattle? Gone. You are welcome.',
      'I could rebuild this engine blindfolded. Do not test me.',
      'Your car purrs now. Keep it that way.',
      'One day I will tune this thing past the watch itself.',
    ],
  },
  lena: {
    hire: 'I drive, you navigate. Try to keep up with me.',
    levelUp: 'Faster hands, faster car. Feel the difference?',
    chatter: [
      'That corner? I took it in my sleep.',
      'The watch cannot catch what it cannot see.',
      'Give me a straight road and I will give you a miracle.',
      'Heat fades when you drive like you mean it.',
    ],
  },
  marcus: {
    hire: 'Point me at trouble. I will handle the loud part.',
    levelUp: 'Steadier hands, heavier rounds. They will hear us coming.',
    chatter: [
      'I have seen louder. Barely.',
      'Keep the pistol warm and the peds will keep their distance.',
      'One shot, one problem solved.',
      'Nobody crowds us while I am carrying.',
    ],
  },
};

/** A random idle line for a hired member, for the world's chatter timer. */
export function crewChatterLine(id, rng) {
  const lines = CREW_LINES[id]?.chatter || [];
  if (!lines.length) return null;
  return lines[rng.int(0, lines.length - 1)];
}

/** The hangout point for a crew member (from city.js, road centres). */
export function crewHangout(id) {
  return CREW_HANGOUTS.find((h) => h.id === id) || null;
}

export function crewHangouts() {
  return CREW_DEFS.map((d) => ({ ...d, ...crewHangout(d.id) }));
}

export class CrewSystem {
  constructor() {
    // hired: { jax: 1, lena: 3 } — member id -> level (1 on hire).
    this.hired = {};
    // followers: one per hired member, trailing the player on foot.
    this.followers = [];
  }

  // ------------------------------------------------------------ roster

  isHired(id) {
    return Boolean(this.hired[id]);
  }

  level(id) {
    return this.hired[id] || 0;
  }

  hiredIds() {
    return Object.keys(this.hired);
  }

  hiredCount() {
    return this.hiredIds().length;
  }

  hiredDefs() {
    return this.hiredIds().map((id) => ({ ...crewDef(id), level: this.hired[id] }));
  }

  /** The member whose hangout the player is standing at, if any. */
  nearestHangout(x, y, radius = CREW.hireRadius) {
    let best = null;
    let bestD = radius;
    for (const def of CREW_DEFS) {
      const spot = crewHangout(def.id);
      if (!spot) continue;
      const d = Math.hypot(x - spot.x, y - spot.y);
      if (d < bestD) { bestD = d; best = { ...def, x: spot.x, y: spot.y, dist: d }; }
    }
    return best;
  }

  // -------------------------------------------------------------- hire

  /**
   * Hire a member: charges the fee through the caller (world holds
   * the money), spawns the follower at the hangout, and returns a
   * result the caller turns into dialogue/notice/sound. Returns
   * { ok, reason } — 'already' | 'poor' | null on success.
   */
  hire(id, money) {
    const def = crewDef(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.isHired(id)) return { ok: false, reason: 'already' };
    if (money < def.cost) return { ok: false, reason: 'poor', cost: def.cost };
    this.hired[id] = 1;
    const spot = crewHangout(id);
    this.followers.push({
      memberId: id,
      x: spot ? spot.x + 24 : 0,
      y: spot ? spot.y + 24 : 0,
      angle: 0,
      color: def.color,
      initial: def.initial,
    });
    return { ok: true, def };
  }

  /** Fire a member (unused in play, kept for the roster UI/tests). */
  fire(id) {
    delete this.hired[id];
    this.followers = this.followers.filter((f) => f.memberId !== id);
  }

  /**
   * Level up every hired member once per finished mission. Returns
   * the list of members who actually gained a level (those already
   * at the cap stay put and are not reported as levelling).
   */
  onMissionComplete() {
    const levelled = [];
    for (const id of this.hiredIds()) {
      if (this.hired[id] < CREW.maxLevel) {
        this.hired[id] += 1;
        levelled.push({ ...crewDef(id), level: this.hired[id] });
      }
    }
    return levelled;
  }

  // -------------------------------------------------------------- perks

  mechanicLevel() { return this.level('jax'); }
  driverLevel() { return this.level('lena'); }
  shooterLevel() { return this.level('marcus'); }

  /** Car health regained per second while the mechanic is hired. */
  regenPerSecond() {
    return CREW.mechanicRegen * this.mechanicLevel();
  }

  /** Multiplier on crash damage while the mechanic is hired. */
  crashDamageMultiplier() {
    return Math.max(0.6, 1 - CREW.mechanicCrashCut * this.mechanicLevel());
  }

  /** Extra top speed (player car only) while the driver is hired. */
  driverTopSpeedBonus() {
    return CREW.driverTopSpeed * this.driverLevel();
  }

  /** Extra turn rate (player car only) while the driver is hired. */
  driverTurnBonus() {
    return CREW.driverTurnBonus * this.driverLevel();
  }

  /** Multiplier on heat decay while the driver is hired. */
  heatDecayMultiplier() {
    return 1 + CREW.driverHeatCut * this.driverLevel();
  }

  /** Multiplier on gun damage while the shooter is hired. */
  gunDamageMultiplier() {
    return 1 + CREW.shooterDamage * this.shooterLevel();
  }

  /** Ped flee radius from gunfire while the shooter is hired. */
  fleeRadius(base) {
    return base + CREW.shooterFleeBonus * this.shooterLevel();
  }

  // ---------------------------------------------------------- followers

  /**
   * Followers trail the player on foot: they run for the spot just
   * behind the player's facing, catch up if left behind, and never
   * walk through a building. On foot they keep pace with a running
   * player; in a car they sprint after it and respawn beside the
   * player if they fall too far behind (a follower is a perk, not a
   * second mouth to lose in traffic).
   */
  update(dt, world) {
    const p = world.player;
    for (const f of this.followers) {
      const def = crewDef(f.memberId);
      // The anchor: just behind the player, offset per member so
      // three followers fan out instead of stacking on one spot.
      const idx = this.followers.indexOf(f);
      const side = idx === 0 ? 0 : (idx % 2 === 0 ? 1 : -1);
      const back = CREW.followDistance + (idx === 2 ? 26 : 0);
      const ax = p.x - Math.cos(p.angle) * back + Math.cos(p.angle + Math.PI / 2) * side * 30;
      const ay = p.y - Math.sin(p.angle) * back + Math.sin(p.angle + Math.PI / 2) * side * 30;
      const d = Math.hypot(ax - f.x, ay - f.y);
      if (d > 520) {
        // Fell hopelessly behind (player drove off): catch up beside them.
        f.x = ax;
        f.y = ay;
        continue;
      }
      if (d > 6) {
        const speed = d > 160 ? CREW.followSpeed * 1.6 : CREW.followSpeed;
        const step = Math.min(d, speed * dt);
        f.x += ((ax - f.x) / d) * step;
        f.y += ((ay - f.y) / d) * step;
        f.angle = Math.atan2(ay - f.y, ax - f.x);
      }
      collideCircle(world.city, f, 11);
      void def;
    }
  }

  // -------------------------------------------------------------- save

  serialize() {
    return { hired: { ...this.hired } };
  }

  load(data) {
    if (!data || typeof data !== 'object') return;
    const hired = data.hired || {};
    this.hired = {};
    this.followers = [];
    for (const def of CREW_DEFS) {
      const level = Number(hired[def.id]);
      if (Number.isFinite(level) && level >= 1) {
        this.hired[def.id] = Math.min(CREW.maxLevel, Math.floor(level));
        const spot = crewHangout(def.id);
        this.followers.push({
          memberId: def.id,
          x: spot ? spot.x + 24 : 0,
          y: spot ? spot.y + 24 : 0,
          angle: 0,
          color: def.color,
          initial: def.initial,
        });
      }
    }
  }
}

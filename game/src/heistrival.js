// The Gull Kings — the rival crew that hates the League.
//
// The Kings ran this harbour before the Broker's League showed up,
// and every fenced heist is an insult they answer. Their attention
// is a meter the player can watch on the board: it climbs while a
// heist is live and jumps with every success. At low attention they
// only talk; at high attention they tip the watch (a heat spike) or
// send a crew to cut the player off mid-getaway (another spike, and
// a taunt). Attention bleeds off slowly when the player lies low —
// no active heist, no wanted stars — so a careful runner can cool
// the Kings down between jobs. The system never spawns anything
// directly; it works through the world's own heat and crime calls,
// the same levers every other system uses.

import { RIVAL_TAUNTS } from './heistchain.js';

export const RIVAL_CREW = 'THE GULL KINGS — rival crew';

// Attention thresholds: talk, tip-off, ambush. Crossing one fires
// exactly once until the meter falls back below it.
export const RIVAL_THRESHOLDS = [
  { at: 30, kind: 'taunt' },
  { at: 55, kind: 'tipoff' },
  { at: 80, kind: 'ambush' },
  { at: 100, kind: 'heatwave' },
];

export class RivalSystem {
  constructor() {
    this.attention = 0; // 0..100 — how hard the Kings are watching
    this.fired = {}; // threshold kind -> true, until the meter cools
    this.events = 0; // rival events fired, all time
    this.tauntIndex = 0;
  }

  level() {
    if (this.attention >= 80) return 'hunting';
    if (this.attention >= 55) return 'circling';
    if (this.attention >= 30) return 'watching';
    return 'quiet';
  }

  /** A fenced heist is public success: the Kings take notice. */
  noteSuccess() {
    this.attention = Math.min(100, this.attention + 8);
  }

  /** A failed heist is a small mercy: the Kings laugh, then look away. */
  noteFailure() {
    this.attention = Math.max(0, this.attention - 6);
  }

  update(dt, world) {
    const heistLive = Boolean(world.heist && world.heist.active);
    if (heistLive) {
      // Live heists draw eyes: faster while the goods are in hand.
      const rate = world.heist.lootHeld > 0 ? 2.2 : 1.1;
      this.attention = Math.min(100, this.attention + rate * dt);
    } else if (world.wanted === 0) {
      // Lying low cools them off, slowly — about a minute to shed
      // a tip-off's worth of attention.
      this.attention = Math.max(0, this.attention - 0.9 * dt);
    }
    for (const t of RIVAL_THRESHOLDS) {
      if (this.attention >= t.at && !this.fired[t.kind]) {
        this.fired[t.kind] = true;
        this.fire(world, t.kind);
      }
      if (this.attention < t.at - 12) this.fired[t.kind] = false;
    }
  }

  fire(world, kind) {
    this.events += 1;
    if (kind === 'taunt') {
      const line = RIVAL_TAUNTS[this.tauntIndex % RIVAL_TAUNTS.length];
      this.tauntIndex += 1;
      world.say(RIVAL_CREW, line, 5);
      return;
    }
    if (kind === 'tipoff') {
      world.heat += 6;
      world.updateWanted();
      world.events.push({ type: 'star' });
      world.notify('Gull Kings tipped the watch — heat up');
      world.say(RIVAL_CREW, 'A little bird told the watch where to look tonight.', 5);
      return;
    }
    // Ambush: the Kings cut the player off — two hits worth of heat
    // and a spike, the same shape as a police ram.
    if (kind === 'ambush') {
      world.heat += 10;
      world.updateWanted();
      world.commitCrime('hitPolice');
      world.commitCrime('hitPolice');
      world.events.push({ type: 'star' });
      world.notify('Gull Kings ambush — they cut you off, heat up');
      world.say(RIVAL_CREW, 'The Kings do not share the water. Remember that.', 5);
      return;
    }
    // Heatwave: at full attention the Kings bring the whole watch
    // down at once, then fall back to circling — the meter resets
    // to 40 so the wave can build again.
    if (kind === 'heatwave') {
      world.heat += 14;
      world.updateWanted();
      world.events.push({ type: 'star' });
      this.attention = 40;
      this.fired.ambush = false;
      this.fired.tipoff = false;
      world.notify('Gull Kings heatwave — the whole watch is on you');
      world.say(RIVAL_CREW, 'The whole harbour is watching now. Run.', 5);
    }
  }

  serialize() {
    return {
      attention: Math.round(this.attention),
      events: this.events,
      tauntIndex: this.tauntIndex,
    };
  }

  load(data) {
    if (!data || typeof data !== 'object') return;
    if (Number.isFinite(Number(data.attention))) {
      this.attention = Math.max(0, Math.min(100, Number(data.attention)));
    }
    if (Number.isFinite(Number(data.events))) this.events = Math.max(0, Math.floor(Number(data.events)));
    if (Number.isFinite(Number(data.tauntIndex))) {
      this.tauntIndex = Math.max(0, Math.floor(Number(data.tauntIndex)));
    }
  }
}

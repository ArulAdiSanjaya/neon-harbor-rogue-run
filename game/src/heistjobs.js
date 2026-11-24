// Heist jobs — the fence buyers and the getaway math.
//
// A heist only pays when the goods are fenced, and every buyer
// takes a cut for moving hot goods. The three buyers differ: one
// pays best at night, one never asks questions but takes a quarter,
// one pays top dollar only for big takes. The board shows the best
// offer for the goods in hand; the payout also grows with the
// player's racing record (a proven wheelman) and cab history (a
// driver who knows every shortcut). The getaway ring is the far
// corner the def names, jittered a little so no two runs share the
// exact same finish line.

import { FENCE_SPOTS, nearestRoadX, nearestRoadY, roadCenterX, roadCenterY } from './city.js';

// ---------------------------------------------------------------- buyers

export const FENCE_BUYERS = [
  {
    id: 'marla',
    name: 'Marla the Fence',
    cut: 0.15,
    blurb: 'Steady 15% — no questions, no surprises',
    spot: 0,
  },
  {
    id: 'dockside',
    name: 'Dockside Fence',
    cut: 0.25,
    nightBonus: 0.12,
    blurb: '25% by day, but pays 12% more after dark',
    spot: 1,
  },
  {
    id: 'tower',
    name: 'Tower Broker',
    cut: 0.1,
    minLoot: 2000,
    blurb: 'Only 10% — but only takes jobs over $2,000',
    spot: 2,
  },
];

export function fenceBuyer(id) {
  return FENCE_BUYERS.find((b) => b.id === id) || null;
}

// --------------------------------------------------------------- offers

/** One buyer's price for this loot right now, with every bonus applied. */
export function fenceOffer(buyer, loot, world) {
  if (!buyer) return { buyer: null, payout: 0 };
  if (buyer.minLoot && loot < buyer.minLoot) return { buyer, payout: 0, refused: true };
  let rate = 1 - buyer.cut;
  if (buyer.nightBonus && world.night) rate += buyer.nightBonus;
  // Clean hands pay: fencing with no wanted stars is worth 15%
  // more — the buyer trusts a runner the watch never saw.
  if (world.wanted === 0) rate += 0.15;
  // The Gull Kings skim the fences once their attention is high —
  // a crew the rivals are circling pays 5% for the privilege.
  if (world.rival && world.rival.attention >= 55) rate -= 0.05;
  // A proven wheelman and a veteran cabbie both move goods faster:
  // race wins and finished fares each lift the price a little.
  const raceBonus = world.race && typeof world.race.getawayBonus === 'function'
    ? world.race.getawayBonus() : 0;
  const taxiBonus = world.taxi && typeof world.taxi.heistGetawayBonus === 'function'
    ? world.taxi.heistGetawayBonus() : 0;
  rate += raceBonus + taxiBonus;
  const payout = Math.max(0, Math.round(loot * rate));
  return { buyer, payout, rate };
}

/** The best paying buyer for this loot right now. */
export function bestFenceOffer(loot, world) {
  let best = { buyer: FENCE_BUYERS[0], payout: 0 };
  for (const buyer of FENCE_BUYERS) {
    const offer = fenceOffer(buyer, loot, world);
    if (offer.payout > best.payout) best = offer;
  }
  return best;
}

/** Every buyer and their current price, for the board's fence panel. */
export function allFenceOffers(loot, world) {
  return FENCE_BUYERS.map((buyer) => fenceOffer(buyer, loot, world));
}

// -------------------------------------------------------------- getaway

/**
 * The getaway ring: the def's far corner, jittered by the world's
 * seeded rng so the finish line moves a little between runs, but
 * never off the road grid — a ring in a building would be unfair.
 */
export function getawayRing(def, rng) {
  const jitter = () => (rng ? rng.range(-70, 70) : 0);
  const gx = def.getaway.x + jitter();
  const gy = def.getaway.y + jitter();
  return { x: gx, y: gy };
}

/**
 * How far the player still has to run on a getaway, in road terms:
 * straight-line distance to the ring, for the HUD countdown.
 */
export function getawayDistance(world, ring) {
  const p = world.player;
  return Math.hypot(p.x - ring.x, p.y - ring.y);
}

/**
 * The three fence spots, in board order, with their buyer names
 * attached — the board lists where each buyer waits.
 */
export function fenceSpotsWithBuyers() {
  return FENCE_SPOTS.map((spot, i) => {
    const buyer = FENCE_BUYERS.find((b) => b.spot === i) || FENCE_BUYERS[0];
    return { ...spot, buyer: buyer.name, cut: buyer.cut };
  });
}

// A casing sweep: three waypoints around a target that the case
// stage walks in order, holding two seconds at each. Every point
// is snapped to the nearest road centre, so a casing point can
// never land inside a building — a soft-locked heist would be
// worse than a hard one.
export function casingWaypoints(target, rng) {
  const points = [];
  const offsets = [[-90, -60], [110, -40], [0, 100]];
  for (const [dx, dy] of offsets) {
    const jx = rng ? rng.range(-25, 25) : 0;
    const jy = rng ? rng.range(-25, 25) : 0;
    points.push({
      x: nearestRoadX(target.x + dx + jx),
      y: nearestRoadY(target.y + dy + jy),
    });
  }
  return points;
}

// Road-grid helpers the board reuses for its little map sketch.
export function boardMapPoints() {
  return {
    cols: [0, 1, 2, 3, 4, 5, 6].map((c) => roadCenterX(c)),
    rows: [0, 1, 2, 3, 4].map((r) => roadCenterY(r)),
  };
}

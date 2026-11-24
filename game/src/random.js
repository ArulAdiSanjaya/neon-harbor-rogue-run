// A tiny seeded generator (mulberry32). Every random choice the game
// makes — building shapes, traffic colours, pedestrian coats, job
// targets, roadblock placement jitter — comes from one of these, so
// a seed always builds the same city and the screenshot scenes are
// reproducible.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** Shuffle a copy of a list, for the heist board's buyer rotation. */
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /**
     * Pick one entry from [{ item, weight }] with probability
     * proportional to its weight — the cab system weights its rider
     * archetypes and destination picks this way, so a regular rider
     * is common and a VIP is a rare, paid-double event.
     */
    weightedPick: (entries) => {
      let total = 0;
      for (const e of entries) total += Math.max(0, e.weight || 0);
      if (total <= 0) return entries.length ? entries[0].item : null;
      let roll = next() * total;
      for (const e of entries) {
        roll -= Math.max(0, e.weight || 0);
        if (roll <= 0) return e.item;
      }
      return entries[entries.length - 1].item;
    },
  };
}

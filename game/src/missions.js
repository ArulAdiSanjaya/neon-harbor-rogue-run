// The story: five jobs for Vesper Marlowe, the harbour fixer who runs
// errands out of the Sail & Anchor bar, plus the endless street work
// (package drops, rider pickups and chained getaway-driver routes)
// that pays between story beats.
//
// A mission is a list of stages; each stage has a target point, a line
// of Vesper dialogue shown when it begins, and an optional timer and
// wanted-level twist. world.js walks the stages; this file only holds
// the script and the free-roam job generator, so the story reads top
// to bottom in one place.

import { CITY } from './config.js';
import { roadCenterX, roadCenterY } from './city.js';

export const FIXER = 'VESPER MARLOWE — harbour fixer';

export const STORY = [
  {
    title: 'First Errand',
    pay: 120,
    intro: 'New face, old harbour. I need a package picked up from the dock shed, south-west corner. No questions, no dents.',
    stages: [
      { kind: 'pickup', label: 'Pick up the package at the dock shed', x: 210, y: CITY.height - 330 },
      { kind: 'deliver', label: 'Bring the package back to the Sail & Anchor', x: 0, y: 0 }, // filled below
    ],
    outro: 'Clean work. The harbour remembers clean work.',
  },
  {
    title: 'Hot Delivery',
    pay: 220,
    intro: 'Same package, hotter address. A buyer up in the north-east towers is paying for speed. Clock is running, friend.',
    stages: [
      { kind: 'pickup', label: 'Collect the package at the Sail & Anchor', x: 0, y: 0 },
      { kind: 'deliver', label: 'Deliver to the north-east towers — fast', x: CITY.width - 240, y: 250, timer: 95 },
    ],
    outro: 'Fast and breathing. That combination pays extra around here.',
  },
  {
    title: 'Loud Exit',
    pay: 320,
    intro: 'The last drop went loud and the harbour watch is awake. Take the marked car, shake the heat, and reach the old lighthouse road.',
    stages: [
      { kind: 'reach', label: 'Reach the marked getaway car', x: CITY.width - 300, y: CITY.height - 330 },
      { kind: 'escape', label: 'Lose the heat, then reach the lighthouse road', x: 140, y: 190, spice: true },
    ],
    outro: 'Gone like harbour fog. I wish my exes vanished that well.',
  },
  {
    title: 'The Gilded Coupe',
    pay: 500,
    intro: 'Finale, friend. A gilded coupe is sitting at the marina, keys in, owner careless. Bring it to my pier — the whole watch will object.',
    stages: [
      { kind: 'steal', label: 'Steal the gilded coupe at the marina', x: CITY.width / 2 + 330, y: CITY.height - 330 },
      { kind: 'deliver', label: 'Deliver the coupe to Vesper\u2019s pier', x: CITY.width / 2, y: CITY.height - 190, timer: 120, spice: true },
    ],
    outro: 'That is the harbour crown delivered. You run this town now — I just take my cut.',
  },
  {
    title: 'Harbor Lights',
    pay: 750,
    intro: 'One last run, then the harbour is yours. Lift a package from the far marina, hold it while the whole watch comes down on you — sixty seconds at four stars — then bring it to my pier, lit and waiting.',
    stages: [
      { kind: 'pickup', label: 'Pick up the package at the far marina', x: CITY.width - 180, y: CITY.height - 330 },
      { kind: 'survive', label: 'Hold the package — survive 60s at four stars', x: CITY.width - 180, y: CITY.height - 330, timer: 60 },
      { kind: 'deliver', label: 'Deliver the package to Vesper\u2019s pier', x: CITY.width / 2, y: CITY.height - 190, timer: 90 },
    ],
    outro: 'Sixty seconds against the whole watch and you are still breathing. Harbor Lights, friend — the town is yours now.',
  },
];

// The Sail & Anchor bar: the fixer's corner, north-west waterfront of
// the grid's second row — every "back to Vesper" stage points here.
export const BAR = { x: roadCenterX(1), y: roadCenterY(1) };
for (const mission of STORY) {
  for (const stage of mission.stages) {
    if (stage.x === 0 && stage.y === 0) { stage.x = BAR.x; stage.y = BAR.y; }
  }
}

/** A free-roam job: a pickup and a drop, both on road centres. */
export function makeJob(rng, index) {
  // Every third job is a getaway-driver route: one pickup, three
  // drops, one clock for the whole chain, paid on the total drive.
  if (index % 3 === 2) return makeGetawayJob(rng);
  const colA = rng.int(0, CITY.cols);
  const rowA = rng.int(0, CITY.rows);
  let colB = rng.int(0, CITY.cols);
  let rowB = rng.int(0, CITY.rows);
  if (colA === colB && rowA === rowB) colB = (colB + 2) % (CITY.cols + 1);
  const taxi = index % 2 === 1;
  const dist = Math.hypot(colB - colA, rowB - rowA) * CITY.pitch;
  return {
    title: taxi ? 'Rider pickup' : 'Package drop',
    pay: Math.round(40 + dist / 22),
    stages: [
      { kind: 'pickup', label: taxi ? 'Pick up the rider' : 'Collect the package', x: roadCenterX(colA), y: roadCenterY(rowA) },
      { kind: 'deliver', label: taxi ? 'Drop the rider off' : 'Drop the package off', x: roadCenterX(colB), y: roadCenterY(rowB), timer: Math.round(50 + dist / 26) },
    ],
    outro: taxi ? 'Five stars. The harbour provides.' : 'Signed, sealed, forgotten.',
  };
}

/**
 * A getaway-driver job: one pickup and three drops under a single
 * timer. The timer lives on the pickup stage and world.js lets it
 * run on through the drops (a stage without its own timer keeps the
 * running one), so the whole chain shares one clock. Pay scales
 * with the total route distance, not a single leg.
 */
function makeGetawayJob(rng) {
  const points = [];
  for (let i = 0; i < 4; i += 1) {
    points.push({ col: rng.int(0, CITY.cols), row: rng.int(0, CITY.rows) });
  }
  // Keep consecutive stops apart so the route is a real drive.
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].col === points[i - 1].col && points[i].row === points[i - 1].row) {
      points[i].col = (points[i].col + 2) % (CITY.cols + 1);
    }
  }
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].col - points[i - 1].col, points[i].row - points[i - 1].row) * CITY.pitch;
  }
  const labels = ['Drop off #1', 'Drop off #2', 'Drop off #3'];
  return {
    title: 'Getaway driver',
    pay: Math.round(70 + total / 16),
    stages: [
      {
        kind: 'pickup', label: 'Pick up the getaway package',
        x: roadCenterX(points[0].col), y: roadCenterY(points[0].row),
        timer: Math.round(80 + total / 28),
      },
      ...points.slice(1).map((pt, i) => ({
        kind: 'deliver', label: labels[i],
        x: roadCenterX(pt.col), y: roadCenterY(pt.row),
      })),
    ],
    outro: 'Three drops, one clock, zero witnesses. The harbour provides.',
  };
}

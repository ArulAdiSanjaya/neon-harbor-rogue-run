// The story: four jobs for Vesper Marlowe, the harbour fixer who runs
// errands out of the Sail & Anchor bar, plus the endless street work
// (package drops and rider pickups) that pays between story beats.
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

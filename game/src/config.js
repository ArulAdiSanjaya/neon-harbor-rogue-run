// Neon Harbor: Rogue Run — shared tuning.
//
// One place for the numbers the rest of the game reads: the view, the
// fixed step, the city grid, speeds, the wanted ladder and the palette.
// The city is a grid of blocks separated by two-lane roads, with a
// harbour along the south edge; city.js builds the concrete geometry
// from these figures and world.js simulates inside it.

export const VIEW = { width: 1280, height: 800 };
export const STEP = 1 / 60;

// City grid: COLS x ROWS blocks. Each block is BLOCK wide, roads are
// ROAD wide, so one grid cell is PITCH. The harbour water starts at
// WATER_Y and the waterfront road runs just above it.
export const CITY = {
  cols: 6,
  rows: 5,
  block: 250,
  road: 92,
  get pitch() { return this.block + this.road; },
  get width() { return this.cols * this.pitch + this.road; },
  get height() { return this.rows * this.pitch + this.road; },
};
export const WATER_Y = CITY.height - 150;

// Pay-n-spray: a waterfront garage bay on the row-4 road, east end.
// Drive in while wanted with at least SPRAY.price in pocket: the car
// is repaired to full health and exactly one wanted star is lost.
export const SPRAY = {
  price: 80,
  x: 5 * CITY.pitch + CITY.road / 2,
  y: 4 * CITY.pitch + CITY.road / 2,
  radius: 46,
  cooldown: 3, // seconds before the bay can charge again
};

// Police roadblocks: how far ahead of the player one is thrown up,
// how far past it counts as escaping, and how much punishment the
// striped barricade takes before it is smashed flat.
export const ROADBLOCK = {
  ahead: 400,
  // How far past the block's centre counts as escaping it. Kept
  // under the 69px of road the city clamp leaves beyond a block
  // spawned at the map's edge, so the escape is always reachable.
  clearPast: 40,
  barricadeHealth: 50,
  respawnCooldown: 8, // seconds after one clears before another goes up
};

// Mission 5's survive stage: hold this many stars for this long.
// `heat` sits midway into that star band, so the flare-up survives
// the first unseen seconds before the watch closes in.
export const SURVIVE = { seconds: 60, stars: 4, heat: 102 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  runSpeed: 252,
  health: 100,
};

export const CAR = {
  radius: 21,
  accel: 340,
  reverseAccel: 190,
  maxSpeed: 430,
  maxReverse: 150,
  turnRate: 2.6,      // radians per second at full lock and speed
  handbrakeTurn: 4.4,
  health: 100,
};

export const POLICE = {
  maxSpeed: 452,
  accel: 360,
  sightRange: 430,
  bustRadius: 54,
  bustSeconds: 2.4,
};

// Wanted ladder: heat points buy stars; each star keeps that many
// police cars hunting. Heat fades while no officer has seen the
// player for a while.
export const WANTED = {
  starHeat: [0, 12, 30, 55, 85, 120],
  decayDelay: 6,      // unseen seconds before heat starts fading
  decayRate: 3.2,     // heat points per second while unseen
  crime: {
    stealCar: 10,
    hitCar: 6,
    hitPed: 16,
    shotFired: 4,
    hitPolice: 14,
    missionSpice: 26,
  },
};

export const COLORS = {
  asphalt: '#363b44',
  laneMark: '#c8b25a',
  sidewalk: '#62676f',
  curb: '#6d727b',
  grass: '#3d6b46',
  water: '#173d5c',
  waterDeep: '#123049',
  player: '#ffd94a',
  policeBody: '#e8ecf2',
  policeTrim: '#2456c8',
  marker: '#ffcf3f',
  markerAlt: '#3fd2ff',
  health: '#58d977',
  heat: '#ff5348',
};

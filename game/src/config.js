// Neon Harbor: Rogue Run — shared tuning.
//
// One place for the numbers the rest of the game reads: the view, the
// fixed step, the city grid, speeds, the wanted ladder, police
// roadblocks and the palette. The city is a grid of blocks separated
// by two-lane roads, with a harbour along the south edge; city.js
// builds the concrete geometry from these figures and world.js
// simulates inside it.

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

// Police roadblocks: at four stars and up the watch periodically
// blocks the road ahead of a moving driver — two police cars parked
// across the lanes and a striped barricade between them. The cars
// are ordinary police cars with ordinary physics, so the block is an
// obstacle, not a wall: ram it, push a car aside, or route around.
// A block lifts when the heat drops below four stars or the driver
// gets well clear of it.
export const ROADBLOCK = {
  minStars: 4,
  interval: 14,     // seconds between blocks while the heat holds
  aheadDist: 420,   // how far ahead of the driver the block is set
  clearDist: 950,   // block lifts once the driver is this far away
};

export const COLORS = {  asphalt: '#363b44',
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
  raceGate: '#ff4fd8',
  raceCheckpoint: '#3fd2ff',
  crewJax: '#ff8a3c',
  crewLena: '#3fd2ff',
  crewMarcus: '#ff5348',
  taxi: '#ffd94a',
  taxiVip: '#ff4fd8',
  taxiMeter: '#7dff6a',
};

// Street races: illegal circuits run from the marina gate. A race is
// a countdown, then checkpoints in order; finishing first pays the
// circuit prize and banks a best time. Racing is a crime — the heat
// climbs while the flag is out, so a win can still end in a chase.
export const RACE = {
  countdownSeconds: 3,
  checkpointRadius: 85,   // generous: checkpoints sit on road centres
  prizes: { harbor: 150, downtown: 250, marina: 400, nightmarket: 300 },
  rivalSpeed: 255,        // rivals are quick, not unbeatable
  rivalCatchup: 285,      // a rival behind the player pushes a little harder
  heatPerSecond: 1.1,     // illegal street racing buys heat while racing
  gateRadius: 70,         // how close (in a car) to start a race
  secondPlaceShare: 0.5,  // 2nd pays half the prize, 3rd a quarter
  thirdPlaceShare: 0.25,
};

// Cab work: the harbour's riders hail a car with its cab light on.
// A fare is a waiting rider, a meter that ticks with the distance
// driven, and a tip graded on speed and a smooth ride — a crash
// while a rider is aboard costs tip, and a VIP pays double but
// keeps a clock. Racing with a rider aboard is not done: the rider
// bails the moment the flag goes up. The cab light (T) is on by
// default; switch it off and the riders stop hailing.
export const TAXI = {
  baseFare: 12,            // dollars on the meter the moment a rider boards
  perDistance: 1,          // extra dollar per this many units driven with a rider
  perDistanceUnits: 120,
  pickupRadius: 64,        // how close (in a car) to board a waiting rider
  dropoffRadius: 52,       // how close to the destination to end the fare
  spawnDelay: 6,           // seconds after a fare ends before the next rider hails
  maxWait: 150,            // a waiting rider gives up and walks off after this long
  vipEvery: 5,             // every Nth fare is a VIP: double fare, timed
  vipTimePerUnit: 0.055,   // seconds of VIP clock per unit of route distance
  vipMinTime: 45,          // VIP clock never shorter than this
  tipBase: 6,              // a perfect ride tips this much, before grading
  tipSpeedBonus: 10,       // extra tip for beating the rider's par time
  tipCrashCut: 4,          // dollars of tip lost per crash with a rider aboard
  parSpeed: 250,           // units per second the rider's par time assumes
  ratingSmooth: 5,         // crashes allowed before the ride stops being 5 stars
  nightMultiplier: 1.5,    // night fares pay half again — the harbour rides after dark
  lightOn: true,           // the cab light starts on: riders hail
};

// Crew: three specialists who hang out around town and join for a
// one-off hire fee. Each levels up once per mission finished while
// hired (max level 5); every perk scales with level, so a veteran
// crew is worth far more than the hire price.
export const CREW = {
  maxLevel: 5,
  hireRadius: 64,         // how close (on foot) to hire
  followDistance: 52,     // how far behind the player a follower trails
  followSpeed: 265,       // followers keep up with a running player
  mechanicRegen: 1.4,     // car health per second, per mechanic level
  mechanicCrashCut: 0.08, // crash damage cut, per mechanic level
  driverTopSpeed: 20,     // extra car top speed, per driver level
  driverTurnBonus: 0.12,  // extra turn rate, per driver level
  driverHeatCut: 0.22,    // faster heat decay, per driver level
  shooterDamage: 0.25,    // extra gun damage, per shooter level
  shooterFleeBonus: 45,   // extra ped flee radius, per shooter level
};

// Harbor Heist League: six multi-stage heists planned on the board
// at the warehouse. A stage completes by standing in its ring
// (case/grab hold timers), driving the getaway ring inside the
// clock, or pressing E at a fence spot to sell the goods.
export const HEIST = {
  stageRadius: 70,        // how close (on foot or in a car) to a stage ring
  fenceRadius: 80,        // how close (on foot) to a fence spot to sell
  hotGetawayHeat: 8,      // extra heat when the getaway clock runs out
  rivalSuccessBump: 8,    // rival attention gained per fenced heist
  caseHoldSeconds: 2,     // seconds held at each of the three casing points
  boardKey: 'KeyJ',       // planning board toggle, near the warehouse
};

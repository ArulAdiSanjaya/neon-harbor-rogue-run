// Harbor Heist League — the chain story: the fixer, the ranks, the
// words. The Broker runs the League from a back room above the
// warehouse; every heist opens with their briefing and closes with
// their verdict, and the League's reputation titles mark how far a
// crew has climbed. Nothing here touches the simulation — it is
// data and pure helpers the heist system and the board read.

export const LEAGUE_FIXER = 'THE BROKER — heist league fixer';

// Reputation titles: the rank the board shows and the HUD chip
// carries. Each title needs the rep of the heists before it.
export const LEAGUE_RANKS = [
  { rep: 0, title: 'Lookout' },
  { rep: 100, title: 'Runner' },
  { rep: 300, title: 'Crew Hand' },
  { rep: 600, title: 'Crew Chief' },
  { rep: 1000, title: 'Harbor Shark' },
  { rep: 1550, title: 'Harbor Legend' },
];

export function leagueRank(rep) {
  let current = LEAGUE_RANKS[0];
  let next = null;
  for (let i = 0; i < LEAGUE_RANKS.length; i += 1) {
    if (rep >= LEAGUE_RANKS[i].rep) {
      current = LEAGUE_RANKS[i];
      next = LEAGUE_RANKS[i + 1] || null;
    }
  }
  return {
    title: current.title,
    next: next ? next.title : null,
    nextRep: next ? next.rep : null,
    progress: next ? (rep - current.rep) / (next.rep - current.rep) : 1,
  };
}

// The Broker's briefings and verdicts, one pair per heist. The intro
// plays when the heist starts; the outro plays when it is fenced.
export const LEAGUE_BRIEFINGS = {
  'dockside-smash': {
    intro: 'First job, small money. Case the dock shed, lift the synth-glass, and do not make me regret vouching for you.',
    outro: 'Clean for a first-timer. The shed crew will not miss crates they never counted. You are in the League now.',
  },
  'neon-vault': {
    intro: 'The sign shop keeps a week of takings in a vault behind the counter. Case it quiet, grab it quick, and drive like the watch is already behind you.',
    outro: 'Neon money spends just as well in the dark. Midtown is talking about you — keep it that way.',
  },
  'marina-yacht': {
    intro: 'A white yacht, a careless owner, a safe full of chips. The marina gate is the only way in by car — mind the water, it does not forgive.',
    outro: 'The yacht set sail this morning with an empty safe and a very confused owner. Beautiful work.',
  },
  'tower-penthouse': {
    intro: 'North-east towers, top floor, a penthouse full of art and a wallet full of coin. The lift is watched; the stairs are not. Bring a driver.',
    outro: 'The penthouse is redecorated — by absence. The Brokerage approves of your taste.',
  },
  'harbor-vault': {
    intro: 'The Harbourmaster vault. Bonds, bearer, no names. This is the job that makes a crew, and the one that breaks them. Case it twice.',
    outro: 'Bearer bonds, no names, no trail. The harbour belongs to whoever dares to take it. That is you, tonight.',
  },
  'golden-tide': {
    intro: 'The Golden Tide casino boat. The whole float, one night, one crew. The Gull Kings have tried twice and failed twice. Do not be the third failure.',
    outro: 'The float is ours. The Gull Kings are done in this harbour, and the League has a new Legend. Spend it well.',
  },
};

// The League's rules, printed on the board so a new runner knows
// the shape of the game before the first job.
export const LEAGUE_RULES = [
  'CASE the target (stand in the ring), GRAB the goods (heat rises),',
  'drive the GETAWAY to the ring before the clock dies, then FENCE',
  'the loot at a buyer. Busted or wasted mid-job loses the goods.',
  'Crew roles: Driver stretches the clock, Lookout cools the heat,',
  'Muscle grabs faster and lifts 10% more. The Gull Kings notice',
  'every success — rival attention raises the heat on later jobs.',
];

// One-line chain progress for the board footer and the pause panel.
export function chainSummary(heist) {
  const done = heist.completed.length;
  const total = 6;
  const rank = leagueRank(heist.rep);
  const next = done < total
    ? `Next: ${['Dockside Smash', 'Neon Vault', 'Marina Yacht Lift', 'Tower Penthouse', 'Harbor Vault', 'Golden Tide'][done]}`
    : 'League complete — Harbor Legend';
  return `${done}/${total} heists fenced · ${heist.rep} rep · ${rank.title} · ${next}`;
}

// The Broker's planning tip per heist, shown under the selected
// job on the board — the one thing a runner should know before
// starting that particular job.
export const HEIST_TIPS = {
  'dockside-smash': 'Tip: your first job — no crew needed, just walk the three casing points.',
  'neon-vault': 'Tip: the vault is midtown; case it on foot, grab it, and do not linger.',
  'marina-yacht': 'Tip: the marina is a dead end by water — know the getaway ring before you grab.',
  'tower-penthouse': 'Tip: bring Lena. The getaway is the longest in the League.',
  'harbor-vault': 'Tip: bring the full crew. The grab heat here wakes the whole harbour.',
  'golden-tide': 'Tip: the finale. Full crew, clean car, and fence the moment the clock allows.',
};

// The Broker's stage lines: one spoken line per heist per act, so
// a runner hears the plan change as the job moves — casing, then
// the grab, then the wheel, then the money.
export const LEAGUE_STAGE_LINES = {
  'dockside-smash': {
    case: 'Walk the shed twice. Count the doors, count the guards, count the cameras.',
    grab: 'Now. Lift it all and do not stop to admire the glass.',
    getaway: 'Ring is north-east. Drive like the shed is already on fire.',
    fence: 'Marla pays fair for glass. Do not let the Dockside man talk you down.',
  },
  'neon-vault': {
    case: 'The vault is behind the counter. The clerk leaves at noon — be the noon.',
    grab: 'A week of takings. Take the week.',
    getaway: 'North-west ring. The neon will light your way out.',
    fence: 'Neon money spends best at night. Marla or the Dockside man — your call.',
  },
  'marina-yacht': {
    case: 'The yacht, the white one. The crew drinks at the pier bar after six.',
    grab: 'Chips and a watch. The safe is under the bunk — mind the dog.',
    getaway: 'Ring is north. The marina gate is the only way out by car.',
    fence: 'Yacht money is clean-ish. The Tower Broker likes it best.',
  },
  'tower-penthouse': {
    case: 'Top floor, north-east towers. The lift is watched; the stairs are not.',
    grab: 'Art and a wallet. The art is heavy — the wallet is not.',
    getaway: 'South-west ring. Long drive, long odds. Bring Lena.',
    fence: 'Penthouse money wants the Tower Broker. He pays for taste.',
  },
  'harbor-vault': {
    case: 'The Harbourmaster vault. Case it twice — this is the job that makes a crew.',
    grab: 'Bearer bonds, no names. Take them all and take them quiet.',
    getaway: 'South-east ring. The whole harbour will be awake for this one.',
    fence: 'Bonds go to the Tower Broker. Ten percent and no questions.',
  },
  'golden-tide': {
    case: 'The casino boat. The Kings tried twice and failed twice. Learn from them.',
    grab: 'The whole float. One night, one crew. Do not be the third failure.',
    getaway: 'South-east ring. Drive like the tide is chasing you — it is.',
    fence: 'The float is ours. Any buyer will pay — pick the one who fears you least.',
  },
};

// What the Broker says when a runner abandons a live heist.
export const LEAGUE_ABANDON_LINES = [
  'Walked away, did you? The League remembers the ones who finish.',
  'Abandoned. The goods stay where they are — and so does the shame.',
  'The Broker does not chase runners who quit. The Kings might.',
];

// The rival crew's taunts, shown when their attention spikes.
export const RIVAL_TAUNTS = [
  'The Gull Kings are watching your little League.',
  'Word travels fast on this harbour. Too fast.',
  'The Kings do not share the water. Remember that.',
  'A little bird told the watch where to look tonight.',
];

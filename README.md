[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ArulAdiSanjaya/neon-harbor-rogue-run/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ArulAdiSanjaya/neon-harbor-rogue-run/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Harbor: Rogue Run

An original top-down open-world crime game for the desktop browser,
written in plain JavaScript with no libraries and no build step. Neon
Harbor is a neon-lit port city of six-by-five blocks, a park, and a
working waterfront. You are a new runner in town: walk the streets,
steal cars, run errands for Vesper Marlowe — the harbour fixer who
holds court at the Sail & Anchor bar — and stay ahead of the harbour
watch, whose patience is measured in five gold stars.

## Play

Open `game/index.html` from any static file server (or run the entry
program below and serve the output) in a desktop browser. It plays
fully offline; every sound — engine, skid, siren, gunshot, the
mission sting — is synthesised live with WebAudio.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk / drive |
| Shift | Run (on foot) |
| E or F | Enter / exit a car, talk to Vesper, take a job, hire crew (on foot at a hangout), start a race (in a car at the marina gate) |
| Mouse | Aim |
| Click (hold) | Fire the pistol (shove when point-blank) |
| Space | Handbrake while driving |
| C | Toggle minimap zoom (whole city / close-up) |
| P or Esc | Pause |
| M | Sound on / off |
| Enter | Start / restart |

## How it plays

- **The city.** A scrolling road grid with traffic that follows the
  lanes, pedestrians who stroll the sidewalks and flee from gunfire
  and fast cars, buildings with real collision, a park, streetlights
  and neon signs, and a harbour with a pier along the south edge. Day
  rolls into a lit-window night and back.
- **Cars.** Parked and moving cars can all be taken. Driving is
  arcade physics — acceleration, speed-sensitive steering, handbrake
  turns — and every car has health: walls and rivals dent it, and a
  wreck with you inside ends the run.
- **Wanted.** Stealing cars, collisions, hitting pedestrians and
  gunfire all add heat. Heat buys stars (0–5); each star puts another
  harbour-watch car on you. Officers pursue, ram and try to pin you —
  stay slow with one on top of you and the bust meter fills. Break
  sight for a while and the heat fades. At four stars and up the watch
  also sets **roadblocks**: two police cars parked across the road
  ahead of you with a striped barricade between them. They are
  ordinary police cars — ram one, push it aside, or route around —
  and a block lifts when the heat drops below four stars or you get
  well clear of it.
- **Spray shop.** A garage bay on the waterfront road (east end, by
  the harbour). Drive in while wanted with at least $80 and the shop
  repaints the car — full repair — and buys off one star of heat for
  $80, with a cash-register sting. It never charges on foot, and when
  you are short it just says so.
- **Crew.** Three specialists wait at ringed hangouts around the
  city — press **E on foot** near one to hire them for a one-off fee.
  **Jax "Wrench" Calloway** (Mechanic, $150) slowly repairs your car
  and cuts crash damage; **Lena "Ghost" Voss** (Driver, $250) raises
  your car's top speed and handling and makes heat decay faster;
  **Marcus "Boom" Reid** (Shooter, $200) raises gun damage and makes
  pedestrians flee gunfire from further away. A hired member trails
  you on foot (coloured ring + initial) and **levels up once per
  mission finished while hired** (max Lv5) — every perk scales with
  level. Hired members and levels are saved with your money.
- **Street races.** A checkered gate on the waterfront road by the
  marina pier runs three illegal circuits — **Harbor Loop** (4
  checkpoints, $150), **Downtown Sprint** (5, $250) and **Marina
  Grand Tour** (6, $400). Drive up **in a car and press E** to start
  the next circuit (the gate cycles through them); on foot it just
  tells you to bring a car. A 3-2-1 countdown, then checkpoints in
  order against two rival cars, with live 1st/2nd/3rd position,
  a wrong-way warning, and a finish banner with your time, prize
  and best time (best times are saved). Winning pays the full
  prize, 2nd pays half, 3rd a quarter — and racing is illegal, so
  heat climbs while the flag is out.
- **Missions.** Vesper's story runs five jobs — *First Errand*, *Hot
  Delivery*, *Loud Exit*, *The Gilded Coupe* and the finale *Harbor
  Lights* ($750): lift a package from the far marina, hold it while
  the whole watch hunts you at four stars for sixty seconds, then
  deliver it to her pier — pickups, timed deliveries, a
  shake-the-heat escape and a finale theft, told through her dialogue
  at the Sail & Anchor. After Vesper's five, **Dario Voss** of the
  northside offers three more — *The Audition* ($300: win the Harbor
  Loop, then deliver his invite up north), *Crew Up* ($400: collect
  three crew stashes cached around the harbour, then deliver them)
  and *The Grand Tour* ($650: win the Marina Grand Tour, then shake
  the heat). A lost race never fails a mission — re-enter at the gate
  and try again. Between and after story jobs the bar offers
  endless street work: package drops, rider pickups, and every third
  job a **getaway-driver** route — one pickup, three drops, one clock
  for the whole chain, paid on the total drive. Money and your place
  in the ledger are saved in `localStorage`, so a busted or wasted run
  keeps what you earned.
- **HUD.** Health (or car health), money, weapon, wanted stars and
  the bust meter, the current objective with its timer, speed while
  driving, and a live minimap showing roads, traffic, police, the
  spray shop, roadblocks, you and the objective, with an edge arrow
  pointing the way. Press **C** to zoom the minimap into a close-up
  around the player, with a legend; press it again for the whole city.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` and writes the
`dossier.json` hand-in with the vendored make.fun library. To play
locally without the hand-in, `node serve.ts` serves `game/` at
http://localhost:8080.

## Layout

- `game/` — the game itself: `index.html` plus ES modules under
  `src/` (`config.js` tuning, `random.js` the seeded generator,
  `city.js` the city geometry, collision and the spray-shop bay,
  `missions.js` Vesper's story and the job generator, `world.js` the
  fixed-step simulation — player, cars, traffic, pedestrians, police,
  wanted, roadblocks, the spray shop, combat, missions — `audio.js`
  the WebAudio synth, `render.js` all drawing, the HUD and the
  minimap, `shots.js` the deterministic screenshot scenes behind
  `?shot=title|onfoot|chase|mission|race&seed=<n>`, and `main.js` the boot,
  screens and save). `crew.js` is the recruitable-crew system and
  `races.js` the street-race circuits, rivals and state machine.
- `screenshots/` — four real renders of the game in a browser, staged
  by `shots.js` from fixed seeds: the title over the demo city, the
  runner on foot mid-errand, a three-star pursuit with the bust meter
  filling, and a night delivery under its timer.
- `main.ts` — the hand-in program described above.
  `vendor/makefun-game.ts` is the make.fun kit's copy, unchanged.

## License

MIT — see `LICENSE`.

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

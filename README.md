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
| E or F | Enter / exit a car, talk to Vesper, take a job |
| Mouse | Aim |
| Click (hold) | Fire the pistol (shove when point-blank) |
| Space | Handbrake while driving |
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
  sight for a while and the heat fades.
- **Missions.** Vesper's story runs four jobs — *First Errand*, *Hot
  Delivery*, *Loud Exit* and *The Gilded Coupe* — pickups, timed
  deliveries, a shake-the-heat escape and a finale theft, told through
  her dialogue at the Sail & Anchor. Between and after story jobs the
  bar offers endless street work: package drops and rider pickups,
  paid by distance. Money and your place in the ledger are saved in
  `localStorage`, so a busted or wasted run keeps what you earned.
- **HUD.** Health (or car health), money, weapon, wanted stars and
  the bust meter, the current objective with its timer, speed while
  driving, and a live minimap showing roads, traffic, police, you and
  the objective, with an edge arrow pointing the way.

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
  `city.js` the city geometry and collision, `missions.js` Vesper's
  story and the job generator, `world.js` the fixed-step simulation —
  player, cars, traffic, pedestrians, police, wanted, combat,
  missions — `audio.js` the WebAudio synth, `render.js` all drawing,
  the HUD and the minimap, `shots.js` the deterministic screenshot
  scenes behind `?shot=title|onfoot|chase|mission&seed=<n>`, and
  `main.js` the boot, screens and save).
- `screenshots/` — four real renders of the game in a browser, staged
  by `shots.js` from fixed seeds: the title over the demo city, the
  runner on foot mid-errand, a three-star pursuit with the bust meter
  filling, and a night delivery under its timer.
- `main.ts` — the hand-in program described above.
  `vendor/makefun-game.ts` is the make.fun kit's copy, unchanged.

## License

MIT — see `LICENSE`.

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

// Neon Harbor: Rogue Run — a make.fun gta6-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: a top-down open-world crime game that runs
// from plain static files in a desktop browser, fully offline — a neon harbour city of
// six-by-five blocks to cross on foot or by stolen car, traffic and pedestrians, a
// five-star wanted ladder with harbour-watch police who pursue and bust (and seal
// roads with rammable roadblocks at four and five stars), pistol combat,
// five story missions for the fixer Vesper Marlowe plus endless free-roam jobs —
// including chained three-drop getaway-driver runs on one shared clock — a
// waterfront spray shop that repaints and repairs for $80 and drops a star,
// a HUD with a live minimap (C zooms it, with a legend), and progress (money
// and the mission ledger) saved in localStorage.
// It is all original: its own city, names, story and flat-colour art, and every sound is
// synthesised live with WebAudio — no libraries, no assets, no network requests.
//
// This program hands the entry in. It copies game/ and screenshots/ from beside this file
// to /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library (vendor/makefun-game.ts, the kit's copy, unchanged).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (!existsSync(join(out, 'game', 'index.html'))) {
  throw new Error('hand-in is missing game/index.html — the game would not open');
}
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

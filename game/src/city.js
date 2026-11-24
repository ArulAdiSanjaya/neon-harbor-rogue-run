// Neon Harbor's city geometry, built once from a seed.
//
// The grid: vertical and horizontal roads cross at intersections;
// between them sit blocks. Most blocks are subdivided into two to four
// buildings with alleys between them; one block is a park, one is the
// harbour plaza, and the south strip below WATER_Y is water with a
// wooden pier. Buildings are plain rectangles — collision, rendering
// and the minimap all read the same list, so what you see is what you
// hit. Roads are described by their centre lines, which traffic,
// pedestrians and the minimap all share.

import { CITY, WATER_Y } from './config.js';
import { makeRng } from './random.js';

const BUILDING_COLORS = [
  '#7a4a3a', '#5d6d7e', '#8a6d4b', '#4f5e5a', '#74584f', '#66707c',
  '#8c5a68', '#54687a', '#77694f', '#5f7a6a', '#6e5a7e', '#7e6248',
];
const ROOF_COLORS = [
  '#5d3a2e', '#46545f', '#6d5638', '#3d4b47', '#5a423c', '#525c66',
  '#6e4652', '#425262', '#5c5139', '#4b6255', '#554664', '#63503a',
];
export const CAR_COLORS = [
  '#c8433c', '#3c78c8', '#e0a83c', '#57a05a', '#b0b6bd', '#7a4fa0',
  '#3fb0a5', '#d06ba8', '#e8e8e8', '#40454d', '#e07b39', '#8fa63f',
];

export function roadCenterX(col) { return col * CITY.pitch + CITY.road / 2; }
export function roadCenterY(row) { return row * CITY.pitch + CITY.road / 2; }

// The spray shop bay: the waterfront road's east end, where the
// harbour road meets the marina — a garage bay painted on the road
// itself, so a wanted driver can duck in without leaving the tarmac.
export const SPRAY_SHOP = { col: 5, row: 4 };
export function sprayShopPoint() {
  return { x: roadCenterX(SPRAY_SHOP.col), y: roadCenterY(SPRAY_SHOP.row) };
}

export function buildCity(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const signs = [];

  const parkCol = rng.int(1, CITY.cols - 2);
  const parkRow = rng.int(0, 1);

  for (let col = 0; col < CITY.cols; col += 1) {
    for (let row = 0; row < CITY.rows; row += 1) {
      const bx = col * CITY.pitch + CITY.road;
      const by = row * CITY.pitch + CITY.road;
      const isPark = col === parkCol && row === parkRow;
      const isPlaza = row === CITY.rows - 1; // waterfront block: open plaza + low sheds
      if (isPark) {
        for (let i = 0; i < 14; i += 1) {
          trees.push({ x: bx + rng.range(24, CITY.block - 24), y: by + rng.range(24, CITY.block - 24), r: rng.range(13, 22) });
        }
        continue;
      }
      if (isPlaza) {
        // Two low harbour sheds leave the plaza open for the finale.
        buildings.push(makeBuilding(bx + 12, by + CITY.block - 92, 96, 62, rng));
        buildings.push(makeBuilding(bx + CITY.block - 108, by + CITY.block - 92, 96, 62, rng));
        continue;
      }
      const split = rng.int(2, 4);
      if (split === 2) {
        const w = (CITY.block - 18) / 2;
        buildings.push(makeBuilding(bx + 4, by + 4, w, CITY.block - 8, rng));
        buildings.push(makeBuilding(bx + 14 + w, by + 4, w, CITY.block - 8, rng));
      } else if (split === 3) {
        const w = (CITY.block - 28) / 3;
        for (let i = 0; i < 3; i += 1) buildings.push(makeBuilding(bx + 4 + i * (w + 10), by + 4, w, CITY.block - 8, rng));
      } else {
        const w = (CITY.block - 18) / 2;
        const h = (CITY.block - 18) / 2;
        for (let i = 0; i < 2; i += 1) {
          for (let j = 0; j < 2; j += 1) buildings.push(makeBuilding(bx + 4 + i * (w + 10), by + 4 + j * (h + 10), w, h, rng));
        }
      }
    }
  }

  // Streetlights at every intersection corner, neon signs on some walls.
  for (let col = 0; col <= CITY.cols; col += 1) {
    for (let row = 0; row <= CITY.rows; row += 1) {
      lamps.push({ x: roadCenterX(col) - CITY.road / 2 + 8, y: roadCenterY(row) - CITY.road / 2 + 8 });
      lamps.push({ x: roadCenterX(col) + CITY.road / 2 - 8, y: roadCenterY(row) + CITY.road / 2 - 8 });
    }
  }
  const signWords = ['RAMEN', 'HOTEL', '24H', 'PAWN', 'TATTOO', 'CLUB NIX', 'NOODLE', 'GYM', 'LIQUOR', 'ARCADE'];
  for (const b of buildings) {
    if (rng.chance(0.3)) {
      signs.push({
        x: b.x + b.w / 2, y: b.y + 14,
        text: rng.pick(signWords),
        color: rng.pick(['#ff4fd8', '#3fd2ff', '#ffd94a', '#7dff6a', '#ff7a4f']),
      });
    }
  }

  // The pier: planks reaching into the harbour from the plaza row.
  const pier = { x: CITY.width / 2 - 34, y: WATER_Y, w: 68, h: 130 };

  return {
    buildings, trees, lamps, signs, pier,
    width: CITY.width, height: CITY.height, waterY: WATER_Y,
    park: { col: parkCol, row: parkRow },
  };
}

function makeBuilding(x, y, w, h, rng) {
  const idx = rng.int(0, BUILDING_COLORS.length - 1);
  return {
    x, y, w, h,
    color: BUILDING_COLORS[idx],
    roof: ROOF_COLORS[idx],
    floors: Math.max(2, Math.round(h / 34)),
    seed: rng.int(1, 99999),
  };
}

/** Is the point inside any building (with a margin)? */
export function pointInBuilding(city, x, y, margin = 0) {
  for (const b of city.buildings) {
    if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin) return b;
  }
  return null;
}

/**
 * Push a circle at (x, y) out of every building it overlaps and out of
 * the water (unless on the pier). Mutates and returns the position;
 * `hit` reports the strongest overlap depth so callers can price a
 * collision by how hard it was.
 */
export function collideCircle(city, pos, radius) {
  let hit = 0;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - nx;
    const dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.y = ny + (dy / d) * radius;
        hit = Math.max(hit, radius - d);
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = b.x - radius;
        else if (min === right) pos.x = b.x + b.w + radius;
        else if (min === top) pos.y = b.y - radius;
        else pos.y = b.y + b.h + radius;
        hit = Math.max(hit, radius);
      }
    }
  }
  if (pos.y > city.waterY - radius) {
    const onPier = pos.x > city.pier.x - radius && pos.x < city.pier.x + city.pier.w + radius
      && pos.y < city.pier.y + city.pier.h;
    if (!onPier) {
      pos.y = city.waterY - radius;
      hit = Math.max(hit, 2);
    }
  }
  pos.x = Math.max(radius, Math.min(city.width - radius, pos.x));
  pos.y = Math.max(radius, Math.min(city.height - radius, pos.y));
  return hit;
}

/** Nearest road centre lines to a point — traffic and walkers snap to these. */
export function nearestRoadX(x) {
  const col = Math.round((x - CITY.road / 2) / CITY.pitch);
  return roadCenterX(Math.max(0, Math.min(CITY.cols, col)));
}
export function nearestRoadY(y) {
  const row = Math.round((y - CITY.road / 2) / CITY.pitch);
  return roadCenterY(Math.max(0, Math.min(CITY.rows, row)));
}

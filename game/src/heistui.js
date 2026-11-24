// Harbor Heist League — drawing only. The world-space markers
// (warehouse board, fence spots, the live stage ring), the HUD chip
// (rank, rep, live stage, loot in hand, rival attention) and the
// full planning board panel (press J near the warehouse, or E on
// foot). Everything here reads the world and paints pixels; nothing
// here steps the simulation or touches the DOM.

import { VIEW } from './config.js';
import { FENCE_SPOTS, HEIST_BOARD } from './city.js';
import { HEIST_DEFS } from './heists.js';
import { allFenceOffers, boardMapPoints } from './heistjobs.js';
import { HEIST_TIPS, LEAGUE_RULES, chainSummary } from './heistchain.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const GOLD = '#ffcf3f';
const CYAN = '#3fd2ff';
const RED = '#ff5348';
const GREEN = '#58d977';
const PANEL = '#10151f';
const PANEL_EDGE = '#2a3345';
const DIM = 'rgba(6, 8, 14, 0.72)';

function text(ctx, str, x, y, size, color, align = 'left', bold = false) {
  ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function pulse(world, speed = 3) {
  return 0.5 + 0.5 * Math.sin(world.time * speed);
}

// ---------------------------------------------------------- world markers

/** Warehouse board, fence spots and the live stage ring, in world space. */
export function drawHeistMarkers(ctx, world) {
  // The planning board: a gold diamond over the warehouse door.
  const b = HEIST_BOARD;
  const bob = Math.sin(world.time * 2) * 4;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-11, -11, 22, 22);
  ctx.strokeStyle = '#0b0e14';
  ctx.lineWidth = 2;
  ctx.strokeRect(-11, -11, 22, 22);
  ctx.restore();
  text(ctx, 'HEIST', b.x, b.y - 26 + bob, 13, GOLD, 'center', true);

  // Fence spots: green dollar flags where buyers wait.
  for (const spot of FENCE_SPOTS) {
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 10, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '$', spot.x, spot.y + 5, 13, '#0b0e14', 'center', true);
  }

  // The live stage ring: a pulsing circle on the current target.
  const heist = world.heist;
  if (heist && heist.active) {
    const target = heist.stageTarget();
    if (target) {
      const r = 46 + pulse(world, 4) * 8;
      ctx.strokeStyle = heist.stageKind() === 'getaway' ? CYAN : GOLD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 207, 63, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(target.x, target.y, r + 10, 0, Math.PI * 2);
      ctx.stroke();
      const label = heist.stageLabel();
      // Keep the label on the map: stage rings on the outer roads
      // sit 46px from the world's edge, so an unclamped label would
      // run off the left or top of the screen at the map's corners.
      const labelX = Math.max(80, Math.min(world.city.width - 80, target.x));
      const labelY = Math.max(16, target.y - r - 12);
      text(ctx, label, labelX, labelY, 13, '#ffffff', 'center', true);
    }
  }
}

// ------------------------------------------------------------------- HUD

/** The League chip, top-right under the wanted stars: rank, live stage, loot, rivals. */
export function drawHeistHud(ctx, world) {
  const heist = world.heist;
  if (!heist) return;
  const rank = heist.rank();
  const x = VIEW.width - 268;
  let y = 118;
  const w = 252;
  const lines = [];
  lines.push({ str: `LEAGUE · ${rank.title}`, color: GOLD, bold: true });
  lines.push({ str: `${heist.rep} rep · ${heist.completed.length}/6 fenced`, color: '#cfd6e4' });
  if (heist.active) {
    const a = heist.active;
    lines.push({ str: `${a.def.name} — ${heist.stageLabel()}`, color: '#ffffff', bold: true });
    if (heist.stageKind() === 'getaway') {
      const d = Math.hypot(world.player.x - a.ring.x, world.player.y - a.ring.y);
      lines.push({ str: `Ring ${Math.round(d)}m · ${Math.max(0, a.getawayT).toFixed(0)}s left`, color: a.getawayT < 12 ? RED : CYAN });
    }
    if (heist.stageKind() === 'case' || heist.stageKind() === 'grab') {
      const need = heist.stageKind() === 'case'
        ? a.def.case.hold : heist.grabHoldSeconds(world, a.def);
      lines.push({ str: `Hold the ring ${Math.max(0, a.holdT).toFixed(1)}s / ${need}s`, color: CYAN });
    }
    if (heist.lootHeld > 0) {
      lines.push({ str: `Goods in hand: $${heist.lootHeld}`, color: GREEN });
    }
  } else if (world.rival && world.rival.attention >= 30) {
    lines.push({ str: `Gull Kings ${world.rival.level()} (${Math.round(world.rival.attention)})`, color: RED });
  }
  const h = 14 + lines.length * 20 + 10;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  let ly = y + 24;
  for (const line of lines) {
    text(ctx, line.str, x + 12, ly, 13, line.color, 'left', Boolean(line.bold));
    ly += 20;
  }
}

// ---------------------------------------------------------- planning board

/** The full planning board overlay: heists, roles, fences, rivals, rules. */
export function drawHeistBoard(ctx, world) {
  const heist = world.heist;
  if (!heist) return;
  const rank = heist.rank();
  const selected = heist.selectedDef();
  const roles = heist.crewRoles(world);
  const offers = allFenceOffers(selected.loot, world);
  const rival = world.rival;

  ctx.fillStyle = DIM;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  const px = 150;
  const py = 60;
  const pw = VIEW.width - 300;
  const ph = VIEW.height - 120;
  ctx.fillStyle = PANEL;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

  let y = py + 44;
  text(ctx, 'HARBOR HEIST LEAGUE', px + 28, y, 26, GOLD, 'left', true);
  text(ctx, `The Broker's board — ${rank.title} · ${heist.rep} rep`, px + 28, y + 24, 14, '#cfd6e4');
  text(ctx, chainSummary(heist), px + pw - 28, y + 24, 13, '#9aa5b8', 'right');
  y += 56;

  // Heist list, left column.
  const listX = px + 28;
  const listW = 430;
  text(ctx, 'HEISTS — 1-6 to select, Enter to start', listX, y, 13, CYAN, 'left', true);
  y += 26;
  for (let i = 0; i < HEIST_DEFS.length; i += 1) {
    const def = HEIST_DEFS[i];
    const done = heist.isCompleted(def);
    const open = heist.isUnlocked(def);
    const isSel = i === heist.selected;
    const rowY = y + i * 34;
    if (isSel) {
      ctx.fillStyle = 'rgba(255, 207, 63, 0.14)';
      ctx.fillRect(listX - 6, rowY - 17, listW, 30);
    }
    const mark = done ? '✓' : (open ? '○' : '×');
    const color = done ? GREEN : (open ? '#ffffff' : '#5a6478');
    text(ctx, `${i + 1}. ${mark} ${def.name}`, listX, rowY + 4, 15, color, 'left', isSel);
    text(ctx, `$${def.loot} · +${def.rep} rep`, listX + listW - 8, rowY + 4, 13, done ? GREEN : '#9aa5b8', 'right');
  }
  y += HEIST_DEFS.length * 34 + 14;

  // Selected heist detail.
  text(ctx, `${selected.name} — ${selected.target}`, listX, y, 15, '#ffffff', 'left', true);
  y += 22;
  text(ctx, `Goods: ${selected.goods} ($${selected.loot}) · Grab heat +${selected.grabHeat} · Getaway ${selected.getawaySeconds}s`, listX, y, 13, '#cfd6e4');
  y += 22;
  text(ctx, 'Stages: CASE → GRAB → GETAWAY → FENCE', listX, y, 13, '#cfd6e4');
  y += 22;
  text(ctx, HEIST_TIPS[selected.id] || '', listX, y, 13, GOLD);
  y += 30;

  // Crew roles, right column.
  const roleX = px + 500;
  text(ctx, 'CREW ROLES (auto-filled from hired crew)', roleX, py + 100, 13, CYAN, 'left', true);
  const roleRows = [
    ['Driver', roles.driver, 'Lena', '+25% getaway clock'],
    ['Lookout', roles.lookout, 'Jax', '−20% grab heat'],
    ['Muscle', roles.muscle, 'Marcus', '−30% grab time, +10% take'],
  ];
  let ry = py + 126;
  for (const [label, member, name, blurb] of roleRows) {
    const filled = member ? `${name} ✓` : `— empty (${name} not hired)`;
    text(ctx, `${label}: ${filled}`, roleX, ry, 14, member ? '#ffffff' : '#9aa5b8', 'left', true);
    text(ctx, blurb, roleX, ry + 18, 12, '#5a6478');
    ry += 42;
  }

  // Fence buyers.
  text(ctx, 'FENCE BUYERS (best for this job first)', roleX, ry + 6, 13, CYAN, 'left', true);
  ry += 32;
  const sorted = [...offers].sort((a, b) => b.payout - a.payout);
  for (const offer of sorted) {
    const line = offer.refused
      ? `${offer.buyer.name}: refuses takes under $${offer.buyer.minLoot}`
      : `${offer.buyer.name}: $${offer.payout} after ${Math.round(offer.buyer.cut * 100)}% cut`;
    text(ctx, line, roleX, ry, 13, offer.refused ? '#5a6478' : '#ffffff');
    ry += 20;
  }

  // Rival attention meter.
  ry += 10;
  text(ctx, `RIVAL CREW — GULL KINGS: ${rival ? rival.level() : 'quiet'}`, roleX, ry, 13, RED, 'left', true);
  ry += 20;
  const meterW = 380;
  const att = rival ? rival.attention / 100 : 0;
  ctx.fillStyle = '#222a38';
  ctx.fillRect(roleX, ry, meterW, 12);
  ctx.fillStyle = att >= 0.8 ? RED : (att >= 0.55 ? '#ff8a3c' : GOLD);
  ctx.fillRect(roleX, ry, Math.round(meterW * att), 12);
  ctx.strokeStyle = PANEL_EDGE;
  ctx.strokeRect(roleX + 0.5, ry + 0.5, meterW, 12);
  text(ctx, `${Math.round((rival ? rival.attention : 0))}% attention`, roleX + meterW + 10, ry + 11, 12, '#9aa5b8');

  // League map sketch: the road grid with the board, the fences,
  // the selected job's target and its getaway ring.
  drawBoardMap(ctx, world, roleX, ry + 28, 380, 84);

  // League rules, bottom — six lines at 17px plus the title need
  // 122px, so the block starts 150px above the panel's foot to
  // leave the footer line clear beneath it.
  let ruleY = py + ph - 150;
  text(ctx, 'THE LEAGUE RULES', px + 28, ruleY, 13, CYAN, 'left', true);
  ruleY += 20;
  for (const rule of LEAGUE_RULES) {
    text(ctx, rule, px + 28, ruleY, 12, '#9aa5b8');
    ruleY += 17;
  }
  text(ctx, 'J close · 1-6 select · Enter start · X abandon active heist', px + 28, py + ph - 18, 13, GOLD, 'left', true);
}

/** The board's strip map: road grid, board, fences, target, getaway ring. */
export function drawBoardMap(ctx, world, x, y, w, h) {
  const heist = world.heist;
  const grid = boardMapPoints();
  const cityW = 2144;
  const cityH = 1802;
  const sx = (wx) => x + (wx / cityW) * w;
  const sy = (wy) => y + (wy / cityH) * h;
  text(ctx, 'LEAGUE MAP — gold: board · green: fences · red: target · cyan: getaway', x, y - 6, 11, '#9aa5b8');
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2a3345';
  ctx.lineWidth = 1;
  for (const cx of grid.cols) {
    ctx.beginPath();
    ctx.moveTo(sx(cx), y);
    ctx.lineTo(sx(cx), y + h);
    ctx.stroke();
  }
  for (const ryy of grid.rows) {
    ctx.beginPath();
    ctx.moveTo(x, sy(ryy));
    ctx.lineTo(x + w, sy(ryy));
    ctx.stroke();
  }
  const dot = (wx, wy, color, r = 4) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(wx), sy(wy), r, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(HEIST_BOARD.x, HEIST_BOARD.y, GOLD, 5);
  for (const spot of FENCE_SPOTS) dot(spot.x, spot.y, GREEN);
  if (heist) {
    const def = heist.selectedDef();
    dot(def.case.x, def.case.y, RED);
    dot(def.getaway.x, def.getaway.y, CYAN);
    if (heist.active) {
      const t = heist.stageTarget();
      if (t) {
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx(t.x), sy(t.y), 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = PANEL_EDGE;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

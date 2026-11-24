// Drawing only: the world and the current screen go in, pixels come
// out. The camera follows world.camX/camY; everything is flat shapes
// with a neon trim, warmer by day and darker with lit windows and
// sign glow at night. The HUD (health, money, stars, mission line,
// speed, roadblock and spray-shop prompts) and the minimap — plain or
// zoomed in on the player with C — are drawn on the same canvas after
// the world, in screen space, so screenshots show the whole game at
// a glance.

import { CITY, COLORS, TAXI, VIEW } from './config.js';
import { CREW_HANGOUTS, RACE_GATE, SPRAY_SHOP, TAXI_DEPOT } from './city.js';
import { CREW_DEFS } from './crew.js';
import { RaceSystem } from './races.js';
import { BAR } from './missions.js';
import { drawHeistHud, drawHeistMarkers } from './heistui.js';
import { drawHeistBoard } from './heistui.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_OVER = 'over';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = { x: 16, y: 0, w: 196, h: 150 }; // y set from VIEW.height

export function drawScene(ctx, world, view) {
  MINIMAP.y = VIEW.height - MINIMAP.h - 16;
  ctx.fillStyle = world.night ? '#0d1524' : '#79a6c8';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const camX = clamp(world.camX - VIEW.width / 2, 0, Math.max(0, world.city.width - VIEW.width));
  const camY = clamp(world.camY - VIEW.height / 2, 0, Math.max(0, world.city.height - VIEW.height));

  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));
  drawCity(ctx, world);
  drawMarker(ctx, world);
  drawCrewHangouts(ctx, world);
  drawRaceGate(ctx, world);
  drawRaceCheckpoints(ctx, world);
  drawTaxiDepot(ctx, world);
  drawTaxi(ctx, world);
  drawHeistMarkers(ctx, world);
  for (const ped of world.peds) drawPed(ctx, world, ped);
  for (const car of world.cars) drawCar(ctx, world, car, false);
  if (world.player.car) drawCar(ctx, world, world.player.car, false);
  for (const cop of world.police) drawCar(ctx, world, cop, true);
  for (const rival of world.race.rivals) drawCar(ctx, world, rival, false);
  if (world.roadblock) drawRoadblock(ctx, world);
  if (!world.player.car) drawPlayer(ctx, world);
  drawCrewFollowers(ctx, world);
  if (world.muzzle && world.time < world.muzzle.until) drawMuzzle(ctx, world);
  ctx.restore();

  if (view.screen === SCREEN_TITLE) { drawTitle(ctx, world, view); return; }
  drawHud(ctx, world, view);
  drawHeistHud(ctx, world);
  if (view.screen === 'board') drawHeistBoard(ctx, world);
  if (view.help) drawHelpPanel(ctx);
  if (view.screen === SCREEN_PAUSE) {
    const pauseLines = ['The harbour holds its breath.', 'P or Esc to resume — Enter to restart'];
    const t = world.taxi.stats;
    if (t.fares > 0) pauseLines.push(`Cab so far: ${t.fares} fares · $${t.earned} earned · best tip $${t.bestTip}`);
    if (world.heist.stats.heists > 0) pauseLines.push(`League so far: ${world.heist.stats.heists} heists fenced · $${world.heist.stats.fenced} fenced · best take $${world.heist.stats.bestTake}`);
    drawPanel(ctx, 'PAUSED', pauseLines, view);
  }
  if (view.screen === SCREEN_OVER) drawOver(ctx, world, view);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------------------------------------------------------------- city

function drawCity(ctx, world) {
  const { city } = world;
  const night = world.night;
  // Blocks' ground: sidewalk slabs under everything.
  ctx.fillStyle = night ? '#3a3f46' : COLORS.sidewalk;
  ctx.fillRect(0, 0, city.width, city.waterY);
  // Roads.
  ctx.fillStyle = night ? '#23262c' : COLORS.asphalt;
  for (let col = 0; col <= CITY.cols; col += 1) {
    ctx.fillRect(col * CITY.pitch, 0, CITY.road, city.waterY);
  }
  for (let row = 0; row <= CITY.rows; row += 1) {
    ctx.fillRect(0, row * CITY.pitch, city.width, CITY.road);
  }
  // Lane dashes.
  ctx.fillStyle = night ? '#8a7c3c' : COLORS.laneMark;
  for (let col = 0; col <= CITY.cols; col += 1) {
    const cx = col * CITY.pitch + CITY.road / 2 - 2;
    for (let y = 10; y < city.waterY; y += 44) ctx.fillRect(cx, y, 4, 24);
  }
  for (let row = 0; row <= CITY.rows; row += 1) {
    const cy = row * CITY.pitch + CITY.road / 2 - 2;
    for (let x = 10; x < city.width; x += 44) ctx.fillRect(x, cy, 24, 4);
  }
  // Park grass.
  const parkX = city.park.col * CITY.pitch + CITY.road;
  const parkY = city.park.row * CITY.pitch + CITY.road;
  ctx.fillStyle = night ? '#274435' : COLORS.grass;
  ctx.fillRect(parkX, parkY, CITY.block, CITY.block);
  // Waterfront sand strip and the harbour.
  ctx.fillStyle = night ? '#5c4f33' : '#8a7a52';
  ctx.fillRect(0, city.waterY, city.width, 14);
  const grad = ctx.createLinearGradient(0, city.waterY, 0, city.height);
  grad.addColorStop(0, night ? '#0f2c47' : COLORS.water);
  grad.addColorStop(1, COLORS.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, city.waterY + 14, city.width, city.height - city.waterY);
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  for (let i = 0; i < 26; i += 1) {
    const wx = ((i * 173) % city.width);
    const wy = city.waterY + 26 + ((i * 97) % 110);
    ctx.fillRect(wx, wy + Math.sin(world.time * 1.3 + i) * 2, 34, 3);
  }
  // The pier.
  ctx.fillStyle = '#6d5136';
  ctx.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
  ctx.fillStyle = '#59422c';
  for (let y = city.pier.y + 8; y < city.pier.y + city.pier.h; y += 18) ctx.fillRect(city.pier.x, y, city.pier.w, 3);

  // Buildings: walls, roofs, windows (lit at night), neon signs.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    drawWindows(ctx, b, night);
  }
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  for (const sign of city.signs) {
    ctx.fillStyle = sign.color;
    if (night) { ctx.shadowColor = sign.color; ctx.shadowBlur = 12; }
    ctx.fillText(sign.text, sign.x, sign.y);
    ctx.shadowBlur = 0;
  }
  // Trees and lamps.
  for (const t of city.trees) {
    ctx.fillStyle = night ? '#1e4d2e' : '#2e7d43';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = night ? '#2a6b3e' : '#3da35d';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  for (const lamp of city.lamps) {
    if (night) {
      ctx.fillStyle = 'rgba(255,205,90,0.16)';
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = night ? '#ffd94a' : '#cfd4da';
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // The Sail & Anchor: the fixer's bar gets a gold awning and a sign.
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(BAR.x - 44, BAR.y - 58, 88, 34);
  ctx.fillStyle = '#e8c33c';
  ctx.fillRect(BAR.x - 44, BAR.y - 58, 88, 7);
  ctx.fillStyle = '#ffd94a';
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillText('SAIL & ANCHOR', BAR.x, BAR.y - 36);
  // The spray shop: an open garage bay on the waterfront road, with
  // a lit sign and a checker floor so it reads from a distance.
  const shop = SPRAY_SHOP;
  ctx.fillStyle = night ? '#4a4038' : '#8a7a5c';
  ctx.fillRect(shop.x, shop.y, shop.w, shop.h);
  ctx.fillStyle = night ? '#2e2a24' : '#6d6152';
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      if ((i + j) % 2 === 0) ctx.fillRect(shop.x + 6 + i * 30, shop.y + 6 + j * 30, 30, 30);
    }
  }
  ctx.strokeStyle = '#ff8a3c';
  ctx.lineWidth = 4;
  ctx.strokeRect(shop.x + 2, shop.y + 2, shop.w - 4, shop.h - 4);
  ctx.fillStyle = '#ff8a3c';
  if (night) { ctx.shadowColor = '#ff8a3c'; ctx.shadowBlur = 10; }
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`SPRAY $${shop.price}`, shop.x + shop.w / 2, shop.y - 10);
  ctx.shadowBlur = 0;
}

function drawWindows(ctx, b, night) {
  const cols = Math.max(1, Math.floor((b.w - 20) / 22));
  const rows = Math.max(1, Math.floor((b.h - 20) / 24));
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const h = ((b.seed * (i + 3) * (j + 7)) % 10) / 10;
      if (night) ctx.fillStyle = h > 0.45 ? 'rgba(255,205,100,0.85)' : 'rgba(30,36,48,0.9)';
      else ctx.fillStyle = h > 0.5 ? 'rgba(210,230,245,0.5)' : 'rgba(40,48,60,0.45)';
      ctx.fillRect(b.x + 12 + i * 22, b.y + 12 + j * 24, 11, 13);
    }
  }
}

// -------------------------------------------------------------- actors

function drawCar(ctx, world, car, isPolice) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  if (car.skidding) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    ctx.fillRect(-24, -19, 15, 5);
    ctx.fillRect(-24, 14, 15, 5);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -21, -11, 46, 26, 6); ctx.fill();
  ctx.fillStyle = isPolice ? COLORS.policeBody : car.color;
  roundRect(ctx, -23, -13, 46, 26, 6); ctx.fill();
  if (isPolice) {
    ctx.fillStyle = COLORS.policeTrim;
    ctx.fillRect(-23, -13, 46, 6);
    ctx.fillRect(-23, 7, 46, 6);
    const flash = Math.floor(world.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    ctx.fillRect(-4, -4, 8, 8);
  }
  ctx.fillStyle = '#1c2733';
  roundRect(ctx, -6, -10, 15, 20, 3); ctx.fill();   // cabin
  ctx.fillStyle = 'rgba(190,225,250,0.75)';
  ctx.fillRect(6, -9, 4, 18);                        // windshield
  ctx.fillStyle = '#14181d';
  for (const [wx, wy] of [[-15, -14], [13, -14], [-15, 10], [13, 10]]) ctx.fillRect(wx, wy, 9, 5);
  if (world.night) {
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    ctx.fillRect(23, -9, 3, 5);
    ctx.fillRect(23, 4, 3, 5);
  }
  ctx.restore();
  if (car.health < 45) {
    ctx.fillStyle = `rgba(70,70,70,${0.35 + 0.2 * Math.sin(world.time * 7 + car.x)})`;
    ctx.beginPath(); ctx.arc(car.x, car.y - 16, 7 + (45 - car.health) / 9, 0, Math.PI * 2); ctx.fill();
  }
  if (car.kind === 'mission') {
    ctx.fillStyle = COLORS.marker;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('▼', car.x, car.y - 30 - Math.sin(world.time * 4) * 3);
  }
}

function drawRoadblock(ctx, world) {
  const rb = world.roadblock;
  for (const car of rb.cars) drawCar(ctx, world, car, true);
  // A striped barricade strung between the two cars, across the road.
  ctx.save();
  ctx.translate(rb.x, rb.y);
  ctx.rotate(rb.angle + Math.PI / 2);
  for (let i = -2; i <= 2; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#ff8a3c' : '#f2f2f2';
    ctx.fillRect(i * 13 - 6, -5, 13, 10);
  }
  ctx.strokeStyle = '#20242a';
  ctx.lineWidth = 2;
  ctx.strokeRect(-33, -5, 66, 10);
  ctx.fillStyle = '#20242a';
  ctx.fillRect(-30, 5, 4, 12);
  ctx.fillRect(26, 5, 4, 12);
  ctx.restore();
  // Warning label above the block, pulsing so it reads at speed.
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(255,83,72,${0.75 + 0.25 * Math.sin(world.time * 6)})`;
  ctx.fillText('ROADBLOCK', rb.x, rb.y - 52);
}

function drawPed(ctx, world, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.globalAlpha = Math.max(0.35, Math.min(1, ped.timer / 3));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(1.5, 2.5, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, world) {
  const p = world.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Aim line is implied by facing; the body turns to the aim.
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(2, 3, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.player;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#20242a';
  ctx.fillRect(4, -2.5, 13, 5); // pistol
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMuzzle(ctx, world) {
  const m = world.muzzle;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.angle);
  ctx.fillStyle = 'rgba(255,210,90,0.9)';
  ctx.beginPath();
  ctx.moveTo(18, 0); ctx.lineTo(30, -4); ctx.lineTo(30, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawMarker(ctx, world) {
  const target = world.stageTarget();
  // Free-roam fares get a marker too: the rider, then the drop-off.
  const point = target || world.taxi.currentTarget() || (!world.mission ? BAR : null);
  if (!point) return;
  const pulse = 15 + Math.sin(world.time * 4) * 4;
  ctx.strokeStyle = target ? COLORS.marker : COLORS.markerAlt;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(point.x, point.y, pulse + 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `bold 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('▼', point.x, point.y - 26 - Math.sin(world.time * 4) * 3);
}

// ------------------------------------------------------- crew & races

/** Crew hangouts: a coloured ring with the member's initial, plus a
 * name and price tag when the player is close enough to hire. Hired
 * members leave their hangout — they trail the player instead. */
function drawCrewHangouts(ctx, world) {
  for (const def of CREW_DEFS) {
    if (world.crew.isHired(def.id)) continue;
    const spot = CREW_HANGOUTS.find((h) => h.id === def.id);
    if (!spot) continue;
    const pulse = 18 + Math.sin(world.time * 3 + def.id.length) * 3;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(spot.x, spot.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(spot.x, spot.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(def.initial, spot.x, spot.y + 4.5);
    const near = Math.hypot(world.player.x - spot.x, world.player.y - spot.y) < 220;
    if (near) {
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = def.color;
      ctx.fillText(`${def.short} — ${def.role} ($${def.cost})`, spot.x, spot.y - 30);
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = '#eef1f5';
      ctx.fillText(def.perkShort, spot.x, spot.y - 14);
    }
  }
}

/** The race gate: a checkered arch on the waterfront road by the pier. */
function drawRaceGate(ctx, world) {
  const gate = RACE_GATE;
  ctx.save();
  ctx.translate(gate.x, gate.y);
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#10141c' : '#f2f2f2';
    ctx.fillRect(-40 + i * 10, -46, 10, 12);
  }
  ctx.fillStyle = COLORS.raceGate;
  ctx.fillRect(-46, -46, 6, 92);
  ctx.fillRect(40, -46, 6, 92);
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = world.race.state === 'idle' ? COLORS.raceGate : '#ffd94a';
  ctx.fillText(world.race.state === 'idle' ? `RACE — ${world.race.nextCircuit.name} ($${world.race.nextCircuit.prize})` : world.race.circuit.name.toUpperCase(), 0, -54);
  ctx.restore();
}

/** Race checkpoints: numbered rings on the road; the next one pulses
 * gold, passed ones turn green, later ones stay cyan. */
function drawRaceCheckpoints(ctx, world) {
  const race = world.race;
  if (!race.circuit || race.state === 'idle') return;
  race.circuit.checkpoints.forEach((cp, i) => {
    const isNext = race.state !== 'finished' && i === race.checkpointIndex;
    const passed = i < race.checkpointIndex || race.state === 'finished';
    const r = isNext ? 30 + Math.sin(world.time * 5) * 5 : 26;
    ctx.strokeStyle = passed ? '#58d977' : isNext ? '#ffd94a' : COLORS.raceCheckpoint;
    ctx.lineWidth = isNext ? 4 : 2.5;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, cp.x, cp.y + 5);
  });
}

/** The cab depot: a yellow taxi bay painted on the road at the
 * north-east corner, with a CAB DEPOT sign — the Cab Boss chain
 * ends here, and any fare-runner knows the yard by sight. */
function drawTaxiDepot(ctx, world) {
  const d = TAXI_DEPOT;
  ctx.save();
  ctx.strokeStyle = COLORS.taxi;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(d.x - 40, d.y - 40, 80, 80);
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.taxi;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('CAB DEPOT', d.x, d.y - 48);
  ctx.restore();
  void world;
}

/** Cab work, drawn: the waiting rider waving with a fare bubble,
 * the destination flag while one is aboard, the rider's head in
 * the back seat, and the TAXI roof sign on a lit cab. */
function drawTaxi(ctx, world) {
  const taxi = world.taxi;
  // The waiting rider: a pulsing gold ring, a waving arm, and a
  // dollar bubble — readable from a street away.
  if (taxi.state === 'waiting' && taxi.rider) {
    const r = taxi.rider;
    const pulse = 20 + Math.sin(world.time * 4) * 4;
    ctx.strokeStyle = r.vip ? COLORS.taxiVip : COLORS.taxi;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, pulse, 0, Math.PI * 2); ctx.stroke();
    // Patience: an outer arc drains as the rider waits — when it
    // runs out they walk off and the fare is gone.
    const waitFrac = Math.max(0, 1 - r.waitT / TAXI.maxWait);
    ctx.strokeStyle = waitFrac > 0.35 ? COLORS.taxi : COLORS.heat;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, pulse + 7, -Math.PI / 2, -Math.PI / 2 + waitFrac * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = r.color;
    ctx.beginPath(); ctx.arc(r.x, r.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(r.x, r.y, 4.2, 0, Math.PI * 2); ctx.fill();
    // A waving arm, up and down with the pulse.
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r.x + 7, r.y - 4);
    ctx.lineTo(r.x + 15, r.y - 16 - Math.sin(world.time * 6) * 3);
    ctx.stroke();
    ctx.fillStyle = r.vip ? COLORS.taxiVip : COLORS.taxi;
    ctx.beginPath(); ctx.arc(r.x, r.y - 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('$', r.x, r.y - 25);
    const near = Math.hypot(world.player.x - r.x, world.player.y - r.y) < 260;
    if (near) {
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = r.vip ? COLORS.taxiVip : COLORS.taxi;
      ctx.fillText(r.vip ? `VIP — ${r.name} (double fare)` : `${r.name} — needs a cab`, r.x, r.y - 46);
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = '#eef1f5';
      ctx.fillText(`to ${r.destLabel}`, r.x, r.y + 30);
    }
  }
  // The destination while a fare is aboard: a pulsing ring and a
  // drawn flag where the meter stops.
  if (taxi.state === 'riding' && taxi.rider) {
    const r = taxi.rider;
    const pulse = 16 + Math.sin(world.time * 4) * 4;
    ctx.strokeStyle = COLORS.taxiMeter;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.destX, r.destY, pulse + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COLORS.taxiMeter;
    ctx.beginPath();
    ctx.moveTo(r.destX, r.destY - 34);
    ctx.lineTo(r.destX, r.destY - 8);
    ctx.lineTo(r.destX + 14, r.destY - 26);
    ctx.lineTo(r.destX, r.destY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('DROP-OFF', r.destX, r.destY + 34);
  }
  // The rider in the back seat, and the TAXI roof sign on a lit cab.
  if (taxi.state === 'riding' && taxi.rider && world.player.car) {
    const car = world.player.car;
    const bx = car.x - Math.cos(car.angle) * 8;
    const by = car.y - Math.sin(car.angle) * 8;
    ctx.fillStyle = taxi.rider.color;
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
  }
  if (taxi.lightOn && world.player.car) {
    const car = world.player.car;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(-8, -17, 16, 7);
    ctx.fillStyle = '#10141c';
    ctx.font = `bold 6px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -11.5);
    ctx.restore();
  }
}

/** Hired crew followers: a coloured ring with the member's initial,
 * drawn distinctly from pedestrians so the player can spot their crew. */
function drawCrewFollowers(ctx, world) {
  for (const f of world.crew.followers) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(f.initial, 0, 4);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ HUD

function drawHud(ctx, world, view) {
  ctx.textBaseline = 'alphabetic';
  // Top-left: health + money + weapon.
  panelBox(ctx, 16, 14, 252, 74);
  ctx.fillStyle = '#20242a';
  ctx.fillRect(28, 26, 160, 13);
  ctx.fillStyle = world.player.health > 30 ? COLORS.health : COLORS.heat;
  ctx.fillRect(28, 26, 160 * Math.max(0, world.player.health) / 100, 13);
  ctx.fillStyle = '#eef1f5';
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(world.player.car ? 'CAR' : 'HEALTH', 196, 38);
  ctx.font = `bold 21px ${FONT}`;
  ctx.fillStyle = '#ffd94a';
  ctx.fillText(`$${world.money}`, 28, 72);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  ctx.fillText(world.player.car ? 'E — get out' : 'PISTOL — click to fire', 110, 72);

  // Top-right: wanted stars + bust meter.
  ctx.font = `26px ${FONT}`;
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < world.wanted ? '#ffd94a' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', VIEW.width - 20 - (4 - i) * 30, 44);
  }
  if (world.bustMeter > 0.02) {
    ctx.fillStyle = '#20242a';
    ctx.fillRect(VIEW.width - 176, 56, 156, 10);
    ctx.fillStyle = COLORS.heat;
    ctx.fillRect(VIEW.width - 176, 56, 156 * world.bustMeter, 10);
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = '#ff8a80';
    ctx.fillText('BUSTED…', VIEW.width - 20, 82);
  }

  // Top-centre: mission line and timer.
  const stage = world.stageTarget();
  const headline = world.mission
    ? `${world.mission.data.title} — ${stage.label}`
    : (world.offer ? `See Vesper at the Sail & Anchor — next: ${world.offer.data.title}` : 'Free roam — the harbour is yours');
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  const w = Math.min(620, ctx.measureText(headline).width + 30);
  panelBox(ctx, VIEW.width / 2 - w / 2, 12, w, 40);
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(headline, VIEW.width / 2, 39);
  if (world.mission && world.mission.timer !== null) {
    ctx.font = `bold 19px ${FONT}`;
    ctx.fillStyle = world.mission.timer < 15 ? COLORS.heat : '#ffd94a';
    ctx.fillText(`${Math.max(0, Math.ceil(world.mission.timer))}s`, VIEW.width / 2, 74);
  }
  if (stage && stage.kind === 'escape' && world.wanted > 0) {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#ff8a80';
    ctx.fillText('Shake the heat first — stars must reach zero', VIEW.width / 2, 96);
  }
  if (stage && stage.kind === 'survive') {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#ff8a80';
    ctx.fillText('Stay alive and unbusted until the clock runs out', VIEW.width / 2, 96);
  }
  if (stage && stage.kind === 'race') {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#ff4fd8';
    ctx.fillText(world.race.active ? 'Win the race — finish 1st to complete the stage' : 'Drive to the marina gate and press E in your car to start the race', VIEW.width / 2, 96);
  }
  if (stage && stage.kind === 'collect') {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#3fd2ff';
    const got = world.mission ? (world.mission.collected || 0) : 0;
    ctx.fillText(`Crew stashes collected: ${got}/${(stage.points || []).length}`, VIEW.width / 2, 96);
  }
  // stageTarget() retargets race/collect stages (checkpoint / next
  // stash), so read the raw stage for their HUD lines.
  const rawStage = world.mission ? world.mission.data.stages[world.mission.stageIndex] : null;
  if (rawStage && rawStage.kind === 'race' && !stage?.kind) {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#ff4fd8';
    ctx.fillText(world.race.active ? 'Win the race — finish 1st to complete the stage' : 'Drive to the marina gate and press E in your car to start the race', VIEW.width / 2, 96);
  }
  if (rawStage && rawStage.kind === 'collect' && !stage?.kind) {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#3fd2ff';
    const got = world.mission ? (world.mission.collected || 0) : 0;
    ctx.fillText(`Crew stashes collected: ${got}/${(rawStage.points || []).length}`, VIEW.width / 2, 96);
  }
  if (rawStage && rawStage.kind === 'taxi') {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#7dff6a';
    const done = rawStage.vip
      ? Math.max(0, world.taxi.vipFinishSeq - (world.mission.taxiVipSeqSeen || 0))
      : Math.max(0, world.taxi.finishSeq - (world.mission.taxiSeqSeen || 0));
    ctx.fillText(rawStage.vip
      ? `VIP fares run for the Cab Boss: ${done}/${rawStage.count || 1} — double fare, timed clock`
      : `Fares run for the Cab Boss: ${done}/${rawStage.count || 1} — smooth, on time, no dents`, VIEW.width / 2, 96);
  }
  if (world.roadblock) {
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = '#ff8a80';
    const warnY = (stage && (stage.kind === 'escape' || stage.kind === 'survive')) ? 116 : 96;
    ctx.fillText('ROADBLOCK AHEAD — ram it or route around', VIEW.width / 2, warnY);
  }
  if (world.nearSpray) {
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = '#ff8a3c';
    ctx.fillText(
      world.money >= SPRAY_SHOP.price
        ? `SPRAY SHOP — $${SPRAY_SHOP.price}: fresh paint, car repaired, one star gone`
        : `SPRAY SHOP — need $${SPRAY_SHOP.price}`,
      VIEW.width / 2, VIEW.height - 132,
    );
  }

  // Speed, bottom-right, while driving.
  if (world.player.car) {
    ctx.font = `bold 30px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#eef1f5';
    ctx.fillText(`${Math.round(Math.abs(world.player.car.speed) * 0.36)}`, VIEW.width - 62, VIEW.height - 22);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#aeb6c2';
    ctx.fillText('km/h', VIEW.width - 20, VIEW.height - 22);
    // Car health sliver.
    ctx.fillStyle = '#20242a';
    ctx.fillRect(VIEW.width - 190, VIEW.height - 52, 130, 8);
    ctx.fillStyle = world.player.car.health > 30 ? COLORS.health : COLORS.heat;
    ctx.fillRect(VIEW.width - 190, VIEW.height - 52, 130 * Math.max(0, world.player.car.health) / 100, 8);
  }

  drawMinimap(ctx, world, view);
  drawOffscreenArrow(ctx, world);
  drawCrewPanel(ctx, world);
  drawRaceHud(ctx, world);
  drawRaceBanner(ctx, world);
  drawTaxiHud(ctx, world);
  drawTaxiBanner(ctx, world);
  // Race gate prompt: in a car at the gate, E starts the next circuit.
  if (world.player.car && world.race.state === 'idle'
    && Math.hypot(world.player.x - RACE_GATE.x, world.player.y - RACE_GATE.y) < 70) {
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.raceGate;
    ctx.fillText(`E — start ${world.race.nextCircuit.name} ($${world.race.nextCircuit.prize} to the winner)`, VIEW.width / 2, VIEW.height - 132);
  }

  if (world.dialogue && world.time < world.dialogue.until) drawDialogue(ctx, world.dialogue);
  else if (world.notice && world.time < world.notice.until) {
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94a';
    ctx.fillText(world.notice.text, VIEW.width / 2, VIEW.height - 108);
  }
  if (view.hint) {
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238,241,245,0.85)';
    ctx.fillText('WASD move · Shift run · E enter car / talk / hire crew · Click fire · Space handbrake · C minimap zoom · P pause · M mute · H controls', VIEW.width / 2, VIEW.height - 14);
    ctx.fillText('Race at the marina gate (E in a car) · Crew hangouts are ringed on the map · Cab fares: T toggles the light', VIEW.width / 2, VIEW.height - 32);
  }
}

// ------------------------------------------------------- crew & race HUD

/** Crew panel under the health box: hired members with level pips,
 * or a pointer to the hangouts when the crew is still empty. Race
 * best times and the cab ledger ride underneath once earned. */
function drawCrewPanel(ctx, world) {
  const hired = world.crew.hiredDefs();
  // Race records under the crew: best time per circuit, once run.
  const bests = ['harbor', 'downtown', 'marina', 'nightmarket']
    .map((id) => (world.race.bestTimes[id] ? `${id === 'harbor' ? 'Loop' : id === 'downtown' ? 'Sprint' : id === 'marina' ? 'Tour' : 'Night'} ${RaceSystem.formatTime(world.race.bestTimes[id])}` : null))
    .filter(Boolean);
  // Cab ledger under the crew: fares run, money earned, best tip,
  // and the last couple of fares with their stars.
  const taxiStats = world.taxi.stats;
  const taxiLines = [];
  if (taxiStats.fares > 0) {
    taxiLines.push(`Cab: ${taxiStats.fares} fares · $${taxiStats.earned} · best tip $${taxiStats.bestTip}${taxiStats.fiveStars ? ` · ${taxiStats.fiveStars}x 5★` : ''}${taxiStats.nightFares ? ` · ${taxiStats.nightFares} night` : ''}`);
    const recent = world.taxi.lastFares.slice(0, 2);
    if (recent.length) {
      taxiLines.push(`Last: ${recent.map((f) => `${f.name.split(' ')[0]} ${f.rating}★ $${f.total}`).join(' · ')}`);
    }
  }
  const extra = (bests.length ? 18 : 0) + taxiLines.length * 18;
  const h = 30 + hired.length * 20 + extra;
  panelBox(ctx, 16, 96, 252, Math.max(52, h));
  ctx.textAlign = 'left';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = '#3fd2ff';
  ctx.fillText('CREW', 28, 116);
  if (!hired.length && !taxiLines.length) {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#aeb6c2';
    ctx.fillText('No crew yet — find Jax, Lena &', 28, 136);
    ctx.fillText('Marcus at their ringed hangouts', 28, 152);
    return;
  }
  hired.forEach((member, i) => {
    const y = 138 + i * 20;
    ctx.fillStyle = member.color;
    ctx.beginPath(); ctx.arc(34, y - 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(member.initial, 34, y - 1);
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#eef1f5';
    ctx.fillText(`${member.short} · ${member.role}`, 46, y);
    ctx.font = `12px ${FONT}`;
    let pips = '';
    for (let lv = 1; lv <= 5; lv += 1) pips += lv <= member.level ? '●' : '○';
    ctx.fillStyle = member.color;
    ctx.fillText(pips, 196, y);
  });
  let lineY = 118 + hired.length * 20;
  if (bests.length) {
    lineY += 18;
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#aeb6c2';
    ctx.fillText(`Best: ${bests.join(' · ')}`, 28, lineY);
  }
  if (taxiLines.length) {
    for (const line of taxiLines) {
      lineY += 18;
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = '#aeb6c2';
      ctx.fillText(line, 28, lineY);
    }
  }
}

/** Race HUD: the 3-2-1 countdown big in the centre, then the live
 * position, checkpoint counter and timer while racing. */
function drawRaceHud(ctx, world) {
  const race = world.race;
  if (race.state === 'countdown') {
    const n = Math.max(1, Math.ceil(race.countdownT));
    ctx.font = `bold 110px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94a';
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = 30;
    ctx.fillText(`${n}`, VIEW.width / 2, VIEW.height / 2 - 40);
    ctx.shadowBlur = 0;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = '#eef1f5';
    ctx.fillText(race.circuit.name, VIEW.width / 2, VIEW.height / 2 + 10);
    return;
  }
  if (race.state !== 'racing') return;
  const placeNames = ['1st', '2nd', '3rd'];
  ctx.textAlign = 'center';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = race.position === 1 ? '#ffd94a' : '#eef1f5';
  ctx.fillText(placeNames[race.position - 1], VIEW.width / 2, 118);
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(
    `Checkpoint ${Math.min(race.checkpointIndex + 1, race.checkpointCount)}/${race.checkpointCount} · ${RaceSystem.formatTime(race.elapsed)}`,
    VIEW.width / 2, 142,
  );
  if (race.wrongWay) {
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = COLORS.heat;
    ctx.fillText('WRONG WAY — turn back to the next checkpoint', VIEW.width / 2, 166);
  }
}

/** Finish banner: place, time, prize and best time, for six seconds. */
function drawRaceBanner(ctx, world) {
  const race = world.race;
  if (race.state !== 'finished' || !race.lastResult || world.time > race.bannerUntil) return;
  const result = race.lastResult;
  const placeNames = ['1st', '2nd', '3rd'];
  panelBox(ctx, VIEW.width / 2 - 260, VIEW.height / 2 - 150, 520, 120);
  ctx.textAlign = 'center';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillStyle = result.place === 1 ? '#ffd94a' : '#eef1f5';
  ctx.fillText(`${result.name} — ${placeNames[result.place - 1]}!`, VIEW.width / 2, VIEW.height / 2 - 108);
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(
    `Time ${RaceSystem.formatTime(result.time)} · Prize $${result.prize}${result.isBest ? ' · NEW BEST TIME' : ` · Best ${RaceSystem.formatTime(race.bestTimes[result.circuitId])}`}`,
    VIEW.width / 2, VIEW.height / 2 - 74,
  );
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  ctx.fillText('The gate offers the next circuit — press E in a car to run it', VIEW.width / 2, VIEW.height / 2 - 48);
}

/** Cab fare HUD: the meter panel while a fare is aboard, and the
 * pickup prompt when a rider is beside the car. */
function drawTaxiHud(ctx, world) {
  const taxi = world.taxi;
  if (taxi.state === 'riding' && taxi.rider) {
    const r = taxi.rider;
    const vipLeft = taxi.vipTimeLeft();
    panelBox(ctx, VIEW.width - 316, 96, 300, 96);
    ctx.textAlign = 'left';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = r.vip ? COLORS.taxiVip : COLORS.taxi;
    ctx.fillText(r.vip ? `VIP FARE — ${r.name}` : `CAB FARE — ${r.name}`, VIEW.width - 304, 118);
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillStyle = '#7dff6a';
    ctx.fillText(`$${taxi.fare}`, VIEW.width - 304, 150);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#eef1f5';
    ctx.textAlign = 'right';
    ctx.fillText(`to ${r.destLabel}`, VIEW.width - 28, 150);
    ctx.textAlign = 'left';
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = vipLeft !== null
      ? (vipLeft < 15 ? COLORS.heat : '#ffd94a')
      : '#aeb6c2';
    ctx.fillText(
      vipLeft !== null ? `VIP clock: ${Math.ceil(vipLeft)}s — double fare` : `Crashes: ${taxi.crashes} · a shunt shrinks the tip`,
      VIEW.width - 304, 168,
    );
    // What the rider asked for: speed, a slow scenic drive, or just
    // a smooth trip — the tip grades it, so it stays on the meter.
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#aeb6c2';
    const prefText = r.pref === 'hurry' ? 'Rider wants it FAST — beat the clock'
      : r.pref === 'scenic' ? 'Rider wants it slow & scenic'
      : 'Rider wants a smooth ride';
    ctx.fillText(`${prefText}${world.night ? ' · NIGHT RATES ×1.5' : ''}`, VIEW.width - 304, 186);
    return;
  }
  if (taxi.state === 'waiting' && taxi.rider && world.player.car
    && Math.hypot(world.player.x - taxi.rider.x, world.player.y - taxi.rider.y) < 70) {
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = taxi.rider.vip ? COLORS.taxiVip : COLORS.taxi;
    ctx.fillText(`E — pick up ${taxi.rider.name} → ${taxi.rider.destLabel}${taxi.rider.vip ? ' (VIP, double fare)' : ''}`, VIEW.width / 2, VIEW.height - 132);
  }
}

/** Fare banner: stars, meter, tip and total for six seconds after
 * a rider pays — the cab's answer to the race finish banner. */
function drawTaxiBanner(ctx, world) {
  const taxi = world.taxi;
  const result = taxi.lastResult;
  if (!result || world.time > taxi.bannerUntil) return;
  const stars = '★'.repeat(result.rating) + '☆'.repeat(5 - result.rating);
  panelBox(ctx, VIEW.width / 2 - 260, VIEW.height / 2 - 150, 520, 120);
  ctx.textAlign = 'center';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillStyle = result.rating >= 4 ? '#7dff6a' : '#ffd94a';
  ctx.fillText(`Fare paid — ${stars}`, VIEW.width / 2, VIEW.height / 2 - 108);
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(
    `${result.name}: $${result.fare} fare${result.tip > 0 ? ` + $${result.tip} tip` : ' · no tip'} = $${result.total}${result.vip ? ' · VIP double fare' : ''}${result.night ? ' · night rates' : ''}${result.pref === 'hurry' ? ' · fast ride' : result.pref === 'scenic' ? ' · scenic ride' : ''}`,
    VIEW.width / 2, VIEW.height / 2 - 74,
  );
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  ctx.fillText('The next rider is already hailing — keep the light on', VIEW.width / 2, VIEW.height / 2 - 48);
}

function drawMinimap(ctx, world, view) {
  const { x, y, w, h } = MINIMAP;
  const zoomed = Boolean(view && view.minimapZoom);
  // Zoomed: a ~700-unit window around the player at a larger scale;
  // plain: the whole city, exactly as before.
  const ww = zoomed ? 700 : world.city.width;
  const wh = zoomed ? (700 * h) / w : world.city.height;
  const wx = zoomed ? clamp(world.player.x - ww / 2, 0, Math.max(0, world.city.width - ww)) : 0;
  const wy = zoomed ? clamp(world.player.y - wh / 2, 0, Math.max(0, world.city.height - wh)) : 0;
  const sx = w / ww;
  const sy = h / wh;
  ctx.fillStyle = 'rgba(16,20,28,0.82)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#484d55';
  ctx.fillRect(x, y, w, (world.city.waterY - wy) * sy);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(x, y + (world.city.waterY - wy) * sy, w, h - (world.city.waterY - wy) * sy);
  ctx.fillStyle = '#6d727b';
  for (let col = 0; col <= CITY.cols; col += 1) {
    ctx.fillRect(x + (col * CITY.pitch - wx) * sx, y, CITY.road * sx, (world.city.waterY - wy) * sy);
  }
  for (let row = 0; row <= CITY.rows; row += 1) {
    ctx.fillRect(x, y + (row * CITY.pitch - wy) * sy, w, CITY.road * sy);
  }
  const dot = (px, py, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + (px - wx) * sx, y + (py - wy) * sy, r, 0, Math.PI * 2); ctx.fill();
  };
  // The spray shop is a landmark in both views.
  dot(SPRAY_SHOP.x + SPRAY_SHOP.w / 2, SPRAY_SHOP.y + SPRAY_SHOP.h / 2, '#ff8a3c', zoomed ? 3.4 : 2.4);
  // Crew hangouts (unhired members) and the race gate are landmarks too.
  for (const def of CREW_DEFS) {
    if (world.crew.isHired(def.id)) continue;
    const spot = CREW_HANGOUTS.find((h) => h.id === def.id);
    if (spot) dot(spot.x, spot.y, def.color, zoomed ? 3.4 : 2.6);
  }
  for (const f of world.crew.followers) dot(f.x, f.y, f.color, zoomed ? 3 : 2.2);
  dot(RACE_GATE.x, RACE_GATE.y, COLORS.raceGate, zoomed ? 4 : 3);
  if (world.race.circuit && world.race.state !== 'idle') {
    world.race.circuit.checkpoints.forEach((cp, i) => {
      dot(cp.x, cp.y, i < world.race.checkpointIndex ? '#58d977' : COLORS.raceCheckpoint, zoomed ? 3 : 2.2);
    });
  }
  for (const rival of world.race.rivals) dot(rival.x, rival.y, rival.color, zoomed ? 3 : 2.4);
  // Cab work on the map: a waiting rider, the drop-off while a
  // fare is aboard, and the depot yard in the north-east corner.
  if (world.taxi.state === 'waiting' && world.taxi.rider) {
    dot(world.taxi.rider.x, world.taxi.rider.y, world.taxi.rider.vip ? COLORS.taxiVip : COLORS.taxi, zoomed ? 4 : 3.2);
  }
  if (world.taxi.state === 'riding' && world.taxi.rider) {
    dot(world.taxi.rider.destX, world.taxi.rider.destY, COLORS.taxiMeter, zoomed ? 4 : 3.2);
  }
  dot(TAXI_DEPOT.x, TAXI_DEPOT.y, '#ffd94a', zoomed ? 3 : 2.2);
  for (const car of world.cars) if (car.kind === 'traffic') dot(car.x, car.y, 'rgba(230,230,230,0.5)', 1.6);
  for (const cop of world.police) dot(cop.x, cop.y, '#5f8dff', 3);
  if (world.roadblock) for (const car of world.roadblock.cars) dot(car.x, car.y, '#5f8dff', 3);
  const target = world.stageTarget() || (!world.mission ? BAR : null);
  if (target) dot(target.x, target.y, COLORS.marker, 3.6);
  const p = world.player;
  dot(p.x, p.y, '#ffd94a', 3.6);
  const camLeft = clamp(world.camX - VIEW.width / 2, 0, Math.max(0, world.city.width - VIEW.width));
  const camTop = clamp(world.camY - VIEW.height / 2, 0, Math.max(0, world.city.height - VIEW.height));
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + (camLeft - wx) * sx, y + (camTop - wy) * sy, VIEW.width * sx, VIEW.height * sy);
  ctx.restore();
  if (zoomed) {
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aeb6c2';
    ctx.fillText('C — zoomed: gold you · blue police · orange spray shop · gold star objective', x, y - 8);
  }
}

function drawOffscreenArrow(ctx, world) {
  // While racing, the arrow points at the next checkpoint; while a
  // fare is aboard, at the drop-off; otherwise at the mission.
  const target = world.race.active ? world.race.nextCheckpoint
    : world.taxi.state === 'riding' ? world.taxi.currentTarget()
    : world.stageTarget() || world.taxi.currentTarget() || (!world.mission ? BAR : null);
  if (!target) return;
  const sx = target.x - world.camX + VIEW.width / 2;
  const sy = target.y - world.camY + VIEW.height / 2;
  if (sx > -20 && sx < VIEW.width + 20 && sy > -20 && sy < VIEW.height + 20) return;
  const cx = clamp(sx, 36, VIEW.width - 36);
  const cy = clamp(sy, 90, VIEW.height - 60);
  const ang = Math.atan2(sy - VIEW.height / 2, sx - VIEW.width / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = COLORS.marker;
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawDialogue(ctx, dialogue) {
  const x = VIEW.width / 2 - 330;
  const y = VIEW.height - 96;
  panelBox(ctx, x, y, 660, 78);
  ctx.textAlign = 'left';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = '#3fd2ff';
  ctx.fillText(dialogue.speaker, x + 18, y + 24);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  wrapText(ctx, dialogue.text, x + 18, y + 48, 624, 19);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, ly);
      line = word;
      ly += lineHeight;
    } else line = trial;
  }
  if (line) ctx.fillText(line, x, ly);
}

// --------------------------------------------------------------- screens

function drawTitle(ctx, world, view) {
  ctx.fillStyle = 'rgba(8,10,18,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.font = `bold 74px ${FONT}`;
  ctx.fillStyle = '#ffd94a';
  ctx.shadowColor = '#ff4fd8';
  ctx.shadowBlur = 26;
  ctx.fillText('NEON HARBOR', VIEW.width / 2, 218);
  ctx.shadowBlur = 0;
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = '#3fd2ff';
  ctx.fillText('ROGUE RUN', VIEW.width / 2, 272);
  ctx.font = `19px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  ctx.fillText('Steal cars. Run Vesper\u2019s errands. Outrun the harbour watch.', VIEW.width / 2, 322);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  ctx.fillText('WASD / arrows — move & drive · E — enter car, talk, take a job', VIEW.width / 2, 386);
  ctx.fillText('Mouse — aim · Click — fire · Space — handbrake · Shift — run', VIEW.width / 2, 412);
  ctx.fillText('P / Esc — pause · M — sound on/off · C — minimap zoom · H — controls', VIEW.width / 2, 438);
  ctx.fillText('Hire a crew at their hangouts · Race at the marina gate · Run cab fares — T toggles the cab light', VIEW.width / 2, 464);
  if (view.savedNote) {
    ctx.fillStyle = '#ffd94a';
    ctx.fillText(view.savedNote, VIEW.width / 2, 478);
  }
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = Math.floor(world.time * 1.6) % 2 ? '#ffd94a' : '#eef1f5';
  ctx.fillText('PRESS ENTER TO START', VIEW.width / 2, 540);
}

function drawOver(ctx, world, view) {
  ctx.fillStyle = 'rgba(8,6,10,0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillStyle = world.endKind === 'busted' ? '#5f8dff' : '#ff5348';
  ctx.fillText(world.endKind === 'busted' ? 'BUSTED' : 'WASTED', VIEW.width / 2, 300);
  ctx.font = `19px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(
    world.endKind === 'busted'
      ? 'The harbour watch got cuffs on you. The money you earned stays yours.'
      : 'The run ended in a wreck. The harbour keeps what you earned.',
    VIEW.width / 2, 348,
  );
  ctx.font = `bold 21px ${FONT}`;
  ctx.fillStyle = '#ffd94a';
  ctx.fillText(`Money kept: $${world.money}`, VIEW.width / 2, 392);
  if (world.taxi.stats.fares > 0) {
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = '#aeb6c2';
    ctx.fillText(`Cab ledger: ${world.taxi.stats.fares} fares · $${world.taxi.stats.earned} earned · best tip $${world.taxi.stats.bestTip}`, VIEW.width / 2, 420);
  }
  ctx.font = `17px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  ctx.fillText('Press Enter to run again', VIEW.width / 2, 440);
  void view;
}

/** Controls reference (H): every key the game reads, on one card. */
function drawHelpPanel(ctx) {
  const lines = [
    ['WASD / arrows', 'Walk & drive'],
    ['Shift', 'Run on foot'],
    ['E / F', 'Enter car · talk · hire crew · start race · take a fare'],
    ['Mouse + click', 'Aim & fire the pistol'],
    ['Space', 'Handbrake'],
    ['C', 'Minimap zoom (whole city / close-up)'],
    ['T', 'Cab light — riders hail a lit cab'],
    ['M', 'Sound on / off'],
    ['P / Esc', 'Pause'],
    ['H', 'Close this card'],
  ];
  panelBox(ctx, VIEW.width / 2 - 300, VIEW.height / 2 - 190, 600, 380);
  ctx.textAlign = 'center';
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = '#ffd94a';
  ctx.fillText('CONTROLS', VIEW.width / 2, VIEW.height / 2 - 150);
  ctx.textAlign = 'left';
  lines.forEach(([key, what], i) => {
    const y = VIEW.height / 2 - 112 + i * 30;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = '#3fd2ff';
    ctx.fillText(key, VIEW.width / 2 - 270, y);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = '#eef1f5';
    ctx.fillText(what, VIEW.width / 2 - 110, y);
  });
}

function drawPanel(ctx, title, lines, view) {
  ctx.fillStyle = 'rgba(8,10,18,0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panelBox(ctx, VIEW.width / 2 - 250, VIEW.height / 2 - 90, 500, 180);
  ctx.textAlign = 'center';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(title, VIEW.width / 2, VIEW.height / 2 - 34);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, VIEW.height / 2 + 8 + i * 26));
  void view;
}

function panelBox(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(14,18,26,0.85)';
  roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 8); ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

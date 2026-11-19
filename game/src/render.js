// Drawing only: the world and the current screen go in, pixels come
// out. The camera follows world.camX/camY; everything is flat shapes
// with a neon trim, warmer by day and darker with lit windows and
// sign glow at night. The HUD (health, money, stars, mission line,
// speed) and the minimap are drawn on the same canvas after the world,
// in screen space, so screenshots show the whole game at a glance.

import { CITY, COLORS, VIEW } from './config.js';
import { BAR } from './missions.js';

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
  for (const ped of world.peds) drawPed(ctx, world, ped);
  for (const car of world.cars) drawCar(ctx, world, car, false);
  if (world.player.car) drawCar(ctx, world, world.player.car, false);
  for (const cop of world.police) drawCar(ctx, world, cop, true);
  if (!world.player.car) drawPlayer(ctx, world);
  if (world.muzzle && world.time < world.muzzle.until) drawMuzzle(ctx, world);
  ctx.restore();

  if (view.screen === SCREEN_TITLE) { drawTitle(ctx, world, view); return; }
  drawHud(ctx, world, view);
  if (view.screen === SCREEN_PAUSE) drawPanel(ctx, 'PAUSED', ['The harbour holds its breath.', 'P or Esc to resume — Enter to restart'], view);
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
  const point = target || (!world.mission ? BAR : null);
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

  drawMinimap(ctx, world);
  drawOffscreenArrow(ctx, world);

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
    ctx.fillText('WASD move · Shift run · E enter car / talk · Click fire · Space handbrake · P pause · M mute', VIEW.width / 2, VIEW.height - 14);
  }
}

function drawMinimap(ctx, world) {
  const { x, y, w, h } = MINIMAP;
  const sx = w / world.city.width;
  const sy = h / world.city.height;
  ctx.fillStyle = 'rgba(16,20,28,0.82)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#484d55';
  ctx.fillRect(x, y, w, world.city.waterY * sy);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(x, y + world.city.waterY * sy, w, h - world.city.waterY * sy);
  ctx.fillStyle = '#6d727b';
  for (let col = 0; col <= CITY.cols; col += 1) ctx.fillRect(x + col * CITY.pitch * sx, y, CITY.road * sx, world.city.waterY * sy);
  for (let row = 0; row <= CITY.rows; row += 1) ctx.fillRect(x, y + row * CITY.pitch * sy, w, CITY.road * sy);
  const dot = (px, py, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + px * sx, y + py * sy, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const car of world.cars) if (car.kind === 'traffic') dot(car.x, car.y, 'rgba(230,230,230,0.5)', 1.6);
  for (const cop of world.police) dot(cop.x, cop.y, '#5f8dff', 3);
  const target = world.stageTarget() || (!world.mission ? BAR : null);
  if (target) dot(target.x, target.y, COLORS.marker, 3.6);
  const p = world.player;
  dot(p.x, p.y, '#ffd94a', 3.6);
  const camLeft = clamp(world.camX - VIEW.width / 2, 0, Math.max(0, world.city.width - VIEW.width));
  const camTop = clamp(world.camY - VIEW.height / 2, 0, Math.max(0, world.city.height - VIEW.height));
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + camLeft * sx, y + camTop * sy, VIEW.width * sx, VIEW.height * sy);
}

function drawOffscreenArrow(ctx, world) {
  const target = world.stageTarget() || (!world.mission ? BAR : null);
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
  ctx.fillText('P / Esc — pause · M — sound on/off', VIEW.width / 2, 438);
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
  ctx.font = `17px ${FONT}`;
  ctx.fillStyle = '#aeb6c2';
  ctx.fillText('Press Enter to run again', VIEW.width / 2, 440);
  void view;
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

// The HUD: the live minimap, wanted stars, health, cash, speed, the
// current objective and the controls hint. Drawn in screen space after
// the world, in big type that still reads when the screenshot is shrunk.

import { FONT, MARINA, PALETTE, POLICE, ROADS_H, ROADS_V, WORLD } from './config.js';
import { missionTarget, objectiveText } from './missions.js';
import { speedKmh } from './vehicles.js';

const MAP_W = 196;
const MAP_H = 142;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? PALETTE.star : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function createHud() {
  const fonts = new Map();
  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(ctx, value, x, y, size, color, align, weight) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = PALETTE.hudBg;
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
  }

  /** The minimap: roads, sea, park, the player, police and the mission marker. */
  function drawMinimap(ctx, game, x, y, time) {
    const sx = MAP_W / WORLD.width;
    const sy = MAP_H / WORLD.height;
    panel(ctx, x - 6, y - 6, MAP_W + 12, MAP_H + 12);
    ctx.save();
    rr(ctx, x, y, MAP_W, MAP_H, 6);
    ctx.clip();
    ctx.fillStyle = '#6f9a55';
    ctx.fillRect(x, y, MAP_W, MAP_H);
    // Sea and marina.
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(x, y + 2210 * sy, MAP_W, MAP_H - 2210 * sy);
    ctx.fillRect(x + MARINA.x * sx, y + MARINA.y * sy, MARINA.width * sx, MARINA.height * sy);
    // Park.
    ctx.fillStyle = '#4a8a3a';
    ctx.fillRect(x + 1200 * sx, y + 1100 * sy, 450 * sx, 400 * sy);
    // Roads.
    ctx.fillStyle = '#3d4148';
    for (const rx of ROADS_V) ctx.fillRect(x + rx * sx - 3, y, 6, MAP_H);
    for (const ry of ROADS_H) ctx.fillRect(x, y + ry * sy - 3, MAP_W, 6);
    // Respray shop.
    ctx.fillStyle = '#14b478';
    ctx.fillRect(x + 880 * sx - 3, y + 1600 * sy - 3, 6, 6);
    // Mission marker: a pulsing yellow diamond.
    const target = missionTarget(game);
    if (target) {
      const pulse = 4 + Math.sin(time * 5) * 1.5;
      ctx.fillStyle = PALETTE.missionMarker;
      ctx.beginPath();
      ctx.moveTo(x + target.x * sx, y + target.y * sy - pulse - 2);
      ctx.lineTo(x + target.x * sx + pulse + 2, y + target.y * sy);
      ctx.lineTo(x + target.x * sx, y + target.y * sy + pulse + 2);
      ctx.lineTo(x + target.x * sx - pulse - 2, y + target.y * sy);
      ctx.closePath();
      ctx.fill();
    }
    // Police cars: flashing blue dots.
    const flash = Math.floor(time * 4) % 2 === 0;
    for (const car of game.cars) {
      if (car.kind !== 'police') continue;
      ctx.fillStyle = flash ? '#4d8dff' : '#ff4d4d';
      ctx.beginPath();
      ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where they face.
    const p = game.player.car ?? game.player;
    const angle = game.player.car ? game.player.car.angle : game.player.angle;
    ctx.save();
    ctx.translate(x + p.x * sx, y + p.y * sy);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    text(ctx, 'N', x + MAP_W - 8, y + 14, 12, '#ffffff', 'center', 800);
  }

  /** The whole HUD, drawn over the world while playing. */
  function draw(ctx, game, size) {
    const w = size.w;
    const h = size.h;
    const time = game.time;
    const player = game.player;

    // Objective panel, top left. It grows when the objective wraps.
    const objective = objectiveText(game);
    const wrapped = objective.length > 52;
    const objH = wrapped ? 88 : 64;
    panel(ctx, 14, 14, 430, objH);
    text(ctx, 'SOLMAR BAY', 28, 36, 13, PALETTE.hudMuted, 'left', 700);
    if (wrapped) {
      const cut = objective.lastIndexOf(' ', 52);
      text(ctx, objective.slice(0, cut), 28, 58, 16, PALETTE.hudText, 'left', 600);
      text(ctx, objective.slice(cut + 1), 28, 80, 16, PALETTE.hudText, 'left', 600);
    } else {
      text(ctx, objective, 28, 60, 17, PALETTE.hudText, 'left', 600);
    }

    // Cash and ammo, under the objective.
    const cashY = 14 + objH + 10;
    panel(ctx, 14, cashY, 210, 40);
    text(ctx, `$${Math.floor(player.cash)}`, 28, cashY + 27, 20, '#7be07b', 'left', 800);
    text(ctx, `Ammo ${player.ammo}`, 120, cashY + 27, 16, PALETTE.hudText, 'left', 600);

    // Minimap, top right.
    drawMinimap(ctx, game, w - MAP_W - 20, 14, time);

    // Wanted stars, under the minimap.
    const stars = Math.ceil(game.wanted);
    panel(ctx, w - MAP_W - 20, 14 + MAP_H + 16, MAP_W + 12, 44);
    for (let i = 0; i < POLICE.maxStars; i += 1) {
      star(ctx, w - MAP_W + 8 + i * 38, 14 + MAP_H + 38, 13, i < stars);
    }
    if (game.wanted > 0 && game.hiddenTime > POLICE.hideTime) {
      text(ctx, 'HIDDEN', w - 28, 14 + MAP_H + 38, 13, '#7be07b', 'right', 800);
    }

    // Health bar, under the stars.
    const barY = 14 + MAP_H + 70;
    panel(ctx, w - MAP_W - 20, barY, MAP_W + 12, 30);
    text(ctx, 'HP', w - MAP_W - 6, barY + 20, 13, PALETTE.hudMuted, 'left', 700);
    const barW = MAP_W - 44;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, w - MAP_W + 22, barY + 9, barW, 12, 6);
    ctx.fill();
    ctx.fillStyle = player.hp > 30 ? PALETTE.health : PALETTE.healthLow;
    rr(ctx, w - MAP_W + 22, barY + 9, barW * Math.max(0, player.hp / 100), 12, 6);
    ctx.fill();

    // Speed and car health, bottom right, when driving.
    if (player.car) {
      panel(ctx, w - 190, h - 74, 176, 60);
      text(ctx, `${speedKmh(player.car)}`, w - 100, h - 34, 30, PALETTE.hudText, 'center', 800);
      text(ctx, 'km/h', w - 40, h - 34, 14, PALETTE.hudMuted, 'left', 600);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      rr(ctx, w - 176, h - 26, 148, 8, 4);
      ctx.fill();
      ctx.fillStyle = player.car.hp > 35 ? '#7be07b' : '#e53b3b';
      rr(ctx, w - 176, h - 26, 148 * Math.max(0, player.car.hp / 100), 8, 4);
      ctx.fill();
    }

    // Controls hint, bottom left.
    panel(ctx, 14, h - 40, 560, 26);
    text(ctx, 'WASD move/drive · E car · Click shoot · F punch · Shift run · Space handbrake · P pause · M mute',
      26, h - 22, 13, PALETTE.hudMuted, 'left', 500);

    // Context prompt: entering a car, or the respray.
    if (!player.car) {
      const near = game.nearCar;
      if (near) {
        text(ctx, `Press E to steal the ${near.type}`, w / 2, h - 90, 18, '#ffffff', 'center', 700);
      }
    } else if (game.wanted >= 1 && player.cash >= POLICE.resprayCost) {
      const s = game.city.places.respray;
      const dx = player.car.x - (s.x + s.w / 2);
      const dy = player.car.y - (s.y + s.h / 2);
      if (dx * dx + dy * dy < 500 * 500) {
        text(ctx, `Respray nearby — drive in to clear wanted ($${POLICE.resprayCost})`, w / 2, h - 90, 17, '#7be07b', 'center', 700);
      }
    }

    // Toast message, centre top.
    if (game.messageTimer > 0 && game.message) {
      ctx.font = font(19, 700);
      const tw = ctx.measureText(game.message).width;
      panel(ctx, w / 2 - tw / 2 - 18, 92, tw + 36, 38);
      text(ctx, game.message, w / 2, 118, 19, '#ffffff', 'center', 700);
    }

    // Low-health vignette.
    if (player.hp < 30 && player.hp > 0) {
      const pulse = 0.12 + Math.sin(time * 5) * 0.06;
      ctx.fillStyle = `rgba(229,59,59,${pulse})`;
      ctx.fillRect(0, 0, w, 10);
      ctx.fillRect(0, h - 10, w, 10);
      ctx.fillRect(0, 0, 10, h);
      ctx.fillRect(w - 10, 0, 10, h);
    }
  }

  return { draw };
}

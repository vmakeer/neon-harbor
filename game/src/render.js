// Drawing only: the city, the cars, the people and the menus, in pixels.
// The camera follows the player through the world; the HUD and the menus
// are drawn in screen space on top. Everything is procedural canvas art:
// no images, no fonts beyond the system stack.

import {
  BEACH_TOP, CITY_NAME, FONT, GAME_TITLE, MARINA, PALETTE,
  ROADS_H, ROADS_V, ROAD_WIDTH, SEA_TOP, SIDEWALK, WORLD,
} from './config.js';
import { isOnRoad } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const BUTTON_H = 46;
const BUTTON_W = 300;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** A rounded rectangle path, for car bodies and panels. */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 800, dpr: 1 };
  const fonts = new Map();

  function resize() {
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudBg;
    rr(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- the world -------------------------------------------------------

  function drawGround(cam) {
    // Grass base, then sand, then sea.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(cam.x0, cam.y0, cam.x1 - cam.x0, cam.y1 - cam.y0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(cam.x0, BEACH_TOP, cam.x1 - cam.x0, SEA_TOP - BEACH_TOP);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(cam.x0, SEA_TOP, cam.x1 - cam.x0, cam.y1 - SEA_TOP);
    // Marina water.
    ctx.fillStyle = PALETTE.seaDeep;
    ctx.fillRect(MARINA.x, MARINA.y, MARINA.width, MARINA.height);
    // Shoreline foam.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cam.x0, SEA_TOP - 3, cam.x1 - cam.x0, 3);
    ctx.fillRect(MARINA.x - 3, MARINA.y, 3, MARINA.height);
  }

  function drawRoads() {
    const half = ROAD_WIDTH / 2;
    // Sidewalks first, slightly wider than the asphalt.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_V) ctx.fillRect(rx - half - SIDEWALK, 0, ROAD_WIDTH + SIDEWALK * 2, BEACH_TOP);
    for (const ry of ROADS_H) ctx.fillRect(0, ry - half - SIDEWALK, MARINA.x, ROAD_WIDTH + SIDEWALK * 2);
    // Asphalt.
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROADS_V) ctx.fillRect(rx - half, 0, ROAD_WIDTH, BEACH_TOP);
    for (const ry of ROADS_H) ctx.fillRect(0, ry - half, MARINA.x, ROAD_WIDTH);
    // Centre dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of ROADS_V) {
      for (let y = 20; y < BEACH_TOP; y += 56) {
        // Skip the dashes inside intersections.
        let inCross = false;
        for (const ry of ROADS_H) if (Math.abs(y - ry) < half + 10) inCross = true;
        if (!inCross) ctx.fillRect(rx - 2, y, 4, 28);
      }
    }
    for (const ry of ROADS_H) {
      for (let x = 20; x < MARINA.x; x += 56) {
        let inCross = false;
        for (const rx of ROADS_V) if (Math.abs(x - rx) < half + 10) inCross = true;
        if (!inCross) ctx.fillRect(x, ry - 2, 28, 4);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of ROADS_V) {
      for (const ry of ROADS_H) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(rx - half - 12 + i * 14, ry - half - 14, 8, 10);
          ctx.fillRect(rx - half - 12 + i * 14, ry + half + 4, 8, 10);
        }
      }
    }
  }

  function drawBuildings(city, cam) {
    for (const b of city.buildings) {
      if (b.x > cam.x1 || b.x + b.w < cam.x0 || b.y > cam.y1 || b.y + b.h < cam.y0) continue;
      const shadow = b.tall ? 16 : 9;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + shadow, b.y + shadow, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof inset and a rooftop box on tall buildings.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 8);
      if (b.tall) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.28, b.h * 0.28);
      }
      // Windows along the walls.
      ctx.fillStyle = 'rgba(40,60,90,0.5)';
      for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 22) {
        ctx.fillRect(wx, b.y + 3, 10, 6);
        ctx.fillRect(wx, b.y + b.h - 9, 10, 6);
      }
    }
  }

  function drawRespray(city) {
    const s = city.places.respray;
    ctx.fillStyle = 'rgba(20,180,120,0.18)';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = '#14b478';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#0d8a5c';
    ctx.fillRect(s.x + 14, s.y + 8, 122, 30);
    text('RESPRAY', s.x + 22, s.y + 30, 17, '#ffffff', 'left', 700);
    text('$150 · clears wanted', s.x + 16, s.y + s.h - 12, 13, '#0d5c3e', 'left', 600);
  }

  function drawTrees(city, cam) {
    for (const t of city.trees) {
      if (t.x < cam.x0 - 40 || t.x > cam.x1 + 40 || t.y < cam.y0 - 40 || t.y > cam.y1 + 40) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath();
      ctx.ellipse(t.x + 6, t.y + 8, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#7a5a3a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + 6);
        ctx.lineTo(t.x, t.y - 4);
        ctx.stroke();
        ctx.strokeStyle = PALETTE.tree;
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y - 4);
          ctx.lineTo(t.x + Math.cos(a) * t.r, t.y - 4 + Math.sin(a) * t.r * 0.7);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = PALETTE.tree;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.treeDark;
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBoats(cam) {
    // Eight boats moored in the marina, at fixed slips.
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i += 1) {
      const x = MARINA.x + 60 + (i % 2) * 150;
      const y = MARINA.y + 90 + Math.floor(i / 2) * 330;
      if (x < cam.x0 - 60 || x > cam.x1 + 60 || y < cam.y0 - 60 || y > cam.y1 + 60) continue;
      ctx.fillStyle = i % 3 === 0 ? '#e8e8e8' : i % 3 === 1 ? '#d8ecf8' : '#f8ecd8';
      rr(ctx, x, y, 26, 84, 12);
      ctx.fill();
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(x + 9, y + 30, 8, 24);
    }
  }

  function drawBeachUmbrellas(cam) {
    for (let x = 200; x < WORLD.width - 100; x += 260) {
      const y = BEACH_TOP + 90 + ((x * 37) % 60);
      if (x < cam.x0 - 40 || x > cam.x1 + 40 || y < cam.y0 - 40 || y > cam.y1 + 40) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(x + 4, y + 6, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = (x / 260) % 2 < 1 ? '#e53b3b' : '#2b6fe3';
      ctx.beginPath();
      ctx.arc(x, y, 16, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawMissionMarker(game, time) {
    const target = game.missionTarget;
    if (!target) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    // A tall light beam, visible across the neighbourhood.
    const grad = ctx.createLinearGradient(target.x, target.y - 220, target.x, target.y);
    grad.addColorStop(0, 'rgba(255,217,77,0)');
    grad.addColorStop(1, 'rgba(255,217,77,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 14, target.y - 220, 28, 220);
    ctx.strokeStyle = PALETTE.missionMarker;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 46 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.missionMarker;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 26);
    ctx.lineTo(target.x + 14, target.y + 4);
    ctx.lineTo(target.x - 14, target.y + 4);
    ctx.closePath();
    ctx.fill();
  }

  function drawPickups(game) {
    for (const item of game.pickups) {
      const bob = Math.sin(item.bob) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(item.x, item.y + 10, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const y = item.y + bob;
      if (item.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        rr(ctx, item.x - 11, y - 11, 22, 22, 5);
        ctx.fill();
        ctx.fillStyle = '#e53b3b';
        ctx.fillRect(item.x - 3, y - 8, 6, 16);
        ctx.fillRect(item.x - 8, y - 3, 16, 6);
      } else if (item.kind === 'ammo') {
        ctx.fillStyle = '#2b2b2b';
        rr(ctx, item.x - 11, y - 11, 22, 22, 5);
        ctx.fill();
        ctx.fillStyle = '#ffd94d';
        for (let i = -1; i <= 1; i += 1) ctx.fillRect(item.x + i * 6 - 2, y - 7, 4, 14);
      } else {
        ctx.fillStyle = '#1f9d55';
        ctx.beginPath();
        ctx.arc(item.x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        text('$', item.x, y + 6, 16, '#ffffff', 'center', 800);
      }
    }
  }

  function drawCar(game, car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const l = car.length;
    const w = car.width;
    // Shadow and wheels.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, -l / 2 + 4, -w / 2 + 5, l, w, 8);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    const wheelW = 10;
    const wheelH = 6;
    ctx.fillRect(-l / 2 + 8, -w / 2 - 2, wheelW, wheelH);
    ctx.fillRect(-l / 2 + 8, w / 2 - 4, wheelW, wheelH);
    ctx.fillRect(l / 2 - 18, -w / 2 - 2, wheelW, wheelH);
    ctx.fillRect(l / 2 - 18, w / 2 - 4, wheelW, wheelH);
    // Body.
    ctx.fillStyle = car.color;
    rr(ctx, -l / 2, -w / 2, l, w, 9);
    ctx.fill();
    // Police livery: black doors and a light bar.
    if (car.type === 'police') {
      ctx.fillStyle = '#1c2733';
      ctx.fillRect(-l * 0.08, -w / 2 + 1, l * 0.3, w - 2);
      ctx.fillStyle = '#1c2733';
      ctx.fillRect(-l / 2 + 2, -w / 2 + 1, l * 0.2, w - 2);
      const flash = Math.floor(time * 6 + car.sirenPhase) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
      rr(ctx, -6, -w / 2 + 4, 12, 8, 3);
      ctx.fill();
      ctx.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
      rr(ctx, -6, w / 2 - 12, 12, 8, 3);
      ctx.fill();
    }
    // Windshield, rear window, roof.
    ctx.fillStyle = 'rgba(30,50,70,0.85)';
    rr(ctx, l * 0.08, -w / 2 + 4, l * 0.2, w - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,50,70,0.7)';
    rr(ctx, -l * 0.36, -w / 2 + 4, l * 0.16, w - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-l * 0.18, -w / 2 + 4, l * 0.24, w - 8);
    if (car.type === 'taxi') {
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(-4, -6, 12, 12);
      ctx.fillStyle = '#1a1a1a';
      text('TAXI', 2, 4, 8, '#1a1a1a', 'center', 800);
    }
    if (car.type === 'truck') {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(-l / 2 + 4, -w / 2 + 4, l * 0.55, w - 8);
    }
    // Damage: dents show as dark patches.
    if (car.hp < 60) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(-l * 0.3, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // The player's car gets a subtle outline so it reads at a glance.
    if (car === game.player.car) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      rr(ctx, -l / 2 - 3, -w / 2 - 3, l + 6, w + 6, 11);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPerson(x, y, angle, shirt, skin, bob, armed) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const lift = Math.abs(Math.sin(bob)) * 1.5;
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(x, y - lift, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 3, y - lift + Math.sin(angle) * 3 - 1, 6, 0, Math.PI * 2);
    ctx.fill();
    if (armed) {
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8);
      ctx.lineTo(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20);
      ctx.stroke();
    }
  }

  function drawBullets(game) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(game) {
    for (const p of game.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = clamp(t, 0, 1);
      ctx.fillStyle = p.color;
      const size = p.shrink ? p.size * (0.4 + 0.6 * t) : p.size;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- screens ---------------------------------------------------------

  /** True when the mouse is over the button, for the hover highlight. */
  function hovered(b, mouse) {
    return !!mouse && mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h;
  }

  function drawTitle(game, ui, time) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.62)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    const top = view.h * 0.12;
    text(GAME_TITLE, cx, top + 62, 64, '#ffd94d', 'center', 900);
    text(`${CITY_NAME} · an open-world crime story`, cx, top + 96, 20, '#f5f2ea', 'center', 500);
    text('You came to Solmar Bay with $120 and a borrowed jacket. Rosa and Marco run the', cx, top + 138, 16, '#cfc9ba', 'center');
    text('harbour jobs — and they need a driver who can steal a car, lose the cops and', cx, top + 162, 16, '#cfc9ba', 'center');
    text('keep their mouth shut. Four jobs stand between you and the big score.', cx, top + 186, 16, '#cfc9ba', 'center');

    const controls = [
      'WASD / Arrows — move & drive',
      'Mouse — aim · Click — shoot · F — punch',
      'E — steal / leave car · Shift — run · Space — handbrake',
      'P / Esc — pause · M — mute',
    ];
    const panelY = top + 214;
    panel(cx - 330, panelY, 660, 30 + controls.length * 26);
    controls.forEach((line, i) => {
      text(line, cx, panelY + 30 + i * 26, 15, '#e8e4d8', 'center');
    });

    const buttons = titleButtons(ui.hasSave);
    buttons.forEach((b, i) => {
      const hover = hovered(b, ui.mouse);
      ctx.fillStyle = i === 0 ? (hover ? '#ff7a3c' : '#ff5a3c') : (hover ? '#3a4556' : '#2a3342');
      rr(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      text(b.label, b.x + b.w / 2, b.y + 30, 19, '#ffffff', 'center', 700);
    });
    text('Progress saves automatically. Headphones on — the city hums.', cx, view.h - 26, 13, '#8b93a3', 'center');
  }

  function titleButtons(hasSave) {
    const cx = view.w / 2;
    const top = view.h * 0.12 + 214 + 30 + 4 * 26 + 34;
    const buttons = [
      { label: hasSave ? 'Continue' : 'Start Game', action: 'start', x: cx - BUTTON_W / 2, y: top, w: BUTTON_W, h: BUTTON_H },
    ];
    if (hasSave) {
      buttons.push({ label: 'New Game', action: 'new', x: cx - BUTTON_W / 2, y: top + BUTTON_H + 12, w: BUTTON_W, h: BUTTON_H });
    }
    return buttons;
  }

  function drawPaused(game, ui) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    text('PAUSED', cx, view.h * 0.24, 48, '#f5f2ea', 'center', 900);
    text('Solmar Bay waits for no one. Well — except now.', cx, view.h * 0.24 + 34, 16, '#cfc9ba', 'center');
    const buttons = pauseButtons();
    buttons.forEach((b) => {
      ctx.fillStyle = hovered(b, ui.mouse) ? '#3a4556' : '#2a3342';
      rr(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      text(b.label, b.x + b.w / 2, b.y + 30, 19, '#ffffff', 'center', 700);
    });
  }

  function pauseButtons() {
    const cx = view.w / 2;
    const top = view.h * 0.24 + 70;
    return [
      { label: 'Resume', action: 'resume', x: cx - BUTTON_W / 2, y: top, w: BUTTON_W, h: BUTTON_H },
      { label: 'Save & Quit to Title', action: 'quit', x: cx - BUTTON_W / 2, y: top + BUTTON_H + 12, w: BUTTON_W, h: BUTTON_H },
    ];
  }

  function drawOver(game, ui) {
    ctx.fillStyle = 'rgba(20, 4, 4, 0.66)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    text('GAME OVER', cx, view.h * 0.3, 56, '#ff5a3c', 'center', 900);
    text('You went down in Solmar Bay. The bay keeps your car —', cx, view.h * 0.3 + 40, 17, '#e8e4d8', 'center');
    text('but your cash and your missions are saved.', cx, view.h * 0.3 + 66, 17, '#e8e4d8', 'center');
    const buttons = overButtons();
    buttons.forEach((b) => {
      ctx.fillStyle = hovered(b, ui.mouse) ? '#ff7a3c' : '#ff5a3c';
      rr(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      text(b.label, b.x + b.w / 2, b.y + 30, 19, '#ffffff', 'center', 700);
    });
  }

  function overButtons() {
    const cx = view.w / 2;
    const top = view.h * 0.3 + 110;
    return [
      { label: 'Back on the Street', action: 'retry', x: cx - BUTTON_W / 2, y: top, w: BUTTON_W, h: BUTTON_H },
      { label: 'Title Screen', action: 'title', x: cx - BUTTON_W / 2, y: top + BUTTON_H + 12, w: BUTTON_W, h: BUTTON_H },
    ];
  }

  function drawBriefing(game, ui) {
    const mission = game.briefing;
    if (!mission) return;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    const w = 640;
    const h = 300;
    const x = (view.w - w) / 2;
    const y = (view.h - h) / 2;
    panel(x, y, w, h);
    text(mission.title, x + 32, y + 48, 30, '#ffd94d', 'left', 800);
    text(`From ${mission.giver} · Reward $${mission.reward}`, x + 32, y + 78, 16, '#cfc9ba', 'left', 600);
    mission.brief.forEach((line, i) => {
      text(line, x + 32, y + 118 + i * 26, 16, '#f5f2ea', 'left');
    });
    const b = briefingButton();
    ctx.fillStyle = hovered(b, ui.mouse) ? '#ff7a3c' : '#ff5a3c';
    rr(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    text("Let's go", b.x + b.w / 2, b.y + 30, 19, '#ffffff', 'center', 700);
  }

  function briefingButton() {
    const w = 640;
    const h = 300;
    const x = (view.w - w) / 2;
    const y = (view.h - h) / 2;
    return { label: "Let's go", action: 'go', x: x + w / 2 - 110, y: y + h - 64, w: 220, h: BUTTON_H };
  }

  // ---- the frame -------------------------------------------------------

  /** Paint one frame: the world through the camera, then the screen on top. */
  function draw(game, screen, ui) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, view.w, view.h);

    const cam = game.camera;
    const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    const cx = clamp(cam.x, view.w / 2 - 200, WORLD.width - view.w / 2 + 200);
    const cy = clamp(cam.y, view.h / 2 - 200, WORLD.height - view.h / 2 + 200);
    const camBox = {
      x0: cx - view.w / 2 - 60, y0: cy - view.h / 2 - 60,
      x1: cx + view.w / 2 + 60, y1: cy + view.h / 2 + 60,
    };
    ctx.save();
    ctx.translate(view.w / 2 - cx + shakeX, view.h / 2 - cy + shakeY);
    drawGround(camBox);
    drawRoads();
    drawRespray(game.city);
    drawBuildings(game.city, camBox);
    drawBoats(camBox);
    drawBeachUmbrellas(camBox);
    drawTrees(game.city, camBox);
    drawMissionMarker(game, game.time);
    drawPickups(game);
    for (const car of game.cars) drawCar(game, car, game.time);
    for (const ped of game.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.step, false);
    }
    for (const cop of game.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#2a3a5a', '#e8b88a', game.time * 8, true);
    }
    for (const e of game.enemies) {
      drawPerson(e.x, e.y, e.angle, '#7a2a2a', '#c98a5a', game.time * 8, true);
    }
    const player = game.player;
    if (!player.car && player.hp > 0) {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, '#e8b88a', game.time * 8, true);
      // Aim line: a short tick showing where the pistol points.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
      ctx.lineTo(player.x + Math.cos(player.angle) * 34, player.y + Math.sin(player.angle) * 34);
      ctx.stroke();
    }
    drawBullets(game);
    drawParticles(game);
    ctx.restore();

    if (screen === SCREEN_TITLE) drawTitle(game, ui, game.time);
    else if (screen === SCREEN_PAUSED) drawPaused(game, ui);
    else if (screen === SCREEN_OVER) drawOver(game, ui);
    else if (game.briefing) drawBriefing(game, ui);
  }

  return {
    draw,
    titleButtons,
    pauseButtons,
    overButtons,
    briefingButton,
    size() {
      return { w: view.w, h: view.h };
    },
  };
}

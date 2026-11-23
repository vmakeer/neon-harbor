// Combat and pickups: the pistol, bullets and melee, rival gang members
// who shoot back, health/ammo/cash pickups, and the particles — smoke,
// sparks, muzzle flashes and explosions — that make a fight feel alive.

import { PALETTE, PICKUPS, PLAYER } from './config.js';
import { collideCircle, pointInBuilding, randomSidewalkPoint } from './world.js';
import { addWanted } from './police.js';
import { range } from './random.js';

/** One particle: smoke, spark, flash or debris. */
export function addParticle(game, x, y, opts) {
  if (game.particles.length > 400) game.particles.shift();
  game.particles.push({
    x, y,
    vx: opts.vx ?? 0,
    vy: opts.vy ?? 0,
    life: opts.life ?? 0.5,
    maxLife: opts.life ?? 0.5,
    size: opts.size ?? 4,
    color: opts.color ?? '#ffffff',
    gravity: opts.gravity ?? 0,
    shrink: opts.shrink ?? true,
  });
}

/** A burst of particles flying out in all directions. */
export function burst(game, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = range(game.rng, 0, Math.PI * 2);
    const s = range(game.rng, speed * 0.3, speed);
    addParticle(game, x, y, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: range(game.rng, life * 0.5, life), size: range(game.rng, size * 0.5, size),
      color, gravity: 60,
    });
  }
}

/** A car explodes: fire, smoke, a shockwave of damage, and a scare. */
export function explodeAt(game, x, y) {
  burst(game, x, y, 26, '#ff7a2a', 260, 0.7, 9);
  burst(game, x, y, 16, '#ffd94d', 180, 0.4, 7);
  burst(game, x, y, 12, '#5a5a5a', 90, 1.6, 12);
  game.camera.shake = Math.max(game.camera.shake, 14);
  game.scares.push({ x, y, r: 520 });
  game.events.push({ type: 'explosion', x, y });
  // The blast hurts anyone close, player included.
  const hurt = (px, py, radius, amount) => {
    const dx = px - x;
    const dy = py - y;
    return dx * dx + dy * dy < radius * radius ? amount : 0;
  };
  const p = game.player.car ? game.player.car : game.player;
  const dmg = hurt(p.x, p.y, 150, 45);
  if (dmg) damagePlayer(game, dmg);
  for (const cop of game.cops) cop.hp -= hurt(cop.x, cop.y, 150, 80);
  for (const e of game.enemies) e.hp -= hurt(e.x, e.y, 150, 80);
  for (const car of game.cars) {
    const d = hurt(car.x, car.y, 130, 60);
    if (d) {
      car.hp -= d;
      if (car.hp <= 0 && car !== game.player.car) game.events.push({ type: 'explode', x: car.x, y: car.y });
    }
  }
}

/** Fire a bullet from (x, y) along `angle`. `from` is 'player', 'cop' or 'gang'. */
export function fireBullet(game, x, y, angle, damage, from) {
  game.bullets.push({
    x: x + Math.cos(angle) * 18,
    y: y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    life: PLAYER.bulletRange / PLAYER.bulletSpeed,
    damage, from,
  });
}

/** The player fires the pistol toward the aim angle. Returns true if a shot went off. */
export function playerShoot(game, aimAngle) {
  const player = game.player;
  if (player.fireCooldown > 0 || player.ammo <= 0 || player.hp <= 0) return false;
  player.fireCooldown = 1 / PLAYER.fireRate;
  player.ammo -= 1;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  fireBullet(game, px, py, aimAngle, PLAYER.bulletDamage, 'player');
  // Muzzle flash and a crack that scares the street.
  addParticle(game, px + Math.cos(aimAngle) * 24, py + Math.sin(aimAngle) * 24, {
    life: 0.07, size: 10, color: '#ffe066', shrink: false,
  });
  game.scares.push({ x: px, y: py, r: 420 });
  game.events.push({ type: 'gunshot', x: px, y: py });
  addWanted(game, 0.12);
  return true;
}

/** A swing at whatever is closest in front of the player. */
export function playerMelee(game) {
  const player = game.player;
  if (player.meleeCooldown > 0 || player.car || player.hp <= 0) return false;
  player.meleeCooldown = 1 / PLAYER.meleeRate;
  const range2 = PLAYER.meleeRange + 14;
  const hit = (t) => {
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    if (dx * dx + dy * dy > range2 * range2) return false;
    t.hp -= PLAYER.meleeDamage;
    burst(game, t.x, t.y, 5, '#ffffff', 120, 0.3, 4);
    return true;
  };
  let landed = false;
  for (const cop of game.cops) if (hit(cop)) { landed = true; addWanted(game, 0.6); }
  for (const e of game.enemies) if (hit(e)) landed = true;
  for (const ped of game.peds) if (hit(ped)) { landed = true; addWanted(game, 0.8); }
  if (landed) game.events.push({ type: 'melee', x: player.x, y: player.y });
  return landed;
}

/** Hurt the player; the main loop turns hp <= 0 into game over. */
export function damagePlayer(game, amount) {
  if (game.player.hp <= 0) return;
  game.player.hp = Math.max(0, game.player.hp - amount);
  game.camera.shake = Math.max(game.camera.shake, 5);
  game.events.push({ type: 'hurt' });
  if (game.player.hp <= 0) game.events.push({ type: 'died' });
}

/** Move bullets, spark off walls, and land hits. */
export function updateBullets(game, dt) {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(game.city, b.x, b.y)) {
      burst(game, b.x, b.y, 4, '#ffd94d', 140, 0.25, 3);
      dead = true;
    }
    if (!dead && b.from === 'player') {
      // Player bullets hit cops, gang members, peds and cars.
      for (const cop of game.cops) {
        if (Math.hypot(cop.x - b.x, cop.y - b.y) < 14) {
          cop.hp -= b.damage;
          burst(game, b.x, b.y, 6, '#e53b3b', 120, 0.3, 4);
          if (cop.hp <= 0) addWanted(game, 1);
          dead = true;
          break;
        }
      }
      if (!dead) for (const e of game.enemies) {
        if (Math.hypot(e.x - b.x, e.y - b.y) < 14) {
          e.hp -= b.damage;
          burst(game, b.x, b.y, 6, '#e53b3b', 120, 0.3, 4);
          dead = true;
          break;
        }
      }
      if (!dead) for (let p = game.peds.length - 1; p >= 0; p -= 1) {
        const ped = game.peds[p];
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
          burst(game, b.x, b.y, 8, '#e53b3b', 140, 0.4, 5);
          game.peds.splice(p, 1);
          addWanted(game, 1);
          dead = true;
          break;
        }
      }
      if (!dead) for (const car of game.cars) {
        if (car === game.player.car) continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < 30) {
          car.hp -= b.damage / 2;
          burst(game, b.x, b.y, 4, '#ffd94d', 140, 0.25, 3);
          if (car.hp <= 0) game.events.push({ type: 'explode', x: car.x, y: car.y });
          dead = true;
          break;
        }
      }
    } else if (!dead) {
      // Enemy bullets hit the player (or the car they are driving).
      const target = game.player.car ?? game.player;
      const radius = game.player.car ? 30 : 13;
      if (Math.hypot(target.x - b.x, target.y - b.y) < radius) {
        if (game.player.car) game.player.car.hp -= b.damage / 2;
        damagePlayer(game, b.damage);
        dead = true;
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

/** Gang members: close in on the player and shoot when in range. */
export function updateEnemies(game, dt) {
  const p = game.player.car ?? game.player;
  for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
    const e = game.enemies[i];
    if (e.hp <= 0) {
      burst(game, e.x, e.y, 8, '#e53b3b', 140, 0.4, 5);
      game.enemies.splice(i, 1);
      game.player.cash += 25; // pocket cash from a fallen rival
      continue;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    e.angle = Math.atan2(dy, dx);
    if (dist > 220) {
      const nx = e.x + Math.cos(e.angle) * e.speed * dt;
      const ny = e.y + Math.sin(e.angle) * e.speed * dt;
      const fixed = collideCircle(game.city, nx, ny, 12);
      e.x = fixed.x;
      e.y = fixed.y;
    }
    e.fireCooldown -= dt;
    if (dist < 420 && e.fireCooldown <= 0 && game.player.hp > 0) {
      e.fireCooldown = 1.1 + range(game.rng, 0, 0.5);
      fireBullet(game, e.x, e.y, e.angle + range(game.rng, -0.14, 0.14), 9, 'gang');
      game.events.push({ type: 'gunshot', x: e.x, y: e.y });
    }
  }
}

/** Scatter health, ammo and cash pickups around the sidewalks. */
export function spawnPickups(city, random) {
  const pickups = [];
  const kinds = ['health', 'ammo', 'cash'];
  for (const kind of kinds) {
    for (let i = 0; i < PICKUPS[kind].count; i += 1) {
      const p = randomSidewalkPoint(random);
      pickups.push({ kind, x: p.x, y: p.y, bob: random() * Math.PI * 2 });
    }
  }
  return pickups;
}

/** Walk (or drive) over a pickup to collect it. */
export function updatePickups(game, dt) {
  const p = game.player.car ?? game.player;
  for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
    const item = game.pickups[i];
    item.bob += dt * 3;
    const dx = item.x - p.x;
    const dy = item.y - p.y;
    if (dx * dx + dy * dy > 34 * 34) continue;
    game.pickups.splice(i, 1);
    if (item.kind === 'health') {
      game.player.hp = Math.min(PLAYER.maxHp, game.player.hp + PICKUPS.health.heal);
      game.message = `+${PICKUPS.health.heal} health`;
    } else if (item.kind === 'ammo') {
      game.player.ammo = Math.min(PLAYER.maxAmmo, game.player.ammo + PICKUPS.ammo.rounds);
      game.message = `+${PICKUPS.ammo.rounds} ammo`;
    } else {
      game.player.cash += PICKUPS.cash.amount;
      game.message = `+$${PICKUPS.cash.amount} cash`;
    }
    game.messageTimer = 2;
    game.events.push({ type: 'pickup', x: item.x, y: item.y });
    burst(game, item.x, item.y, 8, '#7be07b', 120, 0.4, 4);
  }
}

/** Advance particles and drop the dead ones. */
export function updateParticles(game, dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const p = game.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.vx *= 1 - 1.8 * dt;
    p.vy *= 1 - 1.8 * dt;
  }
}

/** Tire smoke behind a fast or handbraking car, damage smoke from a wreck. */
export function carSmoke(game, car, handbrake, dt) {
  const fast = Math.abs(car.speed) > 380;
  if ((handbrake && Math.abs(car.speed) > 120) || fast) {
    const bx = car.x - Math.cos(car.angle) * (car.length / 2);
    const by = car.y - Math.sin(car.angle) * (car.length / 2);
    addParticle(game, bx + range(game.rng, -6, 6), by + range(game.rng, -6, 6), {
      vx: range(game.rng, -20, 20), vy: range(game.rng, -30, -10),
      life: range(game.rng, 0.4, 0.8), size: range(game.rng, 6, 10),
      color: 'rgba(200,200,200,0.55)',
    });
  }
  if (car.smoke > 0.2) {
    addParticle(game, car.x + range(game.rng, -8, 8), car.y + range(game.rng, -8, 8), {
      vx: range(game.rng, -10, 10), vy: range(game.rng, -40, -20),
      life: range(game.rng, 0.6, 1.1), size: range(game.rng, 7, 12),
      color: 'rgba(60,60,60,0.6)',
    });
  }
}

export { PALETTE };

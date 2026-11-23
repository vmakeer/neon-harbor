// Pedestrians: the people of Solmar Bay. They stroll the sidewalks, cross
// at the corners, and run when gunfire or a crash goes off near them.
// They are drawn as simple top-down figures with a shirt, head and shadow.

import { PALETTE, PED, PED_COUNT } from './config.js';
import { collideCircle, randomSidewalkPoint } from './world.js';
import { chance, pick, range } from './random.js';

/** A fresh pedestrian wandering near (x, y). */
export function createPed(random, x, y) {
  return {
    x, y,
    angle: range(random, 0, Math.PI * 2),
    speed: 0,
    shirt: pick(random, PALETTE.ped),
    skin: pick(random, ['#e8b88a', '#c98a5a', '#8a5a3a', '#f0c8a0']),
    // Walking state: where it is headed and how long it has been going.
    tx: x,
    ty: y,
    wait: range(random, 0, 3),
    flee: 0, // seconds left of running away
    fleeX: 0,
    fleeY: 0,
    step: random() * Math.PI * 2, // walk-cycle phase, for the bob
  };
}

/** Scatter pedestrians along the sidewalks. */
export function spawnPeds(city, random) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const p = randomSidewalkPoint(random);
    peds.push(createPed(random, p.x, p.y));
  }
  return peds;
}

/** A scare at (x, y): every ped in radius starts running away from it. */
export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    const dx = ped.x - x;
    const dy = ped.y - y;
    if (dx * dx + dy * dy > radius * radius) continue;
    ped.flee = range(game.rng, 2.5, 5);
    ped.fleeX = ped.x + dx * 2 + range(game.rng, -60, 60);
    ped.fleeY = ped.y + dy * 2 + range(game.rng, -60, 60);
  }
}

/** Walk the sidewalks, or run when scared. */
export function updatePeds(game, dt) {
  for (const ped of game.peds) {
    ped.step += dt * (ped.flee > 0 ? 14 : 7);
    let targetX;
    let targetY;
    let speed;
    if (ped.flee > 0) {
      ped.flee -= dt;
      targetX = ped.fleeX;
      targetY = ped.fleeY;
      speed = PED.fleeSpeed;
    } else if (ped.wait > 0) {
      ped.wait -= dt;
      continue;
    } else {
      targetX = ped.tx;
      targetY = ped.ty;
      speed = PED.walkSpeed;
      const dx = targetX - ped.x;
      const dy = targetY - ped.y;
      if (dx * dx + dy * dy < 24 * 24) {
        // Reached the corner: pause, then pick a new stroll.
        ped.wait = range(game.rng, 0.5, 4);
        const next = randomSidewalkPoint(game.rng);
        // Keep the stroll local: a nearby sidewalk point, not across town.
        ped.tx = ped.x + (next.x - ped.x) * 0.25;
        ped.ty = ped.y + (next.y - ped.y) * 0.25;
        continue;
      }
    }
    const dx = targetX - ped.x;
    const dy = targetY - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;
    const want = Math.atan2(dy, dx);
    let diff = want - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-6 * dt, Math.min(6 * dt, diff));
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const fixed = collideCircle(game.city, nx, ny, PED.radius);
    ped.x = fixed.x;
    ped.y = fixed.y;
    // A ped pushed into a building wall picks a new direction.
    if (Math.hypot(fixed.x - nx, fixed.y - ny) > 1) {
      ped.angle += chance(game.rng, 0.5) ? Math.PI / 2 : -Math.PI / 2;
      ped.tx = ped.x + Math.cos(ped.angle) * 200;
      ped.ty = ped.y + Math.sin(ped.angle) * 200;
    }
  }
}

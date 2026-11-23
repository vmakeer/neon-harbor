// The wanted level and the Solmar Bay police. Heat rises when the player
// shoots, kills, steals in view of a cop or wrecks cars; it falls when the
// player stays out of sight, and the respray shop clears it for cash.
// Foot cops give chase and shoot; police cars ram and box the player in.

import { CAR, CAR_TYPES, POLICE } from './config.js';
import { collideCircle, nearestRoadPoint } from './world.js';
import { createCar, driveCar } from './vehicles.js';
import { range } from './random.js';

/** Raise the wanted level by `amount` stars (fractional heat is kept). */
export function addWanted(game, amount) {
  game.wanted = Math.min(POLICE.maxStars, game.wanted + amount);
  game.hiddenTime = 0;
}

/** Where the player is right now: on foot or in the car they drive. */
export function playerPos(game) {
  if (game.player.car) return { x: game.player.car.x, y: game.player.car.y };
  return { x: game.player.x, y: game.player.y };
}

/** True when any cop or police car can see the player (close, roughly). */
export function policeCanSee(game) {
  const p = playerPos(game);
  for (const cop of game.cops) {
    const dx = cop.x - p.x;
    const dy = cop.y - p.y;
    if (dx * dx + dy * dy < 520 * 520) return true;
  }
  for (const car of game.cars) {
    if (car.kind !== 'police') continue;
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    if (dx * dx + dy * dy < 620 * 620) return true;
  }
  return false;
}

function spawnCop(game, x, y) {
  game.cops.push({
    x, y,
    angle: 0,
    hp: 50,
    fireCooldown: range(game.rng, 0.4, 1.4),
    speed: 205,
  });
}

function spawnPoliceCar(game, x, y, angle) {
  const car = createCar(game.rng, 'police', x, y, angle, 'police');
  car.speed = 120;
  game.cars.push(car);
  return car;
}

/** Keep the responding force matched to the wanted level. */
function reinforce(game) {
  const stars = Math.floor(game.wanted);
  const wantCars = POLICE.carsPerStar[stars] ?? 0;
  const wantCops = POLICE.copsPerStar[stars] ?? 0;
  const p = playerPos(game);
  const haveCars = game.cars.filter((c) => c.kind === 'police').length;
  const haveCops = game.cops.length;
  game.reinforceTimer -= 1 / 60;
  if (game.reinforceTimer > 0) return;
  game.reinforceTimer = 1.2;
  if (haveCars < wantCars) {
    // A patrol car joins from the nearest road, a little way off.
    const road = nearestRoadPoint(p.x + range(game.rng, -500, 500), p.y + range(game.rng, -500, 500));
    spawnPoliceCar(game, road.x, road.y, Math.atan2(p.y - road.y, p.x - road.x));
    return;
  }
  if (haveCops < wantCops) {
    const a = range(game.rng, 0, Math.PI * 2);
    const d = range(game.rng, 320, 520);
    spawnCop(game, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
  }
}

/** Steer a police car at the player, ramming when close. */
function chaseCar(game, car, dt) {
  const p = playerPos(game);
  const dx = p.x - car.x;
  const dy = p.y - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  // Ease off the throttle for a hairpin, floor it on a straight chase.
  const throttle = Math.abs(diff) > 1.1 ? 0.25 : 1;
  const before = car.speed;
  driveCar(game, car, throttle, steer, false, dt);
  car.speed = Math.min(car.speed, CAR.maxSpeed * CAR_TYPES.police.speed * POLICE.chaseSpeed);
  // A hard ram hurts the player and shakes the camera.
  if (game.player.car && dist < 70 && Math.abs(before) > 200) {
    game.player.hp -= POLICE.ramDamage * dt * 8;
    game.camera.shake = Math.max(game.camera.shake, 6);
    game.events.push({ type: 'crash', x: car.x, y: car.y, power: 200 });
  }
  // A police car far behind respawns closer, so the chase never dies out.
  if (dist > 1400) {
    const road = nearestRoadPoint(p.x, p.y);
    car.x = road.x;
    car.y = road.y;
    car.angle = Math.atan2(p.y - road.y, p.x - road.x);
    car.speed = 200;
  }
}

/** A foot cop runs at the player and shoots when in range. */
function chaseCop(game, cop, dt) {
  const p = playerPos(game);
  const dx = p.x - cop.x;
  const dy = p.y - cop.y;
  const dist = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  if (dist > 130) {
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    const fixed = collideCircle(game.city, nx, ny, 12);
    cop.x = fixed.x;
    cop.y = fixed.y;
  }
  cop.fireCooldown -= dt;
  if (dist < POLICE.copShootRange && cop.fireCooldown <= 0 && game.player.hp > 0) {
    cop.fireCooldown = 1 / POLICE.copFireRate + range(game.rng, 0, 0.4);
    game.events.push({
      type: 'enemyShot', x: cop.x, y: cop.y,
      angle: cop.angle + range(game.rng, -0.12, 0.12),
      damage: POLICE.copDamage, from: 'cop',
    });
  }
  // A cop left far behind gives up the foot chase and fades out.
  if (dist > 1200) cop.hp = 0;
}

/** The respray shop: drive in with cash and the heat is washed off. */
export function tryRespray(game) {
  const shop = game.city.places.respray;
  const car = game.player.car;
  if (!car || game.wanted < 1) return false;
  const inside = car.x > shop.x && car.x < shop.x + shop.w && car.y > shop.y && car.y < shop.y + shop.h;
  if (!inside || game.player.cash < POLICE.resprayCost) return false;
  game.player.cash -= POLICE.resprayCost;
  game.wanted = 0;
  game.cops.length = 0;
  // The patrol cars give up and drive off.
  for (const c of game.cars) if (c.kind === 'police') c.kind = 'traffic';
  game.events.push({ type: 'respray', x: car.x, y: car.y });
  game.message = `Respray done — $${POLICE.resprayCost}. The heat is off.`;
  game.messageTimer = 4;
  return true;
}

/** Wanted decay, reinforcements, chases. Call once per step. */
export function updatePolice(game, dt) {
  if (game.wanted > 0) {
    if (policeCanSee(game)) game.hiddenTime = 0;
    else {
      game.hiddenTime += dt;
      if (game.hiddenTime > POLICE.hideTime) {
        game.wanted = Math.max(0, game.wanted - POLICE.decayPerSecond * dt);
        if (game.wanted < 1) {
          game.cops.length = 0;
          for (const c of game.cars) if (c.kind === 'police') c.kind = 'traffic';
        }
      }
    }
    reinforce(game);
  }
  for (const car of game.cars) {
    if (car.kind === 'police') chaseCar(game, car, dt);
  }
  for (let i = game.cops.length - 1; i >= 0; i -= 1) {
    const cop = game.cops[i];
    if (cop.hp <= 0) {
      game.cops.splice(i, 1);
      continue;
    }
    chaseCop(game, cop, dt);
  }
}

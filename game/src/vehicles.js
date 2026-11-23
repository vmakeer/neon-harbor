// Cars: the types, the parked cars waiting to be stolen, the traffic that
// drives the city's lanes, and the arcade driving physics every car shares
// (player, traffic and police alike). Collisions are circles, so a car
// slides along a building instead of snagging on its corners.

import { CAR, CAR_TYPES, PARKED_COUNT, ROAD_WIDTH, ROADS_H, ROADS_V, TRAFFIC_COUNT } from './config.js';
import { collideCircle, isOnRoad, randomRoadPoint } from './world.js';
import { chance, pick, range } from './random.js';

let nextId = 1;

function typeDef(type) {
  return CAR_TYPES[type];
}

/** A fresh car of `type` at (x, y) facing `angle`. */
export function createCar(random, type, x, y, angle, kind) {
  const def = typeDef(type);
  return {
    id: nextId,
    type, kind,
    x, y, angle,
    speed: 0,
    color: pick(random, def.colors),
    length: def.length,
    width: def.width,
    hp: 100,
    // Traffic state: the intersection it is driving toward.
    target: null,
    wait: 0,
    siren: kind === 'police',
    sirenPhase: random() * Math.PI * 2,
    smoke: 0,
    honk: 0,
  };
}

/** Parked cars along the roadsides, angled with the road, free to steal. */
export function spawnParkedCars(city, random) {
  const cars = [];
  const types = ['sedan', 'sedan', 'taxi', 'truck', 'sports', 'van'];
  for (let i = 0; i < PARKED_COUNT; i += 1) {
    const vertical = chance(random, 0.5);
    const side = chance(random, 0.5) ? 1 : -1;
    const off = ROAD_WIDTH / 2 - 24;
    let x;
    let y;
    let angle;
    if (vertical) {
      x = pick(random, ROADS_V) + side * off;
      y = range(random, 150, 2050);
      angle = chance(random, 0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = range(random, 150, 3050);
      y = pick(random, ROADS_H) + side * off;
      angle = chance(random, 0.5) ? 0 : Math.PI;
    }
    if (pointNearCar(cars, x, y, 90)) continue;
    cars.push(createCar(random, pick(random, types), x, y, angle, 'parked'));
  }
  return cars;
}

/** Traffic cars on the roads, each already driving in a lane. */
export function spawnTrafficCars(city, random) {
  const cars = [];
  const types = ['sedan', 'sedan', 'taxi', 'truck', 'van', 'sports'];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const p = randomRoadPoint(random);
    const vertical = ROADS_V.includes(p.x);
    const dir = chance(random, 0.5) ? 1 : -1;
    // Right-hand traffic: offset to the right of the direction of travel.
    const lane = 26;
    const x = vertical ? p.x + dir * lane : p.x;
    const y = vertical ? p.y : p.y - dir * lane;
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(random, pick(random, types), x, y, angle, 'traffic');
    car.speed = range(random, 150, 230);
    car.target = nextIntersection(random, x, y, angle);
    cars.push(car);
  }
  return cars;
}

function pointNearCar(cars, x, y, dist) {
  for (const c of cars) {
    const dx = c.x - x;
    const dy = c.y - y;
    if (dx * dx + dy * dy < dist * dist) return true;
  }
  return false;
}

/** The next intersection along the car's heading, or a turn at the one ahead. */
export function nextIntersection(random, x, y, angle) {
  const deg = ((angle * 180) / Math.PI % 360 + 360) % 360;
  const east = deg < 45 || deg >= 315;
  const south = deg >= 45 && deg < 135;
  const west = deg >= 135 && deg < 225;
  // Find the next road centreline ahead in the direction of travel.
  if (east) {
    for (const rx of ROADS_V) if (rx > x + 40) return { x: rx, y };
    return { x: 3000, y };
  }
  if (west) {
    for (let i = ROADS_V.length - 1; i >= 0; i -= 1) if (ROADS_V[i] < x - 40) return { x: ROADS_V[i], y };
    return { x: 300, y };
  }
  if (south) {
    for (const ry of ROADS_H) if (ry > y + 40) return { x, y: ry };
    return { x, y: 1900 };
  }
  for (let i = ROADS_H.length - 1; i >= 0; i -= 1) if (ROADS_H[i] < y - 40) return { x, y: ROADS_H[i] };
  return { x, y: 300 };
}

/** Pick a new heading at an intersection: mostly straight, sometimes a turn. */
export function turnAtIntersection(random, angle) {
  const r = random();
  if (r < 0.55) return angle; // straight on
  return angle + (chance(random, 0.5) ? Math.PI / 2 : -Math.PI / 2);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Drive one car for a step. throttle in [-1, 1], steer in [-1, 1].
 * Returns the impact speed when the car hit something hard, else 0.
 */
export function driveCar(game, car, throttle, steer, handbrake, dt) {
  const def = typeDef(car.type);
  const onRoad = isOnRoad(car.x, car.y);
  const maxSpeed = CAR.maxSpeed * def.speed;
  const accel = CAR.accel * def.accel;

  if (throttle > 0) car.speed += throttle * accel * dt;
  else if (throttle < 0) {
    // S brakes while moving forward, reverses once stopped.
    if (car.speed > 5) car.speed += throttle * CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed + throttle * accel * 0.7 * dt);
  }
  // Drag: gentle on tarmac, heavy off-road, brutal with the handbrake.
  let drag = CAR.drag;
  if (!onRoad) drag += CAR.offRoadDrag;
  if (handbrake) drag += CAR.handbrakeDrag;
  car.speed -= car.speed * drag * dt * 0.6;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
  car.speed = Math.max(-CAR.reverseMax, Math.min(maxSpeed, car.speed));

  // Steering bites with speed and flips in reverse.
  const speedFactor = Math.max(-1, Math.min(1, car.speed / (maxSpeed * 0.55)));
  const grip = handbrake ? 0.55 : 1;
  car.angle += steer * CAR.turnRate * speedFactor * grip * dt * (car.speed < 0 ? -1 : 1);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  const fixed = collideCircle(game.city, nx, ny, CAR.radius);
  car.x = fixed.x;
  car.y = fixed.y;

  // A big correction means a wall: lose speed, take damage, make noise.
  const pushed = Math.hypot(car.x - nx, car.y - ny);
  let impact = 0;
  if (pushed > 0.5) {
    impact = Math.abs(car.speed);
    car.speed *= 0.35;
    if (impact > 120) {
      car.hp -= (impact - 120) / 18;
      game.scares.push({ x: car.x, y: car.y, r: 320 });
      game.events.push({ type: 'crash', x: car.x, y: car.y, power: impact });
      if (car.hp <= 0) game.events.push({ type: 'explode', x: car.x, y: car.y });
    }
  }
  if (Math.hypot(car.x - before.x, car.y - before.y) < 0.01 && Math.abs(car.speed) > 60) car.speed *= 0.5;
  if (car.hp < 35) car.smoke = Math.min(1, car.smoke + dt * 0.5);
  return impact;
}

/** Circle collisions between cars: push apart, trade speed, spark on hard hits. */
export function collideCars(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = CAR.radius * 2 - 8;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 140) {
        a.hp -= rel / 40;
        b.hp -= rel / 40;
        game.scares.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 320 });
        game.events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: rel });
        if (a.hp <= 0) game.events.push({ type: 'explode', x: a.x, y: a.y });
        if (b.hp <= 0) game.events.push({ type: 'explode', x: b.x, y: b.y });
      }
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.7;
      b.speed = avg * 0.7;
    }
  }
}

/** Steer one traffic car toward its target intersection, braking for cars ahead. */
function driveTraffic(game, car, dt) {
  if (!car.target) car.target = nextIntersection(game.rng, car.x, car.y, car.angle);
  const dx = car.target.x - car.x;
  const dy = car.target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 30) {
    car.angle = turnAtIntersection(game.rng, car.angle);
    car.target = nextIntersection(game.rng, car.x, car.y, car.angle);
    return;
  }
  const wanted = Math.atan2(dy, dx);
  const diff = angleDiff(car.angle, wanted);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));

  // Brake for a car stopped or slow ahead.
  let throttle = 0.55;
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  for (const other of game.cars) {
    if (other === car) continue;
    const odx = other.x - aheadX;
    const ody = other.y - aheadY;
    if (odx * odx + ody * ody < 60 * 60 && Math.abs(other.speed) < Math.abs(car.speed)) {
      throttle = -0.8;
      break;
    }
  }
  // Ease off for a sharp turn.
  if (Math.abs(diff) > 0.9) throttle = Math.min(throttle, 0.15);
  driveCar(game, car, throttle, steer, false, dt);
  // A traffic car that got knocked off the road finds its way back.
  if (!isOnRoad(car.x, car.y) && Math.abs(car.speed) < 20) {
    car.angle = turnAtIntersection(game.rng, car.angle);
    car.target = nextIntersection(game.rng, car.x, car.y, car.angle);
  }
}

/** Advance every car that is not the player's. Police cars are driven by police.js. */
export function updateTraffic(game, dt) {
  for (const car of game.cars) {
    if (car.kind === 'traffic') driveTraffic(game, car, dt);
    else if (car.kind === 'parked') {
      // Parked cars stay put; a wrecked one burns out and is removed later.
      car.speed = 0;
    }
  }
  collideCars(game);
  // Remove burnt-out wrecks, and respawn traffic far from the player.
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car.hp <= 0 && car.kind !== 'player') {
      game.cars.splice(i, 1);
      if (car.kind === 'traffic') {
        const fresh = spawnTrafficCars(game.city, game.rng);
        if (fresh.length) game.cars.push(fresh[0]);
      }
    }
  }
}

/** The nearest car within `radius` of (x, y), or null. */
export function nearestCar(game, x, y, radius) {
  let best = null;
  let bestD = radius * radius;
  for (const car of game.cars) {
    const dx = car.x - x;
    const dy = car.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = car;
    }
  }
  return best;
}

/** Speed in km/h for the HUD, from px/s. */
export function speedKmh(car) {
  return Math.round(Math.abs(car.speed) * 0.32);
}

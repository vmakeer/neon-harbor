// The screenshot scenes behind ?shot=cover|drive|foot|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (drive toward the next waypoint,
// walk and shoot on foot), so the frame is what a short game really looks
// like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { createGame, stepGame } from './game.js';
import { createCar } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { SCREEN_PLAY } from './render.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Drive the player's car toward `target`, steering around cars ahead. */
function driveToward(game, target, nextTarget) {
  const car = game.player.car;
  let tx = target.x;
  let ty = target.y;
  let throttle = 1;
  // A sharp turn ahead: brake on the approach so the car can make it.
  if (nextTarget) {
    const legAngle = Math.atan2(target.y - car.y, target.x - car.x);
    const nextAngle = Math.atan2(nextTarget.y - target.y, nextTarget.x - target.x);
    const dist = Math.hypot(car.x - target.x, car.y - target.y);
    if (Math.abs(angleDiff(legAngle, nextAngle)) > 0.6 && dist < 300) {
      throttle = Math.abs(car.speed) > 330 ? -0.6 : 0.3;
    }
  }
  // A car in the way: aim for a point past it, offset to the clear side.
  // The lookahead is long because a chase closes fast; very close, brake.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of game.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const fwd = dx * fx + dy * fy;
    const lat = -dx * fy + dy * fx;
    if (fwd > 10 && fwd < 220 && Math.abs(lat) < 50) {
      const side = lat >= 0 ? -1 : 1; // pass on the side away from the obstacle
      tx = car.x + fx * 170 - fy * side * 70;
      ty = car.y + fy * 170 + fx * side * 70;
      throttle = fwd < 70 ? -0.3 : 0.7;
      break;
    }
  }
  const diff = angleDiff(car.angle, Math.atan2(ty - car.y, tx - car.x));
  return {
    drive: { throttle: Math.abs(diff) > 1.2 ? Math.min(throttle, 0.3) : throttle, steer: clamp(diff * 2.4, -1, 1) },
    handbrake: false,
    aim: { x: car.x + Math.cos(car.angle) * 200, y: car.y + Math.sin(car.angle) * 200 },
    shooting: false,
  };
}

/** Follow a list of waypoints for `seconds`, one step at a time. */
function driveRoute(game, waypoints, seconds) {
  let leg = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = game.player.car;
    if (!car) break;
    const target = waypoints[Math.min(leg, waypoints.length - 1)];
    const dist = Math.hypot(car.x - target.x, car.y - target.y);
    if (dist < 90 && leg < waypoints.length - 1) leg += 1;
    // Past the last waypoint the car keeps driving straight, never U-turns.
    if (leg === waypoints.length - 1 && dist < 90) {
      stepGame(game, {
        drive: { throttle: 1, steer: 0 },
        handbrake: false,
        aim: { x: car.x + Math.cos(car.angle) * 200, y: car.y + Math.sin(car.angle) * 200 },
        shooting: false,
      }, STEP);
      continue;
    }
    stepGame(game, driveToward(game, target, waypoints[leg + 1]), STEP);
  }
}

/** Wipe the wanted level and send the police home (a calm scene). */
function clearHeat(game) {
  game.wanted = 0;
  game.cops.length = 0;
  for (const car of game.cars) if (car.kind === 'police') car.kind = 'traffic';
}

/** Clear parked and traffic cars out of a rectangle, so a staged drive runs clean. */
function clearCorridor(game, x0, y0, x1, y1) {
  game.cars = game.cars.filter((car) => {
    if (car.kind !== 'parked' && car.kind !== 'traffic') return true;
    return car.x < x0 || car.x > x1 || car.y < y0 || car.y > y1;
  });
}

/** Put the player in a fresh car of `type` at (x, y), facing `angle`. */
function giveCar(game, type, x, y, angle, speed) {
  const car = createCar(game.rng, type, x, y, angle, 'player');
  car.speed = speed;
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

/** A police car joining the chase from (x, y). */
function givePolice(game, x, y, angle, speed) {
  const car = createCar(game.rng, 'police', x, y, angle, 'police');
  car.speed = speed;
  game.cars.push(car);
  return car;
}

/** A few extra traffic cars near the action, so the streets look alive. */
function nearbyTraffic(game, spots) {
  for (const s of spots) {
    const car = createCar(game.rng, s.type, s.x, s.y, s.angle, 'traffic');
    car.speed = s.speed ?? 180;
    car.target = { x: s.x + Math.cos(s.angle) * 600, y: s.y + Math.sin(s.angle) * 600 };
    game.cars.push(car);
  }
}

/** Start mission `index` at stage `stage`, briefing already dismissed. */
function setMission(game, index, stage) {
  game.mission.index = index;
  game.mission.stage = stage;
  game.mission.started = true;
  game.mission.briefed = true;
  game.briefing = null;
  game.briefDelay = 9999;
}

// The cover: a three-star chase downtown, mission on the HUD, traffic everywhere.
function stageCover(game) {
  setMission(game, 1, 0);
  game.wanted = 3;
  game.player.cash = 480;
  // The route runs in the right-hand lanes, not the centreline, so the
  // chase passes oncoming traffic instead of sideswiping it. The whole
  // stretch of both roads is cleared, so no car can wander into the
  // intersection while the chase runs through it.
  clearCorridor(game, 1200, 640, 3180, 760);
  clearCorridor(game, 2480, 300, 2620, 1700);
  giveCar(game, 'sports', 1950, 726, 0, 320);
  givePolice(game, 1760, 726, 0, 380);
  givePolice(game, 1820, 680, 0, 360);
  givePolice(game, 1700, 770, 0, 340);
  nearbyTraffic(game, [
    { type: 'taxi', x: 2400, y: 674, angle: Math.PI, speed: 200 },
    { type: 'sedan', x: 2450, y: 726, angle: 0, speed: 200 },
    { type: 'van', x: 2100, y: 1120, angle: Math.PI / 2, speed: 170 },
    { type: 'truck', x: 2576, y: 1200, angle: -Math.PI / 2, speed: 160 },
  ]);
  game.camera.x = 1950;
  game.camera.y = 726;
  // A straight run east toward the marina: no turn to miss, the frame
  // catches the chase mid-flight with the harbour opening up ahead.
  driveRoute(game, [{ x: 3100, y: 726 }], 1.7);
  game.wanted = 3; // a chase that clipped a pedestrian stays at three stars
}

// Driving downtown with traffic, no heat, a mission to reach.
function stageDrive(game) {
  setMission(game, 0, 1);
  clearCorridor(game, 700, 640, 1700, 760);
  clearCorridor(game, 680, 700, 800, 1600);
  giveCar(game, 'sedan', 1650, 674, Math.PI, 260);
  nearbyTraffic(game, [
    { type: 'taxi', x: 1400, y: 674, angle: Math.PI, speed: 200 },
    { type: 'sports', x: 1200, y: 726, angle: 0, speed: 230 },
    { type: 'van', x: 1200, y: 420, angle: Math.PI / 2, speed: 170 },
    { type: 'sedan', x: 750, y: 1120, angle: -Math.PI / 2, speed: 190 },
  ]);
  game.camera.x = 1650;
  game.camera.y = 674;
  driveRoute(game, [{ x: 750, y: 674 }, { x: 724, y: 1500 }], 3.2);
  clearHeat(game);
}

// On foot in Palm Park: pedestrians strolling, a shot fired, a car to steal.
function stageFoot(game) {
  setMission(game, 0, 0);
  game.player.x = 1425;
  game.player.y = 1300;
  game.player.angle = 0.4;
  game.player.ammo = 40;
  // A crowd in the park for the camera.
  for (let i = 0; i < 9; i += 1) {
    const ped = createPed(game.rng, 1340 + (i % 3) * 90, 1220 + Math.floor(i / 3) * 90);
    ped.tx = ped.x + 120;
    ped.ty = ped.y + 40;
    game.peds.push(ped);
  }
  const parked = createCar(game.rng, 'sports', 1760, 1380, 0, 'parked');
  game.cars.push(parked);
  game.camera.x = 1425;
  game.camera.y = 1300;
  // A short stroll toward the parked sports car, firing once at the very
  // end down the open road so the muzzle flash and tracer are in frame.
  const steps = Math.round(2.0 / STEP);
  for (let i = 0; i < steps; i += 1) {
    const shooting = i === steps - 2;
    stepGame(game, {
      move: { x: 0.8, y: 0.35 },
      run: false,
      aim: { x: game.player.x + 350, y: game.player.y + 140 },
      shooting,
    }, STEP);
  }
  clearHeat(game);
}

// A mission in progress: the bank job, one star, the marker in sight.
function stageMission(game) {
  setMission(game, 3, 0);
  game.wanted = 1;
  game.player.cash = 620;
  // East on 1100th, then north on 2550th: the bank marker sits just west
  // of the last leg, in frame, without the car leaving the roads. The
  // whole of 2550th is cleared, so no car can cross the turn.
  clearCorridor(game, 1600, 1040, 2620, 1160);
  clearCorridor(game, 2480, 0, 2620, 1160);
  giveCar(game, 'sports', 1650, 1126, 0, 300);
  // The patrol car starts on the player's bumper, so it follows the
  // route through the turn instead of cutting the corner over the grass.
  givePolice(game, 1560, 1126, 0, 340);
  nearbyTraffic(game, [
    { type: 'sedan', x: 1900, y: 1126, angle: 0, speed: 190 },
    { type: 'taxi', x: 2300, y: 1074, angle: Math.PI, speed: 200 },
  ]);
  game.camera.x = 1650;
  game.camera.y = 1126;
  // Catch the car just past the turn, closing on the bank, with the
  // patrol car still on its bumper.
  driveRoute(game, [{ x: 2550, y: 1126 }, { x: 2576, y: 880 }], 2.4);
}

/**
 * Build the named scene from a seed and return the game and the screen
 * to draw over it. Any unknown name stages the cover.
 */
export function stageShot(name, seed) {
  const game = createGame(seed);
  if (name === 'drive') stageDrive(game);
  else if (name === 'foot') stageFoot(game);
  else if (name === 'mission') stageMission(game);
  else stageCover(game);
  // Settle the camera on the player before the first paint.
  const focus = game.player.car ?? game.player;
  game.camera.x = focus.x;
  game.camera.y = focus.y;
  game.camera.shake = 0;
  return { game, screen: SCREEN_PLAY };
}

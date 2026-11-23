// The game itself: one state object, one step function. main.js feeds it
// controls from the keyboard and mouse; shots.js feeds it an autopilot;
// both run the same rules, so a screenshot is a real moment of play.

import { CAR, PLAYER, POLICE } from './config.js';
import { createRandom } from './random.js';
import { createCity, collideCircle, isOnRoad } from './world.js';
import { createCar, driveCar, nearestCar, spawnParkedCars, spawnTrafficCars, updateTraffic } from './vehicles.js';
import { spawnPeds, scarePeds, updatePeds } from './pedestrians.js';
import { addWanted, policeCanSee, tryRespray, updatePolice } from './police.js';
import { createMissionState, currentMission, missionTarget, startMission, updateMission } from './missions.js';
import {
  carSmoke, damagePlayer, explodeAt, fireBullet, playerMelee, playerShoot,
  spawnPickups, updateBullets, updateEnemies, updateParticles, updatePickups,
} from './combat.js';

/** A fresh game from a seed: city, cars, people, pickups, mission 1 waiting. */
export function createGame(seed) {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const spawn = city.places.safehouse;
  const game = {
    rng, seed, city,
    time: 0,
    player: {
      x: spawn.x, y: spawn.y, angle: -Math.PI / 2,
      hp: PLAYER.maxHp, cash: PLAYER.startCash, ammo: PLAYER.startAmmo,
      car: null, fireCooldown: 0, meleeCooldown: 0,
    },
    cars: [...spawnParkedCars(city, rng), ...spawnTrafficCars(city, rng)],
    peds: spawnPeds(city, rng),
    cops: [],
    enemies: [],
    bullets: [],
    particles: [],
    pickups: spawnPickups(city, rng),
    wanted: 0,
    hiddenTime: 0,
    reinforceTimer: 0,
    mission: createMissionState(),
    missionTarget: null,
    camera: { x: spawn.x, y: spawn.y, shake: 0 },
    message: '',
    messageTimer: 0,
    briefing: null,
    briefDelay: 1.2,
    events: [],
    scares: [],
    nearCar: null,
    saveTimer: 0,
  };
  // The player's first car waits by the safehouse, keys in the ignition.
  const starter = createCar(rng, 'sedan', spawn.x + 60, spawn.y + 40, 0, 'parked');
  game.cars.push(starter);
  return game;
}

/** Put the player in the driver's seat of `car`. */
function enterCar(game, car) {
  game.player.car = car;
  car.kind = 'player';
  car.target = null;
  if (policeCanSee(game)) addWanted(game, 0.5);
  game.message = car.type === 'police' ? 'You stole a police car!' : `You took the ${car.type}.`;
  game.messageTimer = 2.5;
  game.events.push({ type: 'enterCar', x: car.x, y: car.y });
}

/** Step out of the car, beside the driver's door. */
function exitCar(game) {
  const car = game.player.car;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  const px = car.x + Math.cos(side) * 42;
  const py = car.y + Math.sin(side) * 42;
  const fixed = collideCircle(game.city, px, py, PLAYER.radius);
  game.player.x = fixed.x;
  game.player.y = fixed.y;
  game.player.angle = car.angle;
  game.player.car = null;
  car.kind = 'parked';
  car.speed = 0;
}

/** A car running a pedestrian down: the ped falls, the heat rises. */
function carHitsPeds(game, car) {
  if (Math.abs(car.speed) < 120) return;
  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const ped = game.peds[i];
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy > 30 * 30) continue;
    game.peds.splice(i, 1);
    game.scares.push({ x: ped.x, y: ped.y, r: 400 });
    if (car === game.player.car) addWanted(game, 1);
    game.events.push({ type: 'crash', x: ped.x, y: ped.y, power: 200 });
  }
}

/** Handle the events the step produced that change the world (not the sound). */
function drainWorldEvents(game) {
  const rest = [];
  for (const event of game.events) {
    if (event.type === 'explode') {
      explodeAt(game, event.x, event.y);
      // Remove the wreck; eject the player if it was their car.
      for (let i = game.cars.length - 1; i >= 0; i -= 1) {
        const car = game.cars[i];
        if (car.hp > 0) continue;
        const dx = car.x - event.x;
        const dy = car.y - event.y;
        if (dx * dx + dy * dy > 60 * 60) continue;
        if (car === game.player.car) {
          game.player.x = car.x;
          game.player.y = car.y;
          game.player.car = null;
          damagePlayer(game, 25);
          game.message = 'Your car blew up!';
          game.messageTimer = 3;
        }
        game.cars.splice(i, 1);
      }
    } else if (event.type === 'enemyShot') {
      fireBullet(game, event.x, event.y, event.angle, event.damage, event.from);
      game.events.push({ type: 'gunshot', x: event.x, y: event.y });
    } else {
      rest.push(event);
    }
  }
  // Keep only the events main.js has not heard yet (sound cues).
  game.events.length = 0;
  game.events.push(...rest);
}

/**
 * Advance the game one fixed step. `c` is the controls for this step:
 * { move:{x,y}, run, drive:{throttle,steer}, handbrake, aim:{x,y}|null,
 * shooting, melee, enter } — keys the caller does not set are ignored.
 */
export function stepGame(game, c, dt) {
  game.time += dt;
  if (game.messageTimer > 0) game.messageTimer -= dt;
  if (game.camera.shake > 0) game.camera.shake = Math.max(0, game.camera.shake - dt * 30);
  const player = game.player;
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (player.meleeCooldown > 0) player.meleeCooldown -= dt;

  // The first mission's briefing appears shortly after the game starts.
  if (!game.mission.started && !game.mission.allDone && !game.briefing && game.briefDelay > 0) {
    game.briefDelay -= dt;
    if (game.briefDelay <= 0) startMission(game);
  }

  if (player.hp > 0) {
    if (player.car) {
      const car = player.car;
      const d = c.drive ?? { throttle: 0, steer: 0 };
      driveCar(game, car, d.throttle, d.steer, !!c.handbrake, dt);
      carSmoke(game, car, !!c.handbrake, dt);
      carHitsPeds(game, car);
      if (c.aim) player.angle = Math.atan2(c.aim.y - car.y, c.aim.x - car.x);
      if (c.shooting) playerShoot(game, player.angle);
      if (c.enter) exitCar(game);
      // A wrecked car under the player blows up.
      if (player.car && player.car.hp <= 0) {
        game.events.push({ type: 'explode', x: player.car.x, y: player.car.y });
      }
    } else {
      const move = c.move ?? { x: 0, y: 0 };
      const speed = c.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = player.x + move.x * speed * dt;
      const ny = player.y + move.y * speed * dt;
      const fixed = collideCircle(game.city, nx, ny, PLAYER.radius);
      player.x = fixed.x;
      player.y = fixed.y;
      if (c.aim) player.angle = Math.atan2(c.aim.y - player.y, c.aim.x - player.x);
      else if (move.x !== 0 || move.y !== 0) player.angle = Math.atan2(move.y, move.x);
      if (c.shooting) playerShoot(game, player.angle);
      if (c.melee) playerMelee(game);
      game.nearCar = nearestCar(game, player.x, player.y, 80);
      if (c.enter && game.nearCar) enterCar(game, game.nearCar);
    }
  }

  updateTraffic(game, dt);
  updatePeds(game, dt);
  updatePolice(game, dt);
  updateMission(game, dt);
  updateBullets(game, dt);
  updateEnemies(game, dt);
  updatePickups(game, dt);
  updateParticles(game, dt);
  tryRespray(game);

  // Scares run the pedestrians; world events change the world.
  for (const scare of game.scares) scarePeds(game, scare.x, scare.y, scare.r);
  game.scares.length = 0;
  drainWorldEvents(game);

  // The camera chases the player, never leaving the city behind.
  const focus = player.car ?? player;
  const k = 1 - Math.exp(-5 * dt);
  game.camera.x += (focus.x - game.camera.x) * k;
  game.camera.y += (focus.y - game.camera.y) * k;

  game.missionTarget = missionTarget(game);
  game.saveTimer += dt;
}

/** True when the player is dead and the game is over. */
export function isGameOver(game) {
  return game.player.hp <= 0;
}

/** Respawn after game over: same story, same cash, a fresh body. */
export function respawn(game) {
  const spawn = game.city.places.safehouse;
  game.player.x = spawn.x;
  game.player.y = spawn.y;
  game.player.hp = PLAYER.maxHp;
  game.player.ammo = Math.max(game.player.ammo, PLAYER.startAmmo);
  game.player.car = null;
  game.player.fireCooldown = 0;
  game.player.meleeCooldown = 0;
  game.wanted = 0;
  game.cops.length = 0;
  game.enemies.length = 0;
  game.bullets.length = 0;
  for (const car of game.cars) if (car.kind === 'police') car.kind = 'traffic';
  game.camera.x = spawn.x;
  game.camera.y = spawn.y;
  game.camera.shake = 0;
  game.briefDelay = 0.5;
  game.message = 'Back on the street. Stay sharp.';
  game.messageTimer = 3;
}

export { currentMission, isOnRoad, POLICE, CAR };

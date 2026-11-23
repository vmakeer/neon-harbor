// Boot and the one loop: input is read every frame, the game advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between four screens — title, play, paused and game over — with a
// mission briefing overlay that pauses the action until it is dismissed.
//
// ?seed=N fixes the city. ?shot=cover|drive|foot|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP, WORLD } from './config.js';
import { createGame, isGameOver, respawn, stepGame } from './game.js';
import { updatePeds } from './pedestrians.js';
import { updateTraffic } from './vehicles.js';
import { updateParticles } from './combat.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MELEE, ACTION_MUTE, ACTION_PAUSE,
  createInput,
} from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
} from './render.js';
import { createHud } from './hud.js';
import { clearSave, readSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Autosave every 20 seconds of play. */
const SAVE_EVERY = 20;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud();
const audio = createAudio();

/** The camera centre the renderer actually uses (clamped to the city). */
function viewCenter(game) {
  const size = renderer.size();
  const cam = game.camera;
  return {
    x: Math.max(size.w / 2 - 200, Math.min(WORLD.width - size.w / 2 + 200, cam.x)),
    y: Math.max(size.h / 2 - 200, Math.min(WORLD.height - size.h / 2 + 200, cam.y)),
  };
}

/** The mouse position in world coordinates, for aiming. */
function mouseWorld(game, input) {
  const size = renderer.size();
  const centre = viewCenter(game);
  const mouse = input.mouse();
  return { x: mouse.x + centre.x - size.w / 2, y: mouse.y + centre.y - size.h / 2 };
}

/** Play the sound cues the last steps queued, then clear them. */
function drainSounds(game) {
  for (const event of game.events) {
    if (event.type === 'gunshot') audio.gunshot();
    else if (event.type === 'crash') audio.crash(event.power || 100);
    else if (event.type === 'explosion') audio.explosion();
    else if (event.type === 'pickup') audio.pickup();
    else if (event.type === 'melee') audio.melee();
    else if (event.type === 'hurt') audio.hurt();
    else if (event.type === 'missionStart') audio.missionStart();
    else if (event.type === 'missionDone') {
      audio.missionDone();
      writeSave(game);
    } else if (event.type === 'objective') audio.objective();
    else if (event.type === 'respray') audio.respray();
    else if (event.type === 'enterCar') audio.click();
  }
  game.events.length = 0;
}

function runShot(name) {
  const scene = stageShot(name, seed);
  const game = scene.game;
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, { hasSave: false, mouse: { x: 0, y: 0 } });
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.draw(ctx, game, renderer.size());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let game = createGame(seed);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let pendingEnter = false;
  let pendingMelee = false;
  let titleTime = 0;

  function announce(message) {
    status.textContent = message;
  }

  function applySave(target, saved) {
    target.player.cash = saved.cash;
    target.player.hp = saved.hp;
    target.player.ammo = saved.ammo;
    target.mission.index = Math.min(saved.missionIndex, 3);
    target.player.x = saved.x;
    target.player.y = saved.y;
    target.camera.x = saved.x;
    target.camera.y = saved.y;
    target.briefDelay = 0.8;
  }

  function startGame(fresh) {
    if (fresh) {
      clearSave();
      game = createGame(seed);
    } else if (save) {
      game = createGame(seed);
      applySave(game, save);
    } else {
      game = createGame(seed);
    }
    save = readSave();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    announce('Playing. Steal a car and follow the objective.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    writeSave(game);
    announce('Game over. Your progress is saved.');
  }

  function dismissBriefing() {
    if (!game.briefing) return;
    game.briefing = null;
    audio.click();
  }

  /** One simulation step with the live controls. */
  function step() {
    const controls = {
      move: input.move(),
      run: input.running(),
      drive: input.drive(),
      handbrake: input.handbrake(),
      aim: mouseWorld(game, input),
      shooting: input.mouse().down,
      melee: pendingMelee,
      enter: pendingEnter,
    };
    pendingMelee = false;
    pendingEnter = false;
    stepGame(game, controls, STEP);
    if (game.saveTimer >= SAVE_EVERY) {
      game.saveTimer = 0;
      writeSave(game);
    }
    if (isGameOver(game)) endGame();
  }

  function buttonAt(buttons, x, y) {
    for (const b of buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.action;
    }
    return null;
  }

  function handleClick() {
    if (!input.takeClick()) return;
    audio.ensure();
    const mouse = input.mouse();
    if (screen === SCREEN_TITLE) {
      const action = buttonAt(renderer.titleButtons(!!save), mouse.x, mouse.y);
      if (action === 'start') startGame(false);
      else if (action === 'new') startGame(true);
    } else if (screen === SCREEN_PAUSED) {
      const action = buttonAt(renderer.pauseButtons(), mouse.x, mouse.y);
      if (action === 'resume') {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (action === 'quit') {
        writeSave(game);
        save = readSave();
        screen = SCREEN_TITLE;
        announce('Title screen.');
      }
    } else if (screen === SCREEN_OVER) {
      const action = buttonAt(renderer.overButtons(), mouse.x, mouse.y);
      if (action === 'retry') {
        respawn(game);
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (action === 'title') {
        save = readSave();
        screen = SCREEN_TITLE;
      }
    } else if (screen === SCREEN_PLAY && game.briefing) {
      const action = buttonAt([renderer.briefingButton()], mouse.x, mouse.y);
      if (action === 'go') dismissBriefing();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      game.message = audio.isMuted() ? 'Muted' : 'Sound on';
      game.messageTimer = 1.5;
    }
    if (actions & ACTION_ENTER) pendingEnter = true;
    if (actions & ACTION_MELEE) pendingMelee = true;
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame(false);
      else if (screen === SCREEN_OVER) {
        respawn(game);
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (game.briefing) dismissBriefing();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY && !game.briefing) {
        screen = SCREEN_PAUSED;
        writeSave(game);
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleClick();
    handleActions();

    if (screen === SCREEN_TITLE) {
      // A living backdrop: traffic and pedestrians move, the camera drifts.
      titleTime += dt;
      game.time += dt;
      updateTraffic(game, dt);
      updatePeds(game, dt);
      updateParticles(game, dt);
      game.camera.x = 2100 + Math.cos(titleTime * 0.07) * 420;
      game.camera.y = 700 + Math.sin(titleTime * 0.05) * 260;
    } else if (screen === SCREEN_PLAY && !game.briefing) {
      accumulator += dt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
      drainSounds(game);
      // Continuous audio follows the car and the nearest siren.
      const car = game.player.car;
      let sirenNear = false;
      for (const other of game.cars) {
        if (other.kind !== 'police') continue;
        const dx = other.x - game.player.x;
        const dy = other.y - game.player.y;
        if (dx * dx + dy * dy < 700 * 700) { sirenNear = true; break; }
      }
      audio.update({ driving: !!car, speed: car ? car.speed : 0, sirenNear });
    } else {
      accumulator = 0;
    }

    renderer.draw(game, screen, { hasSave: !!save, mouse: input.mouse() });
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hud.draw(ctx, game, renderer.size());
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave(game);
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

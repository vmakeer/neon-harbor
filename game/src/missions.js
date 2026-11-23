// The story: four missions for Rosa and Marco, the two fixers who run
// Solmar Bay's harbour jobs. Each mission is a list of stages — drive
// somewhere, pick something up, lose the cops — with a briefing, a map
// marker and a cash reward. Finishing one unlocks the next.

import { MISSION_REWARDS } from './config.js';
import { addWanted } from './police.js';

export const MISSIONS = [
  {
    title: 'First Wheels',
    giver: 'Rosa',
    brief: [
      'Rosa: "New in town? You need wheels before anything else.',
      'Borrow a car — any car — and bring it to Palm Park.',
      'Then swing by the warehouse. No cops, no fuss."',
    ],
    reward: MISSION_REWARDS[0],
    stages: [
      { text: 'Steal a car (walk up to one and press E)', type: 'getCar' },
      { text: 'Drive to Palm Park', type: 'goto', place: 'park', radius: 110 },
      { text: 'Drive to the warehouse', type: 'goto', place: 'warehouse', radius: 110 },
    ],
  },
  {
    title: 'Harbor Pickup',
    giver: 'Marco',
    brief: [
      'Marco: "A crate came in on the night ferry. It\'s sitting',
      'on the Marina Pier with my name on it. Go get it — and',
      'if the dock crew gives you trouble, give it back."',
    ],
    reward: MISSION_REWARDS[1],
    stages: [
      { text: 'Drive to the Marina Pier', type: 'goto', place: 'pier', radius: 130 },
      { text: 'Grab the crate (walk to the marker)', type: 'pickup', place: 'pier', radius: 60 },
      { text: 'Deliver the crate to the Hideout', type: 'goto', place: 'hideout', radius: 110 },
    ],
  },
  {
    title: 'Heat on the Pier',
    giver: 'Rosa',
    brief: [
      'Rosa: "The bank job went loud. The whole bay is looking',
      'for a car like yours. Shake them — hide, or get a respray —',
      'then get back to the Safehouse in one piece."',
    ],
    reward: MISSION_REWARDS[2],
    stages: [
      { text: 'Reach Downtown — the alarm is already ringing', type: 'goto', place: 'downtown', radius: 130, heat: 2 },
      { text: 'Lose the cops (hide, or visit the Respray)', type: 'loseWanted' },
      { text: 'Get back to the Safehouse', type: 'goto', place: 'safehouse', radius: 110 },
    ],
  },
  {
    title: 'The Big Score',
    giver: 'Marco',
    brief: [
      'Marco: "Solmar Bank keeps the harbour payroll in a back',
      'room. Grab it, and the bay is yours. The guards won\'t',
      'hand it over — and the cops will be right behind you."',
    ],
    reward: MISSION_REWARDS[3],
    stages: [
      { text: 'Drive to Solmar Bank', type: 'goto', place: 'bank', radius: 120 },
      { text: 'Grab the payroll — hold the bank (stay close)', type: 'hold', place: 'bank', radius: 90, holdTime: 4, heat: 3 },
      { text: 'Escape to the Hideout', type: 'goto', place: 'hideout', radius: 110 },
    ],
  },
];

/** A fresh mission tracker: mission 0, stage 0, waiting to be briefed. */
export function createMissionState() {
  return { index: 0, stage: 0, started: false, briefed: false, stageTimer: 0, complete: false, allDone: false };
}

/** The mission currently in progress, or null when the story is done. */
export function currentMission(game) {
  if (game.mission.index >= MISSIONS.length) return null;
  return MISSIONS[game.mission.index];
}

/** The stage the player is on right now. */
export function currentStage(game) {
  const mission = currentMission(game);
  if (!mission) return null;
  return mission.stages[game.mission.stage];
}

/** The map marker for the current stage, or null when it has none. */
export function missionTarget(game) {
  const stage = currentStage(game);
  if (!stage || !stage.place) return null;
  const place = game.city.places[stage.place];
  return { x: place.x, y: place.y, label: place.label };
}

/** The objective line the HUD shows. */
export function objectiveText(game) {
  const mission = currentMission(game);
  if (!mission) return 'Story complete — Solmar Bay is yours. Free roam!';
  const stage = mission.stages[game.mission.stage];
  return `${mission.title}: ${stage.text}`;
}

/** Begin the next mission: show its briefing. */
export function startMission(game) {
  const mission = currentMission(game);
  if (!mission) return;
  game.mission.started = true;
  game.mission.briefed = true;
  game.mission.stage = 0;
  game.mission.stageTimer = 0;
  game.briefing = mission;
  game.message = `${mission.giver}: ${mission.title}`;
  game.messageTimer = 4;
  game.events.push({ type: 'missionStart' });
}

/** Move to the next stage, or finish the mission and pay out. */
function advance(game) {
  const mission = currentMission(game);
  game.mission.stage += 1;
  game.mission.stageTimer = 0;
  if (game.mission.stage < mission.stages.length) {
    const stage = mission.stages[game.mission.stage];
    if (stage.heat) addWanted(game, stage.heat);
    game.events.push({ type: 'objective' });
    return;
  }
  // Mission complete: pay, then offer the next one.
  game.player.cash += mission.reward;
  game.message = `Mission complete! +$${mission.reward} — ${mission.title}`;
  game.messageTimer = 5;
  game.events.push({ type: 'missionDone' });
  game.mission.index += 1;
  game.mission.stage = 0;
  game.mission.started = false;
  game.mission.briefed = false;
  if (game.mission.index >= MISSIONS.length) {
    game.mission.allDone = true;
    game.message = 'Story complete! You own Solmar Bay. +$1000 bonus';
    game.player.cash += 1000;
    game.messageTimer = 6;
  }
}

/** Where the player is, on foot or in a car. */
function playerPos(game) {
  if (game.player.car) return { x: game.player.car.x, y: game.player.car.y };
  return { x: game.player.x, y: game.player.y };
}

/** Spawn rival gang members around a place, for the hotter missions. */
function spawnGang(game, place, count) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    game.enemies.push({
      x: place.x + Math.cos(a) * 130,
      y: place.y + Math.sin(a) * 130,
      angle: 0,
      hp: 60,
      fireCooldown: 1 + i * 0.4,
      speed: 150,
    });
  }
}

/** Check the current stage each step and advance it when done. */
export function updateMission(game, dt) {
  const mission = currentMission(game);
  if (!mission || !game.mission.started) return;
  const stage = mission.stages[game.mission.stage];
  const p = playerPos(game);
  const place = stage.place ? game.city.places[stage.place] : null;

  if (stage.type === 'getCar') {
    if (game.player.car) advance(game);
    return;
  }
  if (stage.type === 'goto' || stage.type === 'pickup') {
    const dx = p.x - place.x;
    const dy = p.y - place.y;
    if (dx * dx + dy * dy < stage.radius * stage.radius) {
      // The pickup at the pier is guarded: the dock crew shows up.
      if (mission.title === 'Harbor Pickup' && stage.type === 'pickup') {
        spawnGang(game, place, 2);
        game.message = 'The dock crew is here — watch out!';
        game.messageTimer = 3;
      }
      advance(game);
    }
    return;
  }
  if (stage.type === 'hold') {
    const dx = p.x - place.x;
    const dy = p.y - place.y;
    if (dx * dx + dy * dy < stage.radius * stage.radius) {
      game.mission.stageTimer += dt;
      if (game.mission.stageTimer === dt || Math.floor(game.mission.stageTimer) !== Math.floor(game.mission.stageTimer - dt)) {
        game.message = `Grabbing the payroll… ${Math.ceil(stage.holdTime - game.mission.stageTimer)}`;
        game.messageTimer = 1.2;
      }
      // Bank guards arrive halfway through the grab.
      if (game.mission.stageTimer > stage.holdTime / 2 && game.enemies.length === 0) {
        spawnGang(game, place, 3);
      }
      if (game.mission.stageTimer >= stage.holdTime) advance(game);
    } else {
      game.mission.stageTimer = Math.max(0, game.mission.stageTimer - dt * 2);
    }
    return;
  }
  if (stage.type === 'loseWanted') {
    if (game.wanted < 1) advance(game);
    return;
  }
}

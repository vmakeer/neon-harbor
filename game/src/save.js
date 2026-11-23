// Saving: progress, cash, the mission reached and where the player stood,
// kept in localStorage between visits. A save is only a few numbers, and
// a missing or broken one simply means a fresh game.

import { SAVE_KEY } from './config.js';

/** The save payload: everything needed to pick the game back up. */
export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    if (!Number.isFinite(save.cash) || !Number.isFinite(save.missionIndex)) return null;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  try {
    const p = game.player.car ?? game.player;
    const save = {
      cash: Math.round(game.player.cash),
      hp: Math.round(game.player.hp),
      ammo: Math.round(game.player.ammo),
      missionIndex: game.mission.index,
      wanted: 0, // a fresh visit starts clean
      x: Math.round(p.x),
      y: Math.round(p.y),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    // Storage can be off (private windows): the game still plays.
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: there was no save to clear.
  }
}

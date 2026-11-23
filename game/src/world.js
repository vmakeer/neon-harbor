// The city of Solmar Bay: a seeded grid of roads, blocks of buildings, a
// beach and sea to the south, a marina on the east edge, a park and a
// plaza, and the named places missions use. Everything here is pure data
// plus the collision and road queries the rest of the game asks of it.

import {
  BEACH_TOP, MARINA, PALETTE, ROADS_H, ROADS_V, ROAD_WIDTH,
  SEA_TOP, SIDEWALK, WORLD,
} from './config.js';
import { chance, pick, range, rangeInt } from './random.js';

// The park block and the plaza block hold trees instead of buildings.
const PARK_BLOCK = { x0: 1200, y0: 1100, x1: 1650, y1: 1500 };
const PLAZA_BLOCK = { x0: 2100, y0: 300, x1: 2550, y1: 700 };

function isParkBlock(x0, y0, x1, y1) {
  return (x0 === PARK_BLOCK.x0 && y0 === PARK_BLOCK.y0) || (x0 === PLAZA_BLOCK.x0 && y0 === PLAZA_BLOCK.y0);
}

/** The blocks between the roads: each is [x0, y0, x1, y1] in road-centreline terms. */
function blockBounds() {
  const xs = [0, ...ROADS_V, WORLD.width];
  const ys = [0, ...ROADS_H, BEACH_TOP];
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      blocks.push({ x0: xs[i], y0: ys[j], x1: xs[i + 1], y1: ys[j + 1] });
    }
  }
  return blocks;
}

/** Fill one block with buildings (or trees for the park and plaza). */
function buildBlock(random, block, buildings, trees) {
  const margin = ROAD_WIDTH / 2 + SIDEWALK + 6;
  const x0 = block.x0 === 0 ? 24 : block.x0 + margin;
  const y0 = block.y0 === 0 ? 24 : block.y0 + margin;
  const x1 = block.x1 >= WORLD.width ? WORLD.width - 24 : block.x1 - margin;
  const y1 = block.y1 >= BEACH_TOP ? BEACH_TOP - 24 : block.y1 - margin;
  // The marina swallows the east edge; nothing is built in the water.
  const east = Math.min(x1, MARINA.x - 20);
  if (east - x0 < 90 || y1 - y0 < 90) return;
  if (isParkBlock(block.x0, block.y0, block.x1, block.y1)) {
    const count = rangeInt(random, 14, 22);
    for (let i = 0; i < count; i += 1) {
      trees.push({ x: range(random, x0 + 20, east - 20), y: range(random, y0 + 20, y1 - 20), r: range(random, 14, 22) });
    }
    return;
  }
  // Split the block into lots along its long side and put a building on most.
  const wide = east - x0 > y1 - y0;
  const lots = wide ? rangeInt(random, 2, 3) : rangeInt(random, 1, 2);
  const rows = wide ? rangeInt(random, 1, 2) : rangeInt(random, 2, 3);
  const lotW = (east - x0) / lots;
  const lotH = (y1 - y0) / rows;
  for (let lx = 0; lx < lots; lx += 1) {
    for (let ly = 0; ly < rows; ly += 1) {
      if (chance(random, 0.18)) continue; // an empty lot, a car park, a yard
      const w = range(random, lotW * 0.55, lotW * 0.86);
      const h = range(random, lotH * 0.55, lotH * 0.86);
      const x = x0 + lx * lotW + (lotW - w) / 2;
      const y = y0 + ly * lotH + (lotH - h) / 2;
      buildings.push({
        x, y, w, h,
        color: pick(random, PALETTE.building),
        roof: pick(random, PALETTE.roof),
        // Taller buildings cast a longer shadow and get a rooftop box.
        tall: chance(random, 0.35),
        seed: random(),
      });
    }
  }
}

/** Build the whole city from the seeded random stream. */
export function createCity(random) {
  const buildings = [];
  const trees = [];
  for (const block of blockBounds()) buildBlock(random, block, buildings, trees);

  // Palms along the beach promenade.
  for (let x = 90; x < WORLD.width - 120; x += rangeInt(random, 70, 130)) {
    trees.push({ x, y: BEACH_TOP - 26 + range(random, -8, 8), r: range(random, 13, 18), palm: true });
  }
  // A few palms around the marina.
  for (let y = 360; y < 1700; y += rangeInt(random, 90, 160)) {
    trees.push({ x: MARINA.x - 30, y, r: range(random, 13, 18), palm: true });
  }

  // Named places the missions and the respray shop use.
  const places = {
    safehouse: { x: 700, y: 636, label: 'Safehouse' },
    respray: { x: 880, y: 1600, w: 150, h: 110, label: 'Respray' },
    bank: { x: 2320, y: 880, label: 'Solmar Bank' },
    pier: { x: 3260, y: 1080, label: 'Marina Pier' },
    warehouse: { x: 1860, y: 1680, label: 'Warehouse' },
    hideout: { x: 170, y: 1640, label: 'Hideout' },
    downtown: { x: 2100, y: 700, label: 'Downtown' },
    park: { x: 1425, y: 1300, label: 'Palm Park' },
  };

  return { buildings, trees, places, width: WORLD.width, height: WORLD.height };
}

/** True when the point is on a road (within the asphalt). */
export function isOnRoad(x, y) {
  if (y >= BEACH_TOP || x >= MARINA.x) return false;
  const half = ROAD_WIDTH / 2;
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= half && y < BEACH_TOP) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= half && x < MARINA.x) return true;
  return false;
}

/** True when the point is in the sea or the marina water. */
export function isWater(x, y) {
  if (y >= SEA_TOP) return true;
  return x >= MARINA.x && y >= MARINA.y && y <= MARINA.y + MARINA.height;
}

/** True when the point is inside any building. */
export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/**
 * Push a circle out of buildings, water and the world edge. Returns the
 * corrected position; the caller keeps its own velocity.
 */
export function collideCircle(city, x, y, r) {
  let cx = Math.max(r, Math.min(city.width - r, x));
  let cy = Math.max(r, Math.min(city.height - r, y));
  // Water is impassable: the sea and the marina push back.
  if (cy + r > SEA_TOP) cy = SEA_TOP - r;
  if (cx + r > MARINA.x && cy > MARINA.y - r && cy < MARINA.y + MARINA.height + r) cx = MARINA.x - r;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
    const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    const dx = cx - nx;
    const dy = cy - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      cx = nx + (dx / d) * r;
      cy = ny + (dy / d) * r;
    } else {
      // Centre inside the building: push out along the smallest overlap.
      const left = cx - b.x + r;
      const right = b.x + b.w - cx + r;
      const top = cy - b.y + r;
      const bottom = b.y + b.h - cy + r;
      const m = Math.min(left, right, top, bottom);
      if (m === left) cx = b.x - r;
      else if (m === right) cx = b.x + b.w + r;
      else if (m === top) cy = b.y - r;
      else cy = b.y + b.h + r;
    }
  }
  return { x: cx, y: cy };
}

/** A random point on a road centreline, for spawning traffic. */
export function randomRoadPoint(random) {
  if (chance(random, 0.5)) {
    return { x: pick(random, ROADS_V), y: range(random, 120, BEACH_TOP - 120) };
  }
  return { x: range(random, 120, MARINA.x - 120), y: pick(random, ROADS_H) };
}

/** A random point on a sidewalk, for spawning pedestrians. */
export function randomSidewalkPoint(random) {
  const p = randomRoadPoint(random);
  const off = ROAD_WIDTH / 2 + SIDEWALK / 2;
  if (chance(random, 0.5)) p.x += chance(random, 0.5) ? off : -off;
  else p.y += chance(random, 0.5) ? off : -off;
  return { x: Math.max(30, Math.min(WORLD.width - 30, p.x)), y: Math.max(30, Math.min(BEACH_TOP - 30, p.y)) };
}

/** The nearest point on a road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y }; }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry }; }
  }
  return best;
}

/** Distance from (x, y) to the nearest road centreline. */
export function distanceToRoad(x, y) {
  let best = Infinity;
  for (const rx of ROADS_V) best = Math.min(best, Math.abs(x - rx));
  for (const ry of ROADS_H) best = Math.min(best, Math.abs(y - ry));
  return best;
}

// Neon Harbor — every tuning number, colour and key in one place.
// The world is a fixed 3600 x 2600 pixel city; the renderer follows the
// player with a camera, so no rule below depends on the screen size.

export const STEP = 1 / 60; // fixed simulation step, 60 updates a second

export const WORLD = { width: 3600, height: 2600 };

// Road centrelines. Vertical roads run the full height of the city,
// horizontal roads the full width; blocks of buildings sit between them.
export const ROADS_V = [300, 750, 1200, 1650, 2100, 2550, 3000];
export const ROADS_H = [300, 700, 1100, 1500, 1900];
export const ROAD_WIDTH = 116;
export const SIDEWALK = 26; // pavement strip each side of the road

// The beach runs along the south edge; the sea starts below it.
export const BEACH_TOP = 2210;
export const SEA_TOP = 2420;
// The marina is a water inlet on the east edge.
export const MARINA = { x: 3180, y: 300, width: 420, height: 1500 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  maxHp: 100,
  startCash: 120,
  startAmmo: 24,
  maxAmmo: 120,
  // Pistol: shots per second, bullet speed, damage, range in pixels.
  fireRate: 4.5,
  bulletSpeed: 900,
  bulletDamage: 34,
  bulletRange: 620,
  meleeDamage: 20,
  meleeRange: 34,
  meleeRate: 2.2,
};

export const CAR = {
  // Arcade driving: acceleration, top speed (px/s), grip and turn rate.
  accel: 420,
  brake: 700,
  maxSpeed: 560,
  reverseMax: 180,
  turnRate: 2.9,
  drag: 0.55,
  offRoadDrag: 1.6,
  handbrakeDrag: 2.4,
  radius: 26, // collision circle, roughly half the car length
};

// Car bodies: length, width, top speed multiplier, acceleration multiplier,
// colour palette and how common each is among parked and traffic cars.
export const CAR_TYPES = {
  sedan:   { length: 64, width: 32, speed: 1.0, accel: 1.0, weight: 30, colors: ['#c94f4f', '#4f7ec9', '#d8d8d8', '#3a3f4a', '#7a9a5a'] },
  taxi:    { length: 64, width: 32, speed: 1.0, accel: 1.0, weight: 12, colors: ['#f2c94c'] },
  truck:   { length: 84, width: 36, speed: 0.78, accel: 0.8, weight: 10, colors: ['#e8e8e8', '#b0623a', '#5a7a8a'] },
  sports:  { length: 66, width: 32, speed: 1.28, accel: 1.35, weight: 10, colors: ['#e53b3b', '#2b6fe3', '#f2f2f2', '#1fbf8f'] },
  police:  { length: 66, width: 32, speed: 1.18, accel: 1.25, weight: 0, colors: ['#f5f5f5'] },
  van:     { length: 74, width: 34, speed: 0.88, accel: 0.9, weight: 8, colors: ['#8a8f98', '#c9c9c9', '#4a6b8a'] },
};

export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 26;
export const PED_COUNT = 42;

export const PED = {
  radius: 11,
  walkSpeed: 62,
  fleeSpeed: 190,
  // How far a gunshot or crash scares a pedestrian, in pixels.
  scareRadius: 420,
};

export const POLICE = {
  maxStars: 5,
  // Wanted decays after this long with no cop able to see the player.
  hideTime: 6,
  decayPerSecond: 0.5,
  // Cars and foot cops the heat calls in at each star level (index = stars).
  carsPerStar: [0, 0, 2, 3, 4, 5],
  copsPerStar: [0, 1, 2, 3, 4, 5],
  chaseSpeed: 1.12, // multiplier on the police car's top speed while chasing
  ramDamage: 12,
  copShootRange: 340,
  copFireRate: 0.9,
  copDamage: 8,
  // Cash the respray shop charges to clear the wanted level.
  resprayCost: 150,
};

export const PICKUPS = {
  health: { heal: 40, count: 6 },
  ammo: { rounds: 24, count: 6 },
  cash: { amount: 60, count: 8 },
};

export const MISSION_REWARDS = [150, 300, 450, 800];

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a158',
  sidewalk: '#c9c2b4',
  road: '#3d4148',
  roadEdge: '#33373e',
  lane: '#e8d44d',
  sand: '#ecd9a0',
  sea: '#2f7fb8',
  seaDeep: '#256b9e',
  building: ['#e8dcc8', '#d8c8b0', '#c8d4dc', '#e0b8a0', '#b8c8b0', '#d8b8c8', '#c0c0d0'],
  roof: ['#a8543c', '#7a6a58', '#5a7a8a', '#8a8a7a', '#6a5a7a'],
  park: '#5d9a4a',
  tree: '#3f7a34',
  treeDark: '#356b2c',
  player: '#ff5a3c',
  playerDark: '#c93a24',
  ped: ['#e8b06a', '#6ab0e8', '#b06ae8', '#6ae8a0', '#e86a8a', '#a0a0a0'],
  hudBg: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f5f2ea',
  hudMuted: '#b8b4a8',
  star: '#ffd94d',
  health: '#58d654',
  healthLow: '#e53b3b',
  marker: '#ff5a3c',
  missionMarker: '#ffd94d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Where the save lives between visits (this browser only).
export const SAVE_KEY = 'neon-harbor.save.v1';

export const GAME_TITLE = 'Neon Harbor';
export const CITY_NAME = 'Solmar Bay';

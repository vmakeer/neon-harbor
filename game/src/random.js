// A small seeded random number generator: the same seed always gives the
// same stream of numbers, so the city, the traffic and the screenshot
// scenes are identical every time they are built from one seed.

export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] inclusive. */
export function rangeInt(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}

/** One element of `items`, uniformly. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** True with probability `p`. */
export function chance(random, p) {
  return random() < p;
}

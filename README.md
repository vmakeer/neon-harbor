[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/vmakeer/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/vmakeer/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Harbor

An original open-world crime game set in Solmar Bay, a sun-soaked coastal
city. Steal cars, outrun the police, and run four story missions for Rosa
and Marco — from your first stolen sedan to the Solmar Bank payroll job.

Built for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).
Plain canvas JavaScript with zero libraries: the city, cars, people,
sound and music are all generated in code, and the game runs fully
offline in a desktop browser.

## What's in the city

- A 3600 × 2600 open world: grid streets, downtown towers, Palm Park, a
  beach promenade and a marina — explored on foot and by car, with a
  camera that follows you.
- Cars to steal and drive (sedan, taxi, truck, van, sports, police),
  arcade driving physics, handbrake drifts, traffic that follows the
  lanes, and pedestrians who flee from gunfire and crashes.
- A 0–5 star wanted level: foot cops and patrol cars chase and escalate,
  heat fades when you stay hidden, and the Respray shop clears it for cash.
- Four story missions with briefings, objectives, map markers and cash
  rewards, plus free roam once the story is done.
- Combat on foot and from the car: pistol with ammo pickups, melee,
  rival gang members, health pickups, game over and respawn.
- A HUD with a live minimap (roads, player, police, mission marker),
  wanted stars, health, cash, speed and the current objective.
- Title screen, pause menu, mission briefings, and saves to localStorage
  (cash, mission, position) with Continue.
- Synthesized WebAudio sound: engine hum, two-tone sirens, gunshots,
  pickups and a bass-line music loop. No audio files. M mutes.
- Particles (tire smoke, muzzle flash, explosions), screen shake, damage
  smoke, shadows and a bright day palette.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move on foot, drive |
| Mouse | Aim |
| Click | Shoot |
| F | Punch |
| E | Steal / leave car |
| Shift | Run |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no
network: `game/` is plain static files.

## Layout

```
game/
  index.html        the page: one canvas, one module script
  src/
    main.js         boot, the loop, screens, saving
    game.js         the game state and one shared step function
    config.js       tuning numbers, palette, car types
    random.js       seeded RNG (the city is deterministic)
    world.js        city generation, roads, collision
    vehicles.js     cars, driving physics, traffic AI
    pedestrians.js  sidewalk crowds that flee trouble
    police.js       wanted level, chases, respray
    missions.js     the four story missions
    combat.js       pistol, melee, bullets, pickups, particles
    audio.js        synthesized WebAudio sound and music
    input.js        keyboard and mouse
    render.js       canvas drawing: city, cars, people, menus
    hud.js          HUD and the live minimap
    save.js         localStorage saves
    shots.js        deterministic screenshot scenes (?shot=…)
```

Screenshot scenes: `?shot=cover|drive|foot|mission&seed=1`.

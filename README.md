# Zombie Clash

This proof of concept tests **GPT-6 Astra's ability to design and implement a complete 3D experience**: an autonomous browser simulation with a procedural town, animated characters, navigation, perception, tactical behavior, combat, UI, original music, tests, and performance validation. GPT-6 Astra created the application; the finished simulation runs entirely as local game code and makes no runtime AI or API calls.

An autonomous 3D survival simulation in a ruined, miniature town. Fifty humans with machetes face fifty zombies. You observe; you cannot command either side.

## Run locally

Requires Node.js 22.12+ (tested with Node.js 24) and a desktop browser with WebGL 2/hardware acceleration.

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite, normally http://127.0.0.1:5173. The simulation starts immediately. All geometry, animations, fonts, and music are local; there are no runtime API calls, accounts, external asset downloads, or paid dependencies.

```powershell
npm test
npm run audit:simulation
npm run build
npm run preview
```

`build` writes the production site to `dist/`. Serve it over HTTP using `preview`; do not open `index.html` through a file URL.

## Observe

- Left-drag to orbit; right-drag to pan; scroll or use +/− to zoom.
- Click a character to inspect its faction, health, behavior, and target. **Locate in district** centers and zooms the camera on it.
- **Pause simulation** or Space freezes simulation time and animations. The camera remains usable.
- **Restart** restores the same seed and population, clears selection/events/blood, and resumes. **Reset camera** restores the original overview separately.
- Escape or the inspector's close button clears selection.
- **Music off / on** enables the original 64-second ambient score, **Ashfield After Dark**. Use the adjacent slider for volume. Music starts only after your click, loops seamlessly through Web Audio, and fades/suspends with pause, completion, or a hidden tab. Restart retains your music preference and playback position; reloading defaults to music off.

Human markers are ochre; infected markers are rust. The infected total includes humans currently transforming. The map is fully visible to the observer; characters have limited perception.

## Rules

Humans see up to 29 meters through a forward 140-degree cone, with close-contact awareness in any direction. Buildings, wrecks, dumpsters, and the fountain block vision. Zombies smell living humans within 70 meters, including through buildings, but still need a route around obstacles. Neither faction has global knowledge of opponents.

Humans explore and regroup with visible allies. Regroup-capable humans remain near an ally while no threat is visible. They scan while waiting, keeping their normal sight cone and obstacle occlusion, and follow moving allies at a closer distance so they can join a pursuit. In combat, lone humans retreat from any detected zombie, pairs attack one or two zombies but retreat from three or more, groups of three retreat only from a larger force, and groups of four or more pursue aggressively regardless of the nearby swarm size. Turning away or losing sight does not cancel a retreat: they continue to the escape destination, up to seven seconds, unless cornered. Every retreat exit starts a 22-second reassessment window before another retreat is allowed. Cornered humans fight. Lost contacts outside an active retreat lead to a nine-second last-known-position search, then a town-wide patrol. Local avoidance and a short sideways yielding maneuver keep crowds moving.

Movement is now **4× the initial PoC speed**: humans walk at 3.36 m/s, zombies at 2.44 m/s, and retreating humans at 4.2 m/s. The simulation clock, attack cooldowns, damage, conversion time, and music speed are unchanged.

Both factions begin with 100 health. A machete deals 35 damageon a 3.2-second cooldown; a zombie attack deals 16 on a 3.8-second cooldown. Attacks have a 0.48-second windup and can miss if the target moves out of range. Damage is resolved simultaneously each tick.

A defeated human becomes a zombie after a four-second transformation. Bites do not convert living humans. Defeated zombies stay dead. Conversions preserve character identity and the total population invariant: **humans + infected + dead = 100**.

The observation ends when either faction reaches zero. Transforming humans already count as infected, so a final conversion can end the run before its animation finishes. A simultaneous last human conversion and last original zombie death is therefore a zombie victory, not a draw. The draw outcome covers zero survivors on both sides.

The default seed, 1986, finishes in approximately seven simulated minutes with the current movement and grouping behavior. Other seeds vary; there is no timeout or forced winner. The original 10–15 minute pacing target has been superseded by the requested movement-speed increase. Background tabs stop accumulating simulation time. Long frame gaps are capped to avoid large catch-up jumps.

## Code map

- `src/sim/`: deterministic random generation, world/collision layout, navigation, spatial indexing, perception, behavior, combat, and population accounting. This layer has no browser or Three.js dependency.
- `src/render/`: instanced procedural town and articulated characters, lighting, picking, camera controls, and blood decals. Scenery shares a few geometry/material batches; the crowd uses a single instanced body mesh.
- `src/main.ts` and `src/style.css`: observer controls, inspection, event feed, terminal result, and responsive layout.
- `tests/simulation.test.ts`: focused simulation regression tests.
- `scripts/audit-simulation.ts`: five complete headless runs with navigation/accounting checks and one-minute movement samples.

Central tuning values are in `src/sim/types.ts`. Change the constructor seed in `src/main.ts` to explore another scenario. The UI deliberately does not include tuning or speed controls.

## PoC boundaries

Exterior-only buildings; procedural block-style animation; no interiors, combat sound effects, saves, multiplayer, physics ragdolls, mobile optimization, hosting, or native-engine package. Small decorative details such as benches and rubble are not full physics obstacles. The simulation uses a navigation grid and local steering rather than a physics engine.

## Original soundtrack

`public/audio/ashfield-after-dark.ogg` is an original procedural composition: a D-minor drone, suspended pads, sparse inharmonic bells, heartbeat percussion, and bowed-metal swells. No sampled recordings or external music services are used. It is included under this repository's license.

The committed Ogg is ready to play; FFmpeg is only needed if you want to regenerate it:

```powershell
node scripts/compose-music.mjs
ffmpeg -y -i artifacts/music/ashfield-after-dark.wav -c:a libvorbis -q:a 4 public/audio/ashfield-after-dark.ogg
```

The generator writes a 32 kHz stereo WAV and prints duration, peak, RMS, and loop-boundary measurements. Circularly wrapped note/reverb tails maintain continuity across the loop. Audio is fetched only when music is enabled.

See [the agreed implementation plan](docs/implementation-plan.md), [validation results](docs/validation.md), and [the camera reference](docs/world.png).

## Credits and licensing

Original procedural scene and application code follow the repository's existing Apache-2.0 license. Three.js and the development tools retain their own package licenses. Barlow, Barlow Condensed, and IBM Plex Mono are bundled through Fontsource under their upstream open font licenses; license texts are included with the installed font packages.

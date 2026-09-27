# Zombie Clash

An autonomous browser simulation with a procedural town, animated characters, navigation, perception, combat, UI, and original music. On this branch, **TypeSafe's Jev chooses human squad tactics** through a local server endpoint. Navigation and combat run locally; zombies retain their procedural behaviour.

An autonomous 3D survival simulation in a ruined, miniature town. Fifty humans with machetes face fifty zombies. You observe; you cannot command either side.

## Run locally

Requires Node.js 22.12+ (tested with Node.js 24) and a desktop browser with WebGL 2/hardware acceleration.

```powershell
npm ci
npm run dev
```

Add your API key to `.env.local` in the project root (an empty file has been created locally):

```dotenv
TYPESAFE_API_KEY=your_actual_key
```

This file is ignored by Git. `.env.example` documents the settings without credentials. Never prefix the key with `VITE_`: the key must stay on the server. You can optionally set `TYPESAFE_MODEL`; otherwise the SDK uses its default model. Restart the server after changing environment settings.

Open the local URL printed by Vite, normally http://127.0.0.1:5173. The game starts immediately. Humans use local survival behavior while Jev connects. Missing credentials or API failures display a Retry button; the simulation continues and the controller retries with backoff. Model requests consume your TypeSafe account's API usage. Geometry, animations, fonts, and music remain local.

```powershell
npm test
npm run audit:simulation
npm run build
npm run preview
```

`build` writes the production site to `dist/`. Both `dev` and `preview` provide the server-side Jev endpoint. A static-only file host cannot run this branch's AI; use `npm run preview` locally. Do not open `index.html` through a file URL. This is a local development integration, not a public authenticated service.

## Observe

- Left-drag to orbit; right-drag to pan; scroll or use +/− to zoom.
- Click a character to inspect its faction, health, behavior, and target. **Locate in district** centers and zooms the camera on it.
- **Pause simulation** or Space freezes simulation time and animations. The camera remains usable.
- **Restart** restores the same seed and population, clears selection/events/blood, and resumes. **Reset camera** restores the original overview separately.
- Escape or the inspector's close button clears selection.
- **Music off / on** enables the original 64-second ambient score, **Ashfield After Dark**. Use the adjacent slider for volume. Music starts only after your click, loops seamlessly through Web Audio, and fades/suspends with pause, completion, or a hidden tab. Restart retains your music preference and playback position; reloading defaults to music off.

Human markers are ochre; infected markers are rust. The infected total includes humans currently transforming. The map is fully visible to the observer; characters have limited perception.

## Rules

Humans see up to 29 meters through a forward 140-degree cone, with close-contact awareness in any direction. Buildings, wrecks, dumpsters, and the fountain block vision. Humans also hear active zombies in all directions within 12 metres in the open, reduced to 4 metres across obstacles. Hearing uses a simplified localized contact and feeds the same shared contact memory as sight. Idle humans face detected contacts instead of continuously spinning. Zombies smell living humans within 70 meters, including through buildings, but still need a route around obstacles. Neither faction has global knowledge of opponents.

Humans form nearby squads of up to five within 16 metres and line of sight, retain members within 24 metres of the leader, and merge small squads when leaders rendezvous within four metres. A radio network shares human locations and observed zombie positions. Lost sightings remain at their last observed position for nine seconds; undetected zombies are never included in Jev's input.

Jev chooses complete orders for due squads in batches of up to thirteen: regroup with another squad, retreat to a reachable escape point, attack a spotted zombie, advance toward a patrol point, search a remembered contact, or hold position. Jev is instructed to favor regrouping and purposeful movement. Regroup choices only include groups that can merge and are more than four metres away. Outside immediate melee, hold is removed from the next decision choices while a route is unfinished or after three seconds without a metre of leader movement, provided another order is available. This changes what Jev may choose; it does not cancel the current order while waiting for a response. The game computes candidate destinations and executes the chosen orders with navigation and formation spacing. Close-contact self-defence remains automatic; local survival tactics take over when Jev has no executable order.

Every squad becomes due for a Jev refresh once per simulated second. Up to four batches of thirteen squads run concurrently, with no artificial delay between batches; this covers the maximum 50 squads in one round. A squad has at most one request in flight, so a slow response delays its next refresh without blocking other batches or accumulating duplicate requests. The server shares the four-request concurrency limit. Existing Jev orders persist until replaced: reaching a destination maintains that position/formation, and hold orders no longer expire into local behavior. Membership changes preserve the surviving leader's order (split squads inherit their new leader's previous order), while pending answers still require matching membership versions. A regroup target that joins the same squad becomes a stationary formation anchor. Unassigned humans or humans with invalid targets use local survival behavior until Jev provides an executable order. Responses are checked per squad for sequence, membership, target validity and an eight-second snapshot age. Requests time out after ten real seconds; failed squads retry with capped exponential backoff independently of healthy batches. Manual pause, hidden tabs, completion and restart cancel all pending requests. Explicit Retry preserves manual pause. The inspector shows each human's squad, order, target/destination, age, and confidence. Confidence describes the model's selection, not a guarantee of success.

Movement is now **4× the initial PoC speed**: humans walk at 3.36 m/s, zombies at 2.44 m/s, and retreating humans at 4.2 m/s. The simulation clock, attack cooldowns, damage, conversion time, and music speed are unchanged.

Both factions begin with 100 health. A machete deals 35 damageon a 3.2-second cooldown; a zombie attack deals 16 on a 3.8-second cooldown. Attacks have a 0.48-second windup and can miss if the target moves out of range. Damage is resolved simultaneously each tick.

A defeated human becomes a zombie after a four-second transformation. Bites do not convert living humans. Defeated zombies stay dead. Conversions preserve character identity and the total population invariant: **humans + infected + dead = 100**.

The observation ends when either faction reaches zero. Transforming humans already count as infected, so a final conversion can end the run before its animation finishes. A simultaneous last human conversion and last original zombie death is therefore a zombie victory, not a draw. The draw outcome covers zero survivors on both sides.

Live Jev runs are not seed-deterministic and have no guaranteed completion time or winner. The retained procedural baseline finishes seed 1986 in approximately seven simulated minutes. Background tabs stop accumulating simulation time. Long frame gaps are capped to avoid large catch-up jumps. AI errors do not pause play. The main control always pauses or resumes the simulation; **Retry Jev** requests an immediate retry without changing a deliberate manual pause.

## Code map

- `src/sim/`: deterministic random generation, world/collision layout, navigation, spatial indexing, perception, behavior, combat, and population accounting. This layer has no browser or Three.js dependency.
- `src/ai/`: squads, shared observations, bounded order candidates, and asynchronous request scheduling. `server/jev.ts` validates requests and uses the TypeSafe SDK without exposing credentials.
- `src/render/`: instanced procedural town and articulated characters, lighting, picking, camera controls, and blood decals. Scenery shares a few geometry/material batches; the crowd uses a single instanced body mesh.
- `src/main.ts` and `src/style.css`: observer controls, inspection, event feed, terminal result, and responsive layout.
- `tests/simulation.test.ts`: focused simulation regression tests.
- `tests/jev.test.ts`: squad behaviour, perception, order execution, lifecycle, validation, and SDK transport tests. All automated tests use mocks rather than a paid API key.
- `scripts/audit-simulation.ts`: five complete headless runs with navigation/accounting checks and one-minute movement samples.

Central tuning values are in `src/sim/types.ts`. Change the constructor seed in `src/main.ts` to explore another scenario. The UI deliberately does not include tuning or speed controls. A plain `Simulation` remains procedural for baseline tests and the headless audit; the browser attaches the Jev controller.

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

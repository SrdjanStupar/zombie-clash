# Zombie Clash — browser simulation PoC

## Summary

Build a fully autonomous 3D simulation with **50 humans and 50 zombies**, viewed from an elevated, isometric-style camera inspired by `docs/world.png`.

Use **TypeScript, Vite, and Three.js**, running locally in a desktop browser. Astra builds the application; character behavior runs entirely in local simulation code, with no runtime model calls or backend. Continue with **Astra Medium** for implementation.

## World and presentation

- Create a compact town approximately six blocks across, with connected streets, alleys, and yards. Buildings are exterior-only and block movement and human vision.
- Match the reference’s low-poly composition, transformed into a gray, abandoned town: damaged houses, shuttered stores, cracked roads, wrecked cars, dumpsters, rubble, and sparse dead vegetation.
- Use overcast lighting, soft shadows, and subtle atmospheric haze. Keep humans and zombies distinguishable through silhouettes, posture, and muted clothing colors.
- Provide recognizable walking, running, machete swings, claw/bite attacks, stagger, conversion, and death animations. Use restrained blood effects and persistent zombie corpses.
- Start with the whole town visible. Support bounded pan, zoom, and rotation, plus a reset-view button.

## Simulation rules

- Use a seeded, fixed-step simulation separate from rendering. Distribute both factions across reachable outdoor locations, without overlapping obstacles or beginning within melee range. Restart reproduces the same initial scenario.
- Zombies detect humans by scent within approximately **two to three blocks**, even through buildings. They pursue detected humans using navigable routes; scent grants no knowledge outside its range.
- Humans detect zombies within approximately **one block**, inside a forward vision cone and with unobstructed sight. Buildings and substantial props occlude vision.
- Humans explore, approach nearby allies, and engage when locally perceived odds are favorable. When outnumbered, they retreat a limited distance and reassess; cornered humans fight.
- Both factions search after losing a target, then resume patrols. Patrol routes cover the connected town so survivors do not remain idle indefinitely. Decisions use local perception and brief last-known-position memory.
- Use health, attack range, cooldowns, and visible attack windups. Humans have only machetes; zombies use claws and bites. Humans are stronger individually, while multiple zombies can overwhelm them.
- A defeated human converts at the same location after a short transformation animation, returning with zombie health and behavior. A defeated zombie dies permanently. Bites alone do not trigger conversion.
- Resolve combat consistently within each simulation tick, preventing duplicate kills or conversions. Count transforming humans as part of the zombie faction for victory checks.
- Finish when either faction reaches zero; show the winner and final totals. If both reach zero in the same tick, report mutual elimination.
- Tune toward **10–15 minute runs** through movement, search behavior, and combat balance. This is a pacing target, not a timer or guaranteed duration; never force a winner.

## Observer interface and architecture

- Provide pause/resume, restart, camera controls, and click-to-inspect characters. Omit speed controls and character commands.
- Display elapsed simulation time, surviving humans, active/transforming zombies, conversions, and dead zombies.
- Inspection shows faction, health, current behavior, and target; highlight the selected character and explain its current action briefly.
- Keep rendering, world generation, navigation, perception, combat, and UI separate. Use typed character states and simulation events for attacks, conversions, deaths, and completion.
- Use grid-based pathfinding, local avoidance, and spatial indexing for nearby-agent queries. Throttle perception and route updates independently of rendering.
- Build assets from reusable procedural geometry, using instancing for repeated scenery. No paid asset dependencies.

## Validation and delivery

- Test sight occlusion, limited scent range, obstacle routing, target loss, retreat/reassessment, attack cooldowns, conversion, permanent death, and victory conditions.
- Verify population accounting, simultaneous combat outcomes, deterministic restart, and that pause freezes simulation time and animations.
- Run multiple seeded simulations to check for stuck characters, unreachable survivors, and pacing problems. Adjust balance without adding global enemy knowledge.
- Visually inspect the browser build at full-town and close-up scales; confirm readable characters, convincing combat, usable inspection, and camera bounds.
- Target smooth performance with 100 active characters on a typical desktop; measure on the available machine and report actual results.
- Deliver the source, automated simulation checks, production build, and README with local run instructions. Initial delivery is local; hosting, interiors, audio, mobile support, and Unreal/desktop packaging are outside this PoC.

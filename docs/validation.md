# Validation — 26 September 2026

## Automated checks

- Production TypeScript check and Vite build pass.
- 15 Vitest tests pass: obstacle occlusion, smell range, human view cone, connected/clear spawning, obstacle routing, lost-contact search, retreat/reassessment, attack windup and cooldown, moving targets, conversion, permanent death, simultaneous strikes in both iteration orders, no infection from a nonlethal hit, victory/draw handling, pause, and frame-group-independent determinism.
- Dependency installation reports zero known vulnerabilities after updating Vitest to 4.1.11. This is a package-audit result, not a full security assessment.

## Complete simulation runs

The audit runs the actual fixed-step simulation without rendering. The 30-minute audit ceiling only bounds the diagnostic script; the application has no timeout.

- Seed **1986**: zombie victory at **14.49 minutes**; 16 infected remain, 84 dead, 50 conversions.
- Seed **42**: zombie victory at **9.50 minutes**; 29 infected remain, 71 dead, 50 conversions.
- Seed **2026**: zombie victory at **11.47 minutes**; 35 infected remain, 65 dead, 50 conversions.
- Seed **7**: zombie victory at **12.68 minutes**; 37 infected remain, 63 dead, 50 conversions.
- Seed **99**: human victory at **5.79 minutes**; 39 humans remain, 61 dead, 11 conversions.

All five runs completed before the diagnostic ceiling. All reported zero population-accounting errors, zero active characters outside navigable ground, and zero stationary noncombatants in the one-minute movement samples. Sampling does not prove that every possible seed is free of stalls. Infected totals include any transformations pending at the terminal tick.

The default run meets the 10–15 minute pacing target. Alternate seeds demonstrate natural outcome and duration variation; the PoC does not guarantee equal win rates or similar duration for every seed.

## Browser checks

Tested in the available Chromium-based in-app browser on this Windows machine, including a 1440 × 900 desktop viewport and the browser's narrower default viewport.

- Full-town view and zoomed scenery inspected visually: gray palette, missing roofs/collapsed walls, houses and shuttered shops, wrecks, dumpsters, dead trees, and the dry fountain.
- Character picking populates the inspector with identity, faction, health, behavior, and target.
- Locate centers and zooms to the selected character; close inspection confirms visible machetes, hunched infected, faction markers, and the selection ring. An inspector/event-log overlap found during review was corrected.
- Pause verified by comparing both simulation time and every character's position, health, and state across separate browser observations: unchanged.
- Restart restores 50 humans, 50 infected, zero deaths/conversions, initial clock, cleared inspection, and the initial event log.
- Observed **60 FPS**, approximately **16.68 ms mean frame interval**, with all 100 characters alive at 1440 × 900. Rendering reported **18 draw calls** and approximately **80,000 triangles**. These are short samples from this machine, not cross-device benchmarks or GPU-time measurements.
- Browser error/warning log was empty at inspection.

Unit tests cover terminal outcome rules. A full 14½-minute run was validated headlessly, not observed from beginning to end in the graphical browser.

## Soundtrack addition

- Generated the original 64-second stereo score “Ashfield After Dark” using the checked-in Node.js synthesizer; the revised mix is a 568,735-byte, 32 kHz Vorbis asset.
- Reduced the bell layer to 35% of its original gain (approximately −9 dB relative to the ambient layers), including its reverb tails.
- Revised WAV master measurements: peak −3.74 dBFS and RMS −13.49 dBFS; the default in-game gain is 28%. No clipping in the generated master.
- Browser verified user-initiated decode/playback (`AudioContext` running, decoded duration 64 seconds), the volume slider, and simulation-pause suspension. Music defaults off and uses one looping buffer source, independent of frame scheduling.
- TypeScript and production build pass with the bundled track. Audio signal/transport checks are not a subjective listening review.

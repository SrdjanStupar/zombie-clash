import { Simulation, active } from '../src/sim/simulation';
import { RULES } from '../src/sim/types';

const seeds = [1986, 42, 2026, 7, 99];
for (const seed of seeds) {
  const start = performance.now(), s = new Simulation(seed);
  let offGrid = 0, accountingErrors = 0, stationary = 0;
  const distances = new Map<number, number>();
  for (let tick = 0; tick < 60 * 30 / RULES.step && !s.outcome; tick++) {
    s.step();
    if (tick % 200 === 0) {
      const c = s.counts;
      if (c.humans + c.zombies + c.dead !== 100) accountingErrors++;
      for (const a of s.agents) if (active(a) && !s.nav.walkable(a)) offGrid++;
    }
    if (tick % 1200 === 0) {
      for (const a of s.agents) {
        if (active(a) && a.state !== 'attack' && distances.has(a.id) && a.distance - distances.get(a.id)! < .5) stationary++;
        distances.set(a.id, a.distance);
      }
    }
  }
  console.log(JSON.stringify({ seed, simulatedMinutes: +(s.time / 60).toFixed(2), outcome: s.outcome ?? 'still running at 30m', ...s.counts, offGrid, accountingErrors, stationaryMinuteSamples: stationary, wallSeconds: +((performance.now() - start) / 1000).toFixed(2) }));
}

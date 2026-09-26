import { random } from './random';
import type { World, Obstacle } from './types';

export function createWorld(seed = 1986): World {
  const rng = random(seed);
  const obstacles: Obstacle[] = [];
  const patrol: World['patrol'] = [];
  // Six 30 m blocks, with a continuous outer street and two cross streets per block.
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const x = -75 + col * 30, z = -75 + row * 30;
      patrol.push({ x: x - 14, z: z - 14 });
      for (let slot = 0; slot < 3; slot++) {
        if ((row === 2 && col === 2) || (row === 3 && col === 3 && slot > 0)) continue;
        const sx = slot === 0 ? -6 : 6, sz = slot === 2 ? 6 : -5;
        const shop = (row + col + slot) % 5 === 0;
        obstacles.push({ x: x + sx, z: z + sz, w: shop ? 10 : 7 + rng() * 2, d: 8 + rng() * 2, height: shop ? 4.6 : 5 + rng() * 4, kind: 'building', variant: Math.floor(rng() * 5), angle: 0 });
      }
      if (rng() > 0.28) obstacles.push({ x: x + 13, z: z - 6 + rng() * 10, w: 2.2, d: 4.5, height: 1.6, kind: 'car', variant: Math.floor(rng() * 4), angle: (rng() - 0.5) * 0.3 });
      if (rng() > 0.35) obstacles.push({ x: x - 6, z: z + 10.8, w: 2.8, d: 1.6, height: 1.5, kind: 'dumpster', variant: 0, angle: 0 });
    }
  }
  obstacles.push({ x: -15, z: -15, w: 7, d: 7, height: 2.5, kind: 'fountain', variant: 0, angle: 0 });
  // Serpentine loop covers the full town without requiring knowledge of opponents.
  patrol.sort((a, b) => a.z - b.z || (Math.round((a.z + 89) / 30) % 2 ? b.x - a.x : a.x - b.x));
  return { size: 186, seed, obstacles, patrol };
}

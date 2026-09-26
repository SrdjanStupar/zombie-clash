import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Navigation } from '../src/sim/navigation';
import { dist } from '../src/sim/random';
import { RULES, type World } from '../src/sim/types';

const empty = (): World => ({ size: 186, seed: 1, obstacles: [], patrol: [{ x: -50, z: -50 }, { x: 50, z: 50 }] });
const fixture = () => {
  const sim = new Simulation(1, empty(), 0);
  sim.agents.push(sim.makeAgent(0, 'human', { x: 0, z: 0 }), sim.makeAgent(1, 'zombie', { x: 0, z: 1.5 }));
  for (const a of sim.agents) { a.nextThink = Infinity; a.heading = 0; }
  sim.agents[0].target = 1; sim.agents[1].target = 0;
  sim.spatial.rebuild(sim.agents); return sim;
};
const steps = (s: Simulation, seconds: number) => { for (let i = 0; i < seconds / RULES.step; i++) s.step(); };

describe('perception and navigation', () => {
  it('limits scent to 70m, including through buildings, while walls block sight', () => {
    const world = empty(); world.obstacles.push({ x: 0, z: 8, w: 12, d: 4, height: 8, kind: 'building', variant: 0, angle: 0 });
    const s = new Simulation(1, world, 0), human = s.makeAgent(0, 'human', { x: 0, z: 0 }), zombie = s.makeAgent(1, 'zombie', { x: 0, z: 15 });
    human.heading = 0;
    expect(s.canDetect(human, zombie)).toBe(false); expect(s.canDetect(zombie, human)).toBe(true);
    zombie.z = 71; expect(s.canDetect(zombie, human)).toBe(false);
  });
  it('restricts human vision by distance and facing, but allows close contact behind', () => {
    const s = fixture(), [h, z] = s.agents;
    z.z = 20; expect(s.canDetect(h, z)).toBe(true);
    z.z = 30; expect(s.canDetect(h, z)).toBe(false);
    z.z = -10; expect(s.canDetect(h, z)).toBe(false);
    z.z = -2; expect(s.canDetect(h, z)).toBe(true);
  });
  it('routes around buildings without crossing blocked cells', () => {
    const world = empty(); world.obstacles.push({ x: 0, z: 0, w: 12, d: 14, height: 6, kind: 'building', variant: 0, angle: 0 });
    const nav = new Navigation(world); let p = { x: -15, z: 0 };
    const route = nav.path(p, { x: 15, z: 0 }); expect(route.length).toBeGreaterThan(1);
    for (const q of route) { expect(nav.clearPath(p, q)).toBe(true); expect(nav.walkable(q)).toBe(true); p = q; }
    expect(dist(p, { x: 15, z: 0 })).toBeLessThan(2);
  });
  it('starts 50 per side on connected ground, separated from all other characters', () => {
    const s = new Simulation(); expect(s.counts).toEqual({ humans: 50, zombies: 50, turning: 0, dead: 0, conversions: 0 });
    for (const a of s.agents) { expect(s.nav.walkable(a)).toBe(true); for (const b of s.agents) if (a.id !== b.id) expect(dist(a, b)).toBeGreaterThan(4.5); }
  });
  it('uses last-known positions after losing scent, then resumes patrol', () => {
    const s = fixture(), [h, z] = s.agents; h.z = 40; z.nextThink = 0;
    s.step(); expect(z.state).toBe('pursue'); const known = { ...z.lastKnown! };
    h.z = -85; h.x = -85; z.nextThink = 0; s.step();
    expect(z.state).toBe('search'); expect(z.target).toBeNull(); expect(z.lastKnown).toEqual(known);
    steps(s, 10); expect(z.state).toBe('patrol'); expect(z.lastKnown).toBeNull();
  });
  it('retreats when outnumbered, then reassesses rather than fleeing forever', () => {
    const s = fixture(), [h, z] = s.agents; z.z = 7;
    const z2 = s.makeAgent(2, 'zombie', { x: 3, z: 7 }); z2.nextThink = Infinity; s.agents.push(z2); h.nextThink = 0;
    s.step(); expect(h.state).toBe('retreat'); expect(h.retreatUntil).toBeGreaterThan(s.time);
    const until = h.retreatUntil; h.retreatUntil = 0; h.nextThink = 0; h.heading = 0; s.step();
    expect(h.state).not.toBe('retreat'); expect(h.braveUntil).toBeGreaterThan(until);
  });
  it('keeps retreating after turning away and losing sight, then suppresses immediate re-retreat', () => {
    const s = fixture(), [h, z] = s.agents; z.z = 7;
    const z2 = s.makeAgent(2, 'zombie', { x: 3, z: 7 }); z2.nextThink = Infinity; s.agents.push(z2); h.nextThink = 0;
    s.step(); const destination = { ...h.destination! }, deadline = h.retreatUntil;
    expect(h.state).toBe('retreat'); expect(s.canDetect(h, z)).toBe(false);
    for (let i = 0; i < 35; i++) { s.step(); expect(h.state).toBe('retreat'); expect(h.destination).toEqual(destination); }
    expect(h.z).toBeLessThan(-6); expect(h.target).toBeNull();
    // A brief look back must not restart or extend the escape.
    h.heading = 0; h.nextThink = 0; s.step();
    expect(h.state).toBe('retreat'); expect(h.retreatUntil).toBe(deadline);
    steps(s, 1.5); expect(h.state).not.toBe('retreat'); expect(h.braveUntil).toBeGreaterThan(s.time);
    h.x = 0; h.z = 0; h.heading = 0; h.path = []; h.nextThink = 0; s.step();
    expect(h.state).toBe('pursue');
  });
  it('reassesses a retreat deadline without visible enemies and can fight when cornered', () => {
    const s = fixture(), [h, z] = s.agents;
    h.state = 'retreat'; h.retreatUntil = 0; h.heading = Math.PI; h.lastKnown = { x: 0, z: 7 }; h.memoryUntil = 9;
    h.path = [{ x: 0, z: -10 }]; h.destination = h.path[0]; h.nextThink = 0; z.z = 7;
    s.step(); expect(h.state).toBe('search'); expect(h.braveUntil).toBeGreaterThan(s.time);
    h.state = 'retreat'; h.retreatUntil = s.time + 7; h.nextThink = 0; z.x = h.x; z.z = h.z + 1;
    s.step(); expect(h.state).toBe('attack'); expect(h.strikeAt).toBeGreaterThan(s.time);
  });
});

describe('human regrouping', () => {
  it('scans behind a waiting group, pursues a newly seen zombie, and lands a hit', () => {
    const s = new Simulation(1, empty(), 0);
    for (let i = 0; i < 4; i++) {
      const human = s.makeAgent(i * 3, 'human', { x: i * 1.5, z: 0 });
      human.heading = 0; human.nextThink = 0; s.agents.push(human);
    }
    const zombie = s.makeAgent(20, 'zombie', { x: 0, z: -12 });
    zombie.nextThink = Infinity; s.agents.push(zombie);
    s.step(); expect(s.agents[0].state).toBe('regroup');
    expect(s.canDetect(s.agents[0], zombie)).toBe(false);
    steps(s, 3);
    expect(s.agents.some(a => a.faction === 'human' && a.target === zombie.id)).toBe(true);
    steps(s, 8); expect(zombie.hp).toBeLessThan(100);
  });
  it('keeps up with a pursuing ally even before the follower sees the enemy', () => {
    const s = new Simulation(1, empty(), 0);
    const follower = s.makeAgent(0, 'human', { x: 0, z: 0 });
    const ally = s.makeAgent(1, 'human', { x: 0, z: 6 });
    const zombie = s.makeAgent(2, 'zombie', { x: 0, z: 20 });
    follower.heading = Math.PI; follower.nextThink = 0;
    ally.state = 'pursue'; ally.path = [{ x: 0, z: 20 }]; ally.nextThink = Infinity;
    zombie.nextThink = Infinity; s.agents.push(follower, ally, zombie);
    s.step();
    expect(follower.state).toBe('regroup'); expect(follower.target).toBeNull();
    expect(follower.path.length).toBeGreaterThan(0); expect(follower.z).toBeGreaterThan(0);
  });
  it('does not acquire a zombie through a wall while scanning', () => {
    const world = empty();
    world.obstacles.push({ x: 0, z: -6, w: 20, d: 3, height: 6, kind: 'building', variant: 0, angle: 0 });
    const s = new Simulation(1, world, 0);
    const human = s.makeAgent(0, 'human', { x: 0, z: 0 });
    const ally = s.makeAgent(1, 'human', { x: 2, z: 0 });
    const zombie = s.makeAgent(2, 'zombie', { x: 0, z: -12 });
    human.nextThink = 0; ally.nextThink = Infinity; zombie.nextThink = Infinity;
    s.agents.push(human, ally, zombie); steps(s, 8);
    expect(human.state).toBe('regroup'); expect(human.target).toBeNull(); expect(human.lastKnown).toBeNull();
  });
  it('keeps willing humans grouped after they reach an ally', () => {
    const s = new Simulation(1, empty(), 0);
    const follower = s.makeAgent(0, 'human', { x: 0, z: 0 });
    const ally = s.makeAgent(1, 'human', { x: 0, z: 10 });
    const zombie = s.makeAgent(2, 'zombie', { x: 80, z: 80 });
    follower.nextThink = 0; ally.nextThink = Infinity; zombie.nextThink = Infinity;
    s.agents.push(follower, ally, zombie);
    s.step(); expect(follower.state).toBe('regroup');
    steps(s, 1); expect(dist(follower, ally)).toBeLessThan(8);
    steps(s, 8); expect(follower.state).toBe('regroup');
    expect(follower.path).toEqual([]); expect(follower.destination).toBeNull();
  });
  it('lets a pair attack up to two zombies but retreat from three', () => {
    const s = new Simulation(1, empty(), 0);
    const follower = s.makeAgent(0, 'human', { x: 0, z: 0 });
    const ally = s.makeAgent(1, 'human', { x: 2, z: 0 });
    const zombie = s.makeAgent(2, 'zombie', { x: 0, z: 12 });
    follower.heading = 0; follower.nextThink = 0; ally.nextThink = Infinity; zombie.nextThink = Infinity;
    s.agents.push(follower, ally, zombie);
    s.step(); expect(follower.state).toBe('pursue'); expect(follower.target).toBe(zombie.id);
    for (const [id, x] of [[3, -2], [4, 2]] as const) {
      const threat = s.makeAgent(id, 'zombie', { x, z: 11 }); threat.nextThink = Infinity; s.agents.push(threat);
    }
    follower.nextThink = 0; s.step(); expect(follower.state).toBe('retreat');
  });
  it('makes lone humans flee while groups of four attack a larger swarm', () => {
    const lone = new Simulation(1, empty(), 0);
    const human = lone.makeAgent(0, 'human', { x: 0, z: 0 }), zombie = lone.makeAgent(1, 'zombie', { x: 0, z: 10 });
    human.heading = 0; human.nextThink = 0; zombie.nextThink = Infinity; lone.agents.push(human, zombie);
    lone.step(); expect(human.state).toBe('retreat');

    const grouped = new Simulation(1, empty(), 0);
    const fighter = grouped.makeAgent(0, 'human', { x: 0, z: 0 }); fighter.heading = 0; fighter.nextThink = 0; grouped.agents.push(fighter);
    for (let i = 1; i < 4; i++) { const ally = grouped.makeAgent(i, 'human', { x: i * 1.5, z: 0 }); ally.nextThink = Infinity; grouped.agents.push(ally); }
    for (let i = 0; i < 6; i++) { const threat = grouped.makeAgent(10 + i, 'zombie', { x: (i - 2.5) * 1.2, z: 10 + i % 2 }); threat.nextThink = Infinity; grouped.agents.push(threat); }
    grouped.step(); expect(fighter.state).toBe('pursue'); expect(fighter.target).not.toBeNull();
  });
});

describe('combat and accounting', () => {
  it('applies damage only after a windup and respects cooldowns', () => {
    const s = fixture(); s.step(); expect(s.agents[1].hp).toBe(100);
    steps(s, .55); expect(s.agents[1].hp).toBeCloseTo(65); expect(s.agents[0].hp).toBe(84);
    steps(s, .6); expect(s.agents[1].hp).toBeCloseTo(65); expect(s.agents[0].hp).toBe(84);
  });
  it('cancels a strike when its target moves out of range', () => {
    const s = fixture(); s.step(); s.agents[1].z = 10; steps(s, 1); expect(s.agents[1].hp).toBe(100);
  });
  it('converts defeated humans once and counts them as zombies during transformation', () => {
    const s = fixture(); s.agents[0].hp = 10;
    s.agents.push(s.makeAgent(2, 'human', { x: 60, z: 60 })); s.agents[2].nextThink = Infinity;
    steps(s, .6); const h = s.agents[0];
    expect(h.state).toBe('turning'); expect(h.faction).toBe('zombie'); expect(s.counts).toEqual({ humans: 1, zombies: 2, turning: 1, dead: 0, conversions: 1 });
    steps(s, 4.2); expect(h.state).not.toBe('turning'); expect(h.hp).toBe(100); expect(s.conversions).toBe(1);
  });
  it('leaves a defeated zombie permanently dead and declares a human victory', () => {
    const s = fixture(); s.agents[1].hp = 20; steps(s, .6);
    expect(s.agents[1].state).toBe('dead'); expect(s.outcome).toBe('humans'); const time = s.time;
    steps(s, 10); expect(s.time).toBe(time); expect(s.agents[1].state).toBe('dead');
  });
  it('resolves simultaneous lethal strikes without iteration-order bias', () => {
    const s = fixture(); s.agents[0].hp = 10; s.agents[1].hp = 20; steps(s, .6);
    expect(s.agents[0].state).toBe('turning'); expect(s.agents[1].state).toBe('dead'); expect(s.outcome).toBe('zombies');
    expect(s.counts.humans + s.counts.zombies + s.counts.dead).toBe(2);
    const reversed = fixture(); reversed.agents[0].hp = 10; reversed.agents[1].hp = 20; reversed.agents.reverse(); steps(reversed, .6);
    expect(reversed.counts).toEqual(s.counts); expect(reversed.outcome).toBe(s.outcome);
  });
  it('does not infect a living human merely because a zombie lands a hit', () => {
    const s = fixture(); steps(s, .6); expect(s.agents[0].hp).toBeLessThan(100); expect(s.agents[0].faction).toBe('human'); expect(s.conversions).toBe(0);
  });
  it('reports mutual elimination for an empty world', () => { const s = new Simulation(1, empty(), 0); s.step(); expect(s.outcome).toBe('draw'); });
});

describe('time and reproducibility', () => {
  it('moves both factions and retreating humans four times faster without accelerating the clock', () => {
    for (const retreating of [false, true]) {
      const s = fixture(), [h, z] = s.agents;
      h.target = null; z.target = null; h.path = [{ x: 0, z: 40 }]; h.state = retreating ? 'retreat' : 'patrol';
      z.x = 50; z.z = 50; z.path = [{ x: 50, z: 85 }];
      steps(s, 1);
      expect(h.z).toBeCloseTo((retreating ? 1.05 : .84) * 4, 8);
      expect(z.z - 50).toBeCloseTo(.61 * 4, 8); expect(s.time).toBe(1);
    }
  });
  it('freezes all simulation state while paused', () => {
    const s = fixture(); s.step(); s.paused = true; const before = JSON.stringify(s.agents), t = s.time;
    s.advance(.2); s.step(); expect(s.time).toBe(t); expect(JSON.stringify(s.agents)).toBe(before);
  });
  it('reproduces the same run regardless of frame grouping', () => {
    const a = new Simulation(1986), b = new Simulation(1986);
    for (let i = 0; i < 100; i++) a.advance(.1);
    for (let i = 0; i < 200; i++) b.advance(.05);
    expect(a.agents).toEqual(b.agents); expect(a.counts).toEqual(b.counts);
  });
});

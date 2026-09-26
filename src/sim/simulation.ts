import { Navigation } from './navigation';
import { dist, random } from './random';
import { SpatialIndex } from './spatial';
import { createWorld } from './world';
import { MOVEMENT_SPEED_MULTIPLIER, RULES, type Agent, type Counts, type Faction, type Outcome, type SimEvent, type State, type Vec2, type World } from './types';

const names = ['Morgan', 'Ellis', 'Rowan', 'Alex', 'Riley', 'Sam', 'Casey', 'Ash', 'Jules', 'Blair', 'Reese', 'Drew', 'Quinn', 'Cameron', 'Finley', 'Sage', 'Robin', 'Jamie', 'River', 'Avery'];
export const active = (a: Agent) => a.state !== 'dead' && a.state !== 'turning';

export class Simulation {
  readonly nav: Navigation;
  readonly spatial = new SpatialIndex();
  readonly agents: Agent[] = [];
  readonly events: SimEvent[] = [];
  time = 0;
  tick = 0;
  paused = false;
  outcome: Outcome | null = null;
  conversions = 0;
  private accumulator = 0;
  private rng: () => number;

  constructor(readonly seed = 1986, readonly world: World = createWorld(seed), population = 50) {
    this.rng = random(seed ^ 0xFAB);
    this.nav = new Navigation(world);
    for (let i = 0; i < population * 2; i++) {
      let p: Vec2 | undefined;
      for (let tries = 0; tries < 20000; tries++) {
        const candidate = this.nav.point(this.nav.reachable[Math.floor(this.rng() * this.nav.reachable.length)]);
        if (this.agents.every(a => dist(a, candidate) > 4.5)) { p = candidate; break; }
      }
      if (!p) throw new Error('Not enough connected outdoor space for this population.');
      this.agents.push(this.makeAgent(i, i < population ? 'human' : 'zombie', p));
    }
    this.spatial.rebuild(this.agents);
  }
  makeAgent(id: number, faction: Faction, p: Vec2): Agent {
    return {
      id, name: faction === 'human' ? `${names[id % names.length]} ${String(id + 1).padStart(2, '0')}` : `Infected ${String(id + 1).padStart(3, '0')}`,
      ...p, faction, state: 'patrol', hp: 100, heading: this.rng() * Math.PI * 2,
      target: null, lastKnown: null, memoryUntil: 0, path: [], destination: null,
      nextThink: this.rng(), nextPath: 0, cooldown: 0, strikeAt: -1, attackStarted: -100,
      attackTarget: null, turnAt: 0, stateSince: 0, retreatUntil: 0, braveUntil: 0,
      hitAt: -100, deathAt: -100, patrolIndex: Math.floor(this.rng() * Math.max(1, this.world.patrol.length)), distance: 0, moving: false,
      stuckFor: 0, recoveryUntil: 0,
    };
  }
  get counts(): Counts {
    let humans = 0, zombies = 0, turning = 0, dead = 0;
    for (const a of this.agents) {
      if (a.state === 'dead') dead++;
      else if (a.faction === 'human') humans++;
      else { zombies++; if (a.state === 'turning') turning++; }
    }
    return { humans, zombies, turning, dead, conversions: this.conversions };
  }
  advance(seconds: number) {
    if (this.paused || this.outcome) return;
    this.accumulator += Math.min(seconds, 0.25);
    while (this.accumulator + 1e-9 >= RULES.step && !this.outcome) { this.step(); this.accumulator -= RULES.step; }
  }
  canDetect(a: Agent, b: Agent) {
    if (!active(b) || a.faction === b.faction) return false;
    const d = dist(a, b);
    if (a.faction === 'zombie') return d <= RULES.scent;
    if (d > RULES.humanSight || !this.nav.visible(a, b)) return false;
    // Immediate contact can be perceived from any direction; distant sight is a 140° cone.
    return d < 3 || ((b.x - a.x) * Math.sin(a.heading) + (b.z - a.z) * Math.cos(a.heading)) / Math.max(d, 0.001) >= Math.cos(70 * Math.PI / 180);
  }
  private state(a: Agent, next: State) {
    if (a.state !== next) {
      // Every retreat exit, including close combat, gets a reassessment window.
      if (a.state === 'retreat') { a.braveUntil = this.time + 22; a.nextPath = 0; a.recoveryUntil = 0; }
      a.state = next; a.stateSince = this.time;
    }
  }
  private route(a: Agent, goal: Vec2) {
    if (this.time < a.recoveryUntil && a.path.length) return;
    if (this.time < a.nextPath && a.destination && dist(goal, a.destination) < 5 && a.path.length) return;
    a.destination = this.nav.nearest(goal);
    a.path = this.nav.path(a, a.destination);
    a.nextPath = this.time + 2.2 + (a.id % 7) * 0.1;
  }
  private think(a: Agent) {
    a.nextThink = this.time + 0.65 + (a.id % 5) * 0.07;
    if (a.strikeAt >= 0) return;
    const perceived = this.spatial.near(a, a.faction === 'human' ? RULES.humanSight : RULES.scent).filter(b => this.canDetect(a, b)).sort((b, c) => dist(a, b) - dist(a, c) || b.id - c.id);
    const enemy = perceived[0];
    if (enemy) {
      a.target = enemy.id; a.lastKnown = { x: enemy.x, z: enemy.z }; a.memoryUntil = this.time + RULES.memorySeconds;
    } else a.target = null;
    if (a.state === 'retreat') {
      // Turning away naturally loses the view cone. Keep the escape route instead of
      // replacing it with a search route back toward the threat on the next think.
      const reachedSafety = !a.path.length || (a.destination !== null && dist(a, a.destination) < 1);
      const cornered = enemy !== undefined && dist(a, enemy) <= RULES.melee;
      if (this.time < a.retreatUntil && !reachedSafety && !cornered) return;
      this.state(a, enemy ? 'pursue' : 'search');
    }
    if (enemy) {
      if (a.faction === 'human') {
        const allies = this.spatial.near(a, 15).filter(b => b.id !== a.id && b.faction === 'human' && this.nav.visible(a, b));
        const threats = perceived.filter(b => dist(a, b) < 16).length;
        if (threats > allies.length + 1 && this.time >= a.braveUntil && dist(a, enemy) > 2.3) {
          const len = Math.max(1, dist(a, enemy));
          let goal = { x: a.x + (a.x - enemy.x) / len * 10, z: a.z + (a.z - enemy.z) / len * 10 };
          const ally = allies.find(b => dist(b, enemy) > dist(a, enemy) + 2);
          if (ally) goal = ally;
          const safe = this.nav.nearest(goal);
          if (dist(a, safe) > 3) { this.state(a, 'retreat'); a.retreatUntil = this.time + 7; a.nextPath = 0; a.recoveryUntil = 0; this.route(a, safe); return; }
          a.braveUntil = this.time + 22;
        }
      }
      this.state(a, dist(a, enemy) <= RULES.melee ? 'attack' : 'pursue');
      this.route(a, enemy);
      return;
    }
    a.target = null;
    if (a.lastKnown && this.time < a.memoryUntil) {
      this.state(a, 'search'); this.route(a, a.lastKnown);
      if (dist(a, a.lastKnown) < 2) a.heading += 0.8;
      return;
    }
    a.lastKnown = null;
    if (a.faction === 'human' && a.id % 3 === 0 && a.state !== 'regroup') {
      const ally = this.spatial.near(a, 16).find(b => b.id !== a.id && b.faction === 'human' && dist(a, b) > 8 && this.nav.visible(a, b));
      if (ally) { this.state(a, 'regroup'); this.route(a, ally); return; }
    }
    if (a.state === 'regroup' && this.time - a.stateSince < 6 && a.path.length) return;
    this.state(a, 'patrol');
    const patrol = this.world.patrol;
    if (!patrol.length) return;
    if (!a.path.length || (a.destination && dist(a, a.destination) < 2.2)) a.patrolIndex = (a.patrolIndex + 1) % patrol.length;
    this.route(a, patrol[a.patrolIndex]);
  }
  private move(a: Agent) {
    a.moving = false;
    if (a.strikeAt >= 0) return;
    const target = a.target === null ? undefined : this.agents.find(b => b.id === a.target);
    if (target && active(target) && dist(a, target) < RULES.melee && this.nav.visible(a, target)) {
      if (a.state !== 'retreat' || dist(a, target) < 1.15) {
        a.heading = Math.atan2(target.x - a.x, target.z - a.z);
        this.state(a, 'attack');
        if (this.time >= a.cooldown) {
          a.attackStarted = this.time; a.strikeAt = this.time + RULES.windup; a.attackTarget = target.id;
          a.cooldown = this.time + (a.faction === 'human' ? RULES.humanCooldown : RULES.zombieCooldown);
          this.events.push({ type: 'attack', time: this.time, actor: a.id, target: target.id });
        }
        return;
      }
    }
    while (a.path.length && dist(a, a.path[0]) < 0.4) a.path.shift();
    const waypoint = a.path[0]; if (!waypoint) return;
    const dx = waypoint.x - a.x, dz = waypoint.z - a.z, len = Math.hypot(dx, dz);
    const speed = a.faction === 'zombie' ? RULES.zombieSpeed : a.state === 'retreat' ? RULES.retreatSpeed : RULES.humanSpeed;
    let vx = dx / len * speed, vz = dz / len * speed;
    for (const b of this.spatial.near(a, 1.15)) {
      if (b.id === a.id) continue;
      const d = dist(a, b);
      if (d > 0.01 && d < 0.95) { const f = (0.95 - d) * 1.5 * MOVEMENT_SPEED_MULTIPLIER; vx += (a.x - b.x) / d * f; vz += (a.z - b.z) / d * f; }
    }
    const scale = Math.min(1, speed / Math.max(speed, Math.hypot(vx, vz)));
    const before = { x: a.x, z: a.z }, step = Math.min(RULES.step, len / speed);
    const next = { x: a.x + vx * step * scale, z: a.z + vz * step * scale };
    if (this.nav.clearPath(a, next)) { a.x = next.x; a.z = next.z; }
    else {
      // Navigation wins over avoidance when a narrow passage would otherwise trap an agent.
      const direct = { x: a.x + dx / len * speed * step, z: a.z + dz / len * speed * step };
      if (this.nav.clearPath(a, direct)) { a.x = direct.x; a.z = direct.z; }
      else { a.path = []; a.nextPath = 0; a.nextThink = 0; }
    }
    const moved = dist(a, before); a.distance += moved; a.moving = moved > 0.001;
    a.stuckFor = moved < 0.003 ? a.stuckFor + RULES.step : 0;
    if (a.stuckFor > 2.5) {
      // Yield sideways in a crowd. This uses local geometry, never hidden target positions.
      for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const direction = a.heading + angle * (a.id % 2 ? 1 : -1);
        const side = { x: a.x + Math.sin(direction) * 2, z: a.z + Math.cos(direction) * 2 };
        if (this.nav.clearPath(a, side)) { a.path = [side]; a.recoveryUntil = this.time + 3; break; }
      }
      a.stuckFor = 0;
    }
    if (a.moving) a.heading = Math.atan2(a.x - before.x, a.z - before.z);
  }
  step() {
    if (this.paused || this.outcome) return;
    this.time = ++this.tick * RULES.step;
    this.events.length = 0;
    for (const a of this.agents) {
      if (a.state === 'turning' && this.time >= a.turnAt) { a.hp = RULES.zombieHP; this.state(a, 'patrol'); a.nextThink = 0; }
    }
    this.spatial.rebuild(this.agents);
    for (const a of this.agents) if (active(a)) { if (this.time >= a.nextThink) this.think(a); this.move(a); }
    // Capture all strikes before changing health or allegiance: mutual hits are order-independent.
    const damage = new Map<number, number>();
    for (const a of this.agents) {
      if (!active(a) || a.strikeAt < 0 || this.time + 1e-8 < a.strikeAt) continue;
      const b = this.agents.find(candidate => candidate.id === a.attackTarget);
      a.strikeAt = -1; a.attackTarget = null;
      if (!b || !active(b) || b.faction === a.faction || dist(a, b) > RULES.melee + 0.3 || !this.nav.visible(a, b)) continue;
      damage.set(b.id, (damage.get(b.id) ?? 0) + (a.faction === 'human' ? RULES.humanDamage : RULES.zombieDamage));
      this.events.push({ type: 'hit', time: this.time, actor: a.id, target: b.id });
    }
    for (const a of this.agents) if (damage.has(a.id)) { a.hp = Math.max(0, a.hp - damage.get(a.id)!); a.hitAt = this.time; }
    for (const a of this.agents) if (active(a) && a.hp <= 0) {
      a.path = []; a.destination = null; a.target = null; a.lastKnown = null; a.strikeAt = -1; a.attackTarget = null; a.moving = false;
      if (a.faction === 'human') {
        a.faction = 'zombie'; this.state(a, 'turning'); a.turnAt = this.time + RULES.conversionSeconds; this.conversions++;
        this.events.push({ type: 'conversion', time: this.time, actor: a.id });
      } else { this.state(a, 'dead'); a.deathAt = this.time; this.events.push({ type: 'death', time: this.time, actor: a.id }); }
    }
    const c = this.counts;
    if (!c.humans || !c.zombies) {
      this.outcome = !c.humans && !c.zombies ? 'draw' : c.humans ? 'humans' : 'zombies';
      this.events.push({ type: 'complete', time: this.time, actor: -1, outcome: this.outcome });
    }
  }
}

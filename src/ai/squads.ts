import type { Simulation } from '../sim/simulation';
import { active } from '../sim/simulation';
import { dist } from '../sim/random';
import { RULES, type Agent, type Vec2 } from '../sim/types';
import { validResponse, type AssignedOrder, type DecisionResponse, type DecisionSnapshot, type Order, type Sighting, type Squad } from './types';

export class SquadDirector {
  squads: Squad[] = [];
  sightings = new Map<number, Sighting>();
  assignments = new Map<number, AssignedOrder>();
  private versions = new Map<number, number>();
  private appliedSequences = new Map<number, number>();
  private sequence = 0;
  private motion = new Map<number, { x: number; z: number; since: number }>();
  stationarySeconds(id: number) { return this.sim.time - (this.motion.get(id)?.since ?? this.sim.time); }
  constructor(readonly sim: Simulation) {}
  observe() {
    const humans = this.sim.agents.filter(a => a.faction === 'human' && active(a)).sort((a, b) => a.id - b.id);
    const byId = new Map(humans.map(a => [a.id, a]));
    const used = new Set<number>(), previous = new Map(this.squads.map(s => [s.id, s.members.join(',')]));
    const inherited = new Map(this.squads.flatMap(s => s.members.map(id => [id, this.assignments.get(s.id)] as const)));
    this.squads = this.squads.flatMap(s => {
      const leader = byId.get(s.id);
      if (!leader) return [];
      const members = s.members.filter(id => byId.has(id) && dist(leader, byId.get(id)!) <= 24);
      members.forEach(id => used.add(id));
      return [{ id: s.id, members }];
    });
    for (const human of humans) {
      if (used.has(human.id)) continue;
      const squad = this.squads.find(s => s.members.length < 5 && dist(human, byId.get(s.id)!) <= 16 && this.sim.nav.visible(human, byId.get(s.id)!));
      if (squad) squad.members.push(human.id);
      else this.squads.push({ id: human.id, members: [human.id] });
      used.add(human.id);
    }
    this.squads.sort((a, b) => a.id - b.id);
    // Nearby small squads can coalesce after a rendezvous, while full squads stay stable.
    for (let i = 0; i < this.squads.length; i++) for (let j = i + 1; j < this.squads.length; j++) {
      const a = this.squads[i], b = this.squads[j];
      if (a.members.length + b.members.length <= 5 && dist(byId.get(a.id)!, byId.get(b.id)!) <= 4 && this.sim.nav.visible(byId.get(a.id)!, byId.get(b.id)!)) {
        a.members.push(...b.members); this.squads.splice(j--, 1);
      }
    }
    for (const s of this.squads) s.members.sort((a, b) => a - b);
    for (const s of this.squads) {
      const leader = byId.get(s.id)!, prior = this.motion.get(s.id);
      if (!prior || dist(leader, prior) >= 1) this.motion.set(s.id, { x: leader.x, z: leader.z, since: this.sim.time });
    }
    for (const id of this.motion.keys()) if (!this.squads.some(s => s.id === id)) this.motion.delete(id);
    for (const s of this.squads) {
      if (previous.get(s.id) === s.members.join(',')) continue;
      this.versions.set(s.id, (this.versions.get(s.id) ?? 0) + 1);
      // Keep the surviving leader's task through a merge, split or casualty.
      const assignment = this.assignments.get(s.id) ?? inherited.get(s.id);
      if (assignment) {
        let order = assignment.order;
        // A completed rendezvous becomes a stable formation anchor, not a chase
        // between members of the newly merged squad.
        if (order.kind === 'regroup' && order.target !== undefined && s.members.includes(order.target)) {
          const anchor = byId.get(order.target)!;
          order = { ...order, target: undefined, destination: { x: anchor.x, z: anchor.z } };
        }
        this.assignments.set(s.id, { ...assignment, order });
      }
      for (const id of s.members) byId.get(id)!.nextThink = 0;
    }
    for (const id of this.assignments.keys()) if (!this.squads.some(s => s.id === id)) this.assignments.delete(id);
    for (const enemy of this.sim.agents) {
      if (enemy.faction === 'zombie' && humans.some(h => this.sim.canDetect(h, enemy)))
        this.sightings.set(enemy.id, { id: enemy.id, x: enemy.x, z: enemy.z, hp: enemy.hp, seenAt: this.sim.time });
    }
    for (const [id, sighting] of this.sightings) {
      const enemy = this.sim.agents.find(a => a.id === id);
      const seenDead = enemy?.state === 'dead' && humans.some(h => this.sim.canSee(h, enemy));
      if (this.sim.time - sighting.seenAt >= RULES.memorySeconds || seenDead) this.sightings.delete(id);
    }
  }
  snapshot(runId: string, selected?: number[]): DecisionSnapshot {
    this.observe();
    const decisionSquadIds = selected ?? this.squads.map(s => s.id);
    return { runId, tick: this.sim.tick, time: this.sim.time, sequence: ++this.sequence, decisionSquadIds,
      humans: this.sim.agents.filter(a => a.faction === 'human' && active(a)).map(({ id, x, z, hp }) => ({ id, x, z, hp })),
      sightings: [...this.sightings.values()].map(s => ({ ...s })),
      squads: this.squads.map(s => ({ ...s, version: this.versions.get(s.id)!, stationarySeconds: this.stationarySeconds(s.id), members: [...s.members], orders: decisionSquadIds.includes(s.id) ? this.candidates(s) : [{ id: 'hold', kind: 'hold' }], currentOrder: this.assignments.get(s.id)?.order })),
    };
  }
  candidates(squad: Squad): Order[] {
    const leader = this.sim.agents.find(a => a.id === squad.id)!;
    const orders: Order[] = [{ id: 'hold', kind: 'hold' }];
    const addPoint = (kind: 'advance' | 'retreat', p: Vec2, id: number) => {
      const destination = this.sim.nav.nearest(p);
      if (dist(leader, destination) > 3 && this.sim.nav.path(leader, destination).length) orders.push({ id: `${kind}_${id}`, kind, destination });
    };
    this.squads.filter(s => s.id !== squad.id && s.members.length + squad.members.length <= 5).map(s => this.sim.agents.find(a => a.id === s.id)!)
      .filter(a => dist(leader, a) > 4)
      .sort((a, b) => dist(leader, a) - dist(leader, b) || a.id - b.id).slice(0, 3)
      .forEach(a => orders.push({ id: `regroup_${a.id}`, kind: 'regroup', target: a.id, destination: { x: a.x, z: a.z } }));
    const sightings = [...this.sightings.values()];
    sightings.filter(s => s.seenAt === this.sim.time).sort((a, b) => dist(leader, a) - dist(leader, b) || a.id - b.id).slice(0, 5)
      .forEach(s => orders.push({ id: `attack_${s.id}`, kind: 'attack', target: s.id, destination: { x: s.x, z: s.z } }));
    sightings.filter(s => s.seenAt < this.sim.time).sort((a, b) => b.seenAt - a.seenAt || a.id - b.id).slice(0, 3)
      .forEach(s => orders.push({ id: `search_${s.id}`, kind: 'search', target: s.id, destination: { x: s.x, z: s.z } }));
    for (let i = 0; i < 4; i++) addPoint('retreat', { x: leader.x + Math.sin(i * Math.PI / 2) * 14, z: leader.z + Math.cos(i * Math.PI / 2) * 14 }, i);
    [...this.sim.world.patrol].filter(p => dist(leader, p) > 3).sort((a, b) => dist(leader, a) - dist(leader, b)).slice(0, 3).forEach((p, i) => addPoint('advance', p, i));
    // Once idle for three seconds, ask Jev to choose a movement task. Keep hold
    // available in immediate melee or when navigation offers no alternative.
    const inContact = squad.members.some(id => {
      const human = this.sim.agents.find(a => a.id === id)!;
      return this.sim.agents.some(enemy => dist(human, enemy) <= RULES.melee && this.sim.canDetect(human, enemy));
    });
    const current = this.instruction(leader);
    const continuingMovement = current?.destination !== undefined && dist(leader, current.destination) > (current.kind === 'regroup' ? 3 : 1);
    return (continuingMovement || this.stationarySeconds(squad.id) >= 3) && !inContact && orders.length > 1 ? orders.filter(o => o.kind !== 'hold') : orders;
  }
  apply(snapshot: DecisionSnapshot, response: DecisionResponse) {
    if (!validResponse(response, snapshot) || this.sim.time - snapshot.time > 8) return [];
    const applied: number[] = [];
    for (const decision of response.decisions) {
      const old = snapshot.squads.find(s => s.id === decision.squadId)!;
      const squad = this.squads.find(s => s.id === decision.squadId);
      if (!squad || old.version !== this.versions.get(squad.id) || snapshot.sequence <= (this.appliedSequences.get(squad.id) ?? 0)) continue;
      const order = old.orders.find(o => o.id === decision.orderId)!;
      if (!this.orderValid(order)) continue;
      const previous = this.assignments.get(squad.id)?.order;
      // A renewed identical order must take control back from local fallback.
      for (const a of this.sim.agents) if (squad.members.includes(a.id) && !this.instruction(a)) a.nextThink = 0;
      this.assignments.set(decision.squadId, { order, issuedAt: this.sim.time, confidence: decision.confidence });
      this.appliedSequences.set(squad.id, snapshot.sequence);
      applied.push(squad.id);
      // Reaffirming the same order must not interrupt routes or stuck recovery.
      const sameTask = previous?.kind === order.kind && (order.target !== undefined
        ? previous.target === order.target
        : previous.target === undefined && JSON.stringify(previous.destination) === JSON.stringify(order.destination));
      if (!sameTask) for (const a of this.sim.agents) if (squad.members.includes(a.id)) { a.nextThink = 0; a.nextPath = 0; a.recoveryUntil = 0; }
    }
    return applied;
  }
  orderValid(order: Order) {
    if (order.kind === 'attack' || order.kind === 'search') return this.sightings.has(order.target!);
    if (order.kind === 'regroup') return order.target === undefined || this.sim.agents.some(a => a.id === order.target && a.faction === 'human' && active(a));
    return true;
  }
  inspect(id: number) {
    const squad = this.squads.find(s => s.members.includes(id));
    return squad ? { squad, assignment: this.assignments.get(squad.id) } : undefined;
  }
  instruction(a: Agent): Order | undefined {
    const info = this.inspect(a.id), order = info?.assignment?.order;
    if (!order) return undefined;
    let destination = order.destination;
    if (order.kind === 'attack' || order.kind === 'search') {
      const sighting = this.sightings.get(order.target!);
      if (!sighting) return undefined;
      destination = { x: sighting.x, z: sighting.z };
    }
    if (order.kind === 'regroup' && order.target !== undefined) {
      const ally = this.sim.agents.find(b => b.id === order.target && b.faction === 'human' && active(b));
      if (!ally) return undefined;
      destination = { x: ally.x, z: ally.z };
    }
    if (destination && order.kind !== 'attack') {
      const slot = info!.squad.members.indexOf(a.id);
      destination = this.sim.nav.nearest({ x: destination.x + Math.sin(slot * 2.4) * (slot ? 2 : 0), z: destination.z + Math.cos(slot * 2.4) * (slot ? 2 : 0) });
    }
    return { ...order, destination };
  }
}

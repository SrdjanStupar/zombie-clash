import { afterEach, describe, expect, it, vi } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { RULES, type World } from '../src/sim/types';
import { SquadDirector } from '../src/ai/squads';
import { JevController, type Provider } from '../src/ai/controller';
import { validResponse, type DecisionResponse, type DecisionSnapshot, type OrderKind } from '../src/ai/types';
import { questionsFor, stateFor, publicJevError, validSnapshot } from '../server/jev';
import { evaluate } from '../server/jev';
import { TypeSafeClient } from '@typesafe-ai/sdk';

const world = (): World => ({ size: 180, seed: 1, obstacles: [], patrol: [{ x: 20, z: 20 }, { x: -20, z: 20 }, { x: 20, z: -20 }] });
function fixture() {
  const sim = new Simulation(1, world(), 0);
  for (const [id, x, z, faction] of [[0, 0, 0, 'human'], [1, 3, 0, 'human'], [2, 35, 0, 'human'], [3, 0, 12, 'zombie']] as const) {
    const a = sim.makeAgent(id, faction, { x, z }); a.heading = 0; a.nextThink = Infinity; sim.agents.push(a);
  }
  sim.spatial.rebuild(sim.agents);
  return sim;
}
const answer = (s: DecisionSnapshot, kind: OrderKind = 'hold'): DecisionResponse => ({ runId: s.runId, tick: s.tick, decisions: s.squads.filter(squad => s.decisionSquadIds.includes(squad.id)).map(squad => ({ squadId: squad.id, orderId: (squad.orders.find(o => o.kind === kind) ?? squad.orders[0]).id, confidence: .8 })) });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('squad perception and orders', () => {
  it('forms bounded squads, preserves membership, merges rendezvous and removes conversions', () => {
    const sim = fixture(), director = new SquadDirector(sim);
    director.observe(); expect(director.squads.map(s => s.members)).toEqual([[0, 1], [2]]);
    sim.agents[1].x = 20; director.observe(); expect(director.squads[0].members).toEqual([0, 1]);
    sim.agents[2].x = 2; director.observe(); expect(director.squads[0].members).toEqual([0, 1, 2]);
    sim.agents[1].faction = 'zombie'; sim.agents[1].state = 'turning'; director.observe();
    expect(director.squads[0].members).toEqual([0, 2]);
    const full = new Simulation(); const all = new SquadDirector(full); all.observe();
    expect(all.squads.every(s => s.members.length <= 5)).toBe(true);
    expect(new Set(all.squads.flatMap(s => s.members)).size).toBe(50);
  });
  it('shares only observed positions, keeps memory without tracking hidden movement, and expires it', () => {
    const sim = fixture(), director = new SquadDirector(sim);
    let snapshot = director.snapshot('run'); expect(snapshot.sightings[0].z).toBe(12);
    sim.agents[3].z = 70; sim.time = 1;
    snapshot = director.snapshot('run'); expect(snapshot.sightings[0].z).toBe(12);
    expect(snapshot.squads[1].orders.some(o => o.kind === 'search')).toBe(true);
    sim.time = 9; expect(director.snapshot('run').sightings).toEqual([]);
  });
  it('does not reveal unseen zombies through walls', () => {
    const sim = fixture(); sim.agents[3].z = -12;
    expect(new SquadDirector(sim).snapshot('run').sightings).toEqual([]);
    const w = world(); w.obstacles.push({ x: 0, z: 6, w: 20, d: 3, height: 6, kind: 'building', variant: 0, angle: 0 });
    const blocked = new Simulation(1, w, 0);
    blocked.agents.push(blocked.makeAgent(0, 'human', { x: 0, z: 0 }), blocked.makeAgent(1, 'zombie', { x: 0, z: 12 }));
    blocked.agents[0].heading = 0;
    expect(new SquadDirector(blocked).snapshot('run').sightings).toEqual([]);
  });
  it.each(['hold', 'regroup', 'retreat', 'attack', 'advance', 'search'] as const)('executes %s without procedural tactical overrides', kind => {
    const sim = fixture(), director = new SquadDirector(sim); sim.humanDirector = director;
    director.observe();
    if (kind === 'search') { sim.agents[3].z = 70; sim.time = 1; sim.tick = 20; }
    const snapshot = director.snapshot('run'); director.apply(snapshot, answer(snapshot, kind));
    const initial = { x: sim.agents[0].x, z: sim.agents[0].z };
    sim.step();
    expect(sim.agents[0].state).toBe({ hold: 'hold', regroup: 'regroup', retreat: 'retreat', attack: 'pursue', advance: 'patrol', search: 'search' }[kind]);
    if (kind === 'hold') expect({ x: sim.agents[0].x, z: sim.agents[0].z }).toEqual(initial);
    else expect(sim.agents[0].moving).toBe(true);
  });
  it('defends in melee while holding and preserves windup and damage', () => {
    const sim = fixture(); sim.agents[3].z = 1.5;
    const director = new SquadDirector(sim); sim.humanDirector = director;
    const snapshot = director.snapshot('run'); director.apply(snapshot, answer(snapshot));
    sim.step(); expect(sim.agents[3].hp).toBe(100); expect(sim.agents[0].strikeAt).toBeGreaterThan(sim.time);
    for (let i = 0; i < 11; i++) sim.step();
    expect(sim.agents[3].hp).toBe(100 - RULES.humanDamage);
  });
  it('releases an invalidated target and rejects changed membership', () => {
    const sim = fixture(), director = new SquadDirector(sim), snapshot = director.snapshot('run');
    director.apply(snapshot, answer(snapshot, 'attack')); director.sightings.clear();
    expect(director.instruction(sim.agents[0])).toBeUndefined();
    sim.agents[1].faction = 'zombie'; sim.agents[1].state = 'turning'; director.observe();
    expect(director.apply(snapshot, answer(snapshot))).toEqual([]);
  });
});

describe('Jev request lifecycle', () => {
  it('advances time and keeps moving during slow refreshes and initial connection', async () => {
    vi.useFakeTimers();
    const sim = fixture(); let resolve!: (r: unknown) => void;
    const provider = vi.fn<Provider>().mockImplementationOnce(async s => answer(s, 'advance')).mockImplementation(() => new Promise(r => { resolve = r; }));
    const c = new JevController(sim, provider);
    expect(sim.paused).toBe(false); c.update(); await flush();
    sim.time = 7; sim.tick = 140; await vi.advanceTimersByTimeAsync(300); c.update();
    expect(provider).toHaveBeenCalledTimes(2);
    const before = { ...sim.agents[2] };
    for (let i = 0; i < 25; i++) { c.update(); sim.advance(.2); }
    expect(sim.time).toBeCloseTo(12); expect(sim.paused).toBe(false);
    expect(Math.hypot(sim.agents[2].x - before.x, sim.agents[2].z - before.z)).toBeGreaterThan(1);
    expect(provider).toHaveBeenCalledTimes(2);
    resolve(answer(provider.mock.calls[1][0])); await flush(); c.dispose();
    const initial = fixture(), waiting = new JevController(initial, () => new Promise(() => {}));
    waiting.update(); initial.advance(.2); expect(initial.time).toBeGreaterThan(0); expect(initial.agents[0].state).not.toBe('hold'); expect(initial.agents[0].moving).toBe(true); waiting.dispose();
  });
  it('backs off failures while running and keeps manual pause independent of retry', async () => {
    vi.useFakeTimers(); const sim = fixture();
    const provider = vi.fn<Provider>().mockRejectedValueOnce(new Error('Offline')).mockImplementation(async s => answer(s));
    const c = new JevController(sim, provider); c.update(); await flush();
    expect(c.error).toBe('Offline'); expect(sim.paused).toBe(false);
    sim.advance(.2); c.update(); expect(provider).toHaveBeenCalledTimes(1);
    sim.time = 1; await vi.advanceTimersByTimeAsync(1000); c.update(); await flush();
    expect(provider).toHaveBeenCalledTimes(2); expect(c.error).toBe('');
    c.togglePause(); expect(sim.paused).toBe(true); c.retry(); await flush(); expect(sim.paused).toBe(true);
    c.togglePause(); expect(sim.paused).toBe(false); c.dispose();
  });
  it('times out without freezing even if the provider ignores cancellation', async () => {
    vi.useFakeTimers(); const sim = fixture(), c = new JevController(sim, () => new Promise(() => {}));
    c.update(); await vi.advanceTimersByTimeAsync(10_000);
    expect(c.error).toContain('timed out'); expect(sim.paused).toBe(false); c.dispose();
  });
  it('discards late responses after hiding, pausing, disposal, and completion', async () => {
    for (const action of ['hide', 'pause', 'dispose', 'complete']) {
      const sim = fixture(); let resolve!: (r: unknown) => void; let snapshot!: DecisionSnapshot;
      const c = new JevController(sim, s => { snapshot = s; return new Promise(r => { resolve = r; }); }); c.update();
      if (action === 'hide') c.update(true);
      if (action === 'pause') c.togglePause();
      if (action === 'dispose') c.dispose();
      if (action === 'complete') sim.outcome = 'humans';
      resolve(answer(snapshot)); await flush(); expect(c.director.assignments.size).toBe(0); c.dispose();
    }
  });
  it('rejects invalid answers without pausing', async () => {
    const sim = fixture(), c = new JevController(sim, async s => ({ ...answer(s), runId: 'old-run' }));
    c.update(); await flush(); expect(c.error).toContain('invalid'); expect(sim.paused).toBe(false); c.dispose();
  });
  it('refreshes every squad each second without an artificial dispatch delay', async () => {
    const sim = new Simulation(), provider = vi.fn<Provider>().mockImplementation(async s => answer(s));
    const c = new JevController(sim, provider); c.update(); await flush();
    const total = c.director.squads.length, batches = Math.ceil(total / 13);
    expect(provider).toHaveBeenCalledTimes(batches);
    expect(provider.mock.calls.flatMap(([s]) => s.decisionSquadIds)).toHaveLength(total);
    sim.time = .99; c.update(); expect(provider).toHaveBeenCalledTimes(batches);
    sim.time = 1; c.update(); await flush(); expect(provider).toHaveBeenCalledTimes(batches * 2);
    expect(provider.mock.calls.every(([s]) => s.decisionSquadIds.length <= 13)).toBe(true); c.dispose();
  });
  it('lets other squads refresh while one batch is slow, with no duplicate in-flight squads', async () => {
    const sim = new Simulation(); const resolvers: ((r: unknown) => void)[] = [];
    const provider = vi.fn<Provider>().mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const c = new JevController(sim, provider); c.update();
    const batches = provider.mock.calls.length;
    expect(batches).toBeGreaterThan(1); expect(c.inFlight).toBeLessThanOrEqual(4);
    const slow = new Set(provider.mock.calls[0][0].decisionSquadIds);
    sim.time = 1; c.update(); expect(provider).toHaveBeenCalledTimes(batches);
    resolvers[1](answer(provider.mock.calls[1][0])); await flush(); c.update();
    expect(provider).toHaveBeenCalledTimes(batches + 1);
    expect(provider.mock.calls[batches][0].decisionSquadIds.every(id => !slow.has(id))).toBe(true);
    expect(c.inFlight).toBeLessThanOrEqual(4); c.dispose();
  });
  it('keeps one batch error visible when another batch succeeds', async () => {
    const sim = new Simulation();
    const provider = vi.fn<Provider>().mockRejectedValueOnce(new Error('Offline')).mockImplementation(async s => answer(s));
    const c = new JevController(sim, provider); c.update(); await flush();
    expect(c.error).toBe('Offline'); expect(c.status).toBe('reconnecting'); expect(sim.paused).toBe(false); c.dispose();
  });
});
describe('asynchronous squad orders', () => {
  it('keeps humans active across the opening population when Jev never responds', () => {
    vi.useFakeTimers();
    const sim = new Simulation(42), c = new JevController(sim, () => new Promise(() => {}));
    for (let i = 0; i < 200; i++) { c.update(); sim.advance(.05); }
    expect(sim.time).toBeCloseTo(10);
    const humans = sim.agents.filter(a => a.id < 50);
    expect(humans.filter(a => a.distance > 3).length).toBeGreaterThan(35);
    expect(humans.filter(a => a.faction === 'human' && a.state === 'hold')).toHaveLength(0);
    c.dispose();
  });
  it('retains Jev orders after arrival and through long waits without local takeover', () => {
    const sim = fixture(), d = new SquadDirector(sim); sim.humanDirector = d;
    let snapshot = d.snapshot('run'); d.apply(snapshot, answer(snapshot, 'advance'));
    const goal = d.assignments.get(2)!.order.destination!;
    sim.agents[2].x = goal.x; sim.agents[2].z = goal.z;
    expect(d.instruction(sim.agents[2])?.kind).toBe('advance');
    sim.step(); expect(sim.agents[2].moving).toBe(false);
    snapshot = d.snapshot('run'); d.apply(snapshot, answer(snapshot));
    sim.time += 10;
    expect(d.instruction(sim.agents[2])?.kind).toBe('hold');
    snapshot = d.snapshot('run'); d.apply(snapshot, answer(snapshot, 'advance'));
    expect(d.instruction(sim.agents[2])?.kind).toBe('advance');
  });
  it('inherits the previous task after a split and anchors regrouping after a merge', () => {
    const sim = fixture(), d = new SquadDirector(sim);
    let snapshot = d.snapshot('run'); d.apply(snapshot, answer(snapshot, 'advance'));
    const previous = d.assignments.get(0)!.order;
    sim.agents[1].x = -30; d.observe();
    expect(d.assignments.get(1)!.order).toEqual(previous);
    sim.agents[1].x = 3; d.observe();
    snapshot = d.snapshot('run'); d.apply(snapshot, answer(snapshot, 'regroup'));
    sim.agents[2].x = 2; d.observe();
    expect(d.squads).toHaveLength(1);
    expect(d.assignments.get(0)!.order.kind).toBe('regroup');
    expect(d.assignments.get(0)!.order.target).toBeUndefined();
    expect(d.instruction(sim.agents[0])?.kind).toBe('regroup');
  });  it('preserves unaffected paths and accepts unaffected answers after membership changes', () => {
    const sim = fixture(), d = new SquadDirector(sim), initial = d.snapshot('run');
    d.apply(initial, answer(initial, 'advance'));
    const path = [{ x: 40, z: 20 }]; sim.agents[2].path = path; sim.agents[2].nextThink = 42;
    const pending = d.snapshot('run');
    sim.agents[1].faction = 'zombie'; sim.agents[1].state = 'turning'; d.observe();
    expect(d.assignments.has(0)).toBe(true); expect(d.assignments.has(2)).toBe(true); expect(sim.agents[2].path).toBe(path);
    expect(d.apply(pending, answer(pending, 'advance'))).toEqual([2]); expect(sim.agents[2].nextThink).toBe(42);
  });
  it('rejects old sequences, stale snapshots, and invalid targets independently', () => {
    const sim = fixture(), d = new SquadDirector(sim), old = d.snapshot('run'), fresh = d.snapshot('run');
    expect(d.apply(fresh, answer(fresh))).toEqual([0, 2]); expect(d.apply(old, answer(old, 'advance'))).toEqual([]);
    const expired = d.snapshot('run'); sim.time = 9; expect(d.apply(expired, answer(expired))).toEqual([]);
    sim.time = 0; const invalid = d.snapshot('run'); d.sightings.clear(); expect(d.apply(invalid, answer(invalid, 'attack'))).toEqual([]);
  });
  it('rejects a response even when changed membership returns to its original shape', () => {
    const sim = fixture(), d = new SquadDirector(sim), old = d.snapshot('run');
    sim.agents[1].x = 60; d.observe(); sim.agents[1].x = 3; d.observe();
    expect(d.apply(old, answer(old))).not.toContain(0);
  });
});
describe('API contract', () => {
  it('keeps shared context but only asks for and accepts selected squads', async () => {
    const d = new SquadDirector(fixture()), snapshot = d.snapshot('run', [2]);
    expect(validSnapshot(snapshot)).toBe(true);
    expect(snapshot.squads).toHaveLength(2); expect(stateFor(snapshot).squads).toHaveLength(2);
    expect(Object.keys(questionsFor(snapshot))).toEqual(['2']);
    expect(validResponse(answer(snapshot), snapshot)).toBe(true);
    expect(validResponse({ ...answer(snapshot), decisions: [{ squadId: 0, orderId: 'hold', confidence: .8 }] }, snapshot)).toBe(false);
    expect(validSnapshot({ ...snapshot, decisionSquadIds: [99] })).toBe(false);
    expect(validSnapshot({ ...snapshot, decisionSquadIds: [2, 2] })).toBe(false);
    const client = new TypeSafeClient({ apiKey: 'test-only', retry: { maxRetries: 0 }, logLevel: 'off', fetch: async () => new Response(JSON.stringify({ model: 'test', answers: { '2': { type: 'choice', choice: 'hold', confidence: .8, probabilities: { hold: 1 } } }, usage: { input_tokens: 100, output_tokens: 1 } })) });
    expect((await evaluate(snapshot, client, new AbortController().signal)).decisions.map(d => d.squadId)).toEqual([2]);
  });
  it('keeps the full opening population compact without duplicating candidate lists in state', () => {
    const snapshot = new SquadDirector(new Simulation()).snapshot('full-game');
    const state = stateFor(snapshot), questions = questionsFor(snapshot);
    expect(snapshot.squads.length).toBeGreaterThan(30);
    expect(JSON.stringify(state).length).toBeLessThan(5000);
    expect(JSON.stringify({ state, questions }).length).toBeLessThan(36000);
    expect(state.humans).toHaveLength(50); expect(state.sightings).toHaveLength(snapshot.sightings.length);
    for (const squad of snapshot.squads) expect(Object.keys(questions[String(squad.id)].criteria)).toEqual(squad.orders.map(o => o.id));
    expect(JSON.stringify(state)).not.toContain('orders":');
  });
  it('exposes actionable allowlisted error messages without forwarding upstream secrets', () => {
    expect(publicJevError({ status: 400, message: 'max_tokens_exceeded private-details' })).toContain('oversized');
    expect(publicJevError({ name: 'APIConnectionError', message: 'private-details' })).toContain('network access');
    expect(publicJevError({ status: 401, message: 'private-details' })).not.toContain('private-details');
    expect(publicJevError(new Error('private-details'))).not.toContain('private-details');
  });
  it('uses the real SDK with a mocked transport and maps typed decisions and usage', async () => {
    const snapshot = new SquadDirector(fixture()).snapshot('run');
    const transport = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(Object.keys(payload.questions)).toHaveLength(snapshot.squads.length);
      return new Response(JSON.stringify({ model: 'test', answers: Object.fromEntries(snapshot.squads.map(s => [String(s.id), { type: 'choice', choice: 'hold', confidence: .8, probabilities: { hold: 1 } }])), usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const client = new TypeSafeClient({ apiKey: 'test-only', fetch: transport, retry: { maxRetries: 0 }, logLevel: 'off' });
    const response = await evaluate(snapshot, client, new AbortController().signal);
    expect(validResponse(response, snapshot)).toBe(true); expect(response.tokens).toBe(120); expect(transport).toHaveBeenCalledTimes(1);
  });
  it('validates real snapshots and rejects malformed or excessive input', () => {
    const s = new SquadDirector(fixture()).snapshot('run'); expect(validSnapshot(s)).toBe(true);
    expect(validSnapshot(null)).toBe(false); expect(validSnapshot({ ...s, humans: Array(51).fill(s.humans[0]) })).toBe(false);
    expect(validSnapshot({ ...s, squads: [null] })).toBe(false);
    expect(validSnapshot({ ...s, sightings: [{ id: 5, x: Infinity, z: 0, hp: 100, seenAt: 0 }] })).toBe(false);
    expect(Object.keys(questionsFor(s))).toHaveLength(s.squads.length);
    expect(validResponse(answer(s), s)).toBe(true);
    const r = answer(s); r.decisions[0].orderId = 'invented'; expect(validResponse(r, s)).toBe(false);
    expect(validResponse({ ...answer(s), decisions: [null] }, s)).toBe(false);
  });
});

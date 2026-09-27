import type { Simulation } from '../sim/simulation';
import { SquadDirector } from './squads';
import { JEV_MAX_CONCURRENT, validResponse, type DecisionSnapshot } from './types';

export type Provider = (snapshot: DecisionSnapshot, signal: AbortSignal) => Promise<unknown>;
export const fetchDecisions: Provider = async (snapshot, signal) => {
  const response = await fetch('/api/jev/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot), signal });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Jev is unavailable. Try again.');
  return body;
};

export const JEV_SCHEDULE = { batchSize: 13, interval: 1, maxConcurrent: JEV_MAX_CONCURRENT };
interface Schedule { nextAt: number; retryAt: number; failures: number; error: string }

export class JevController {
  director: SquadDirector;
  runId = crypto.randomUUID();
  manualPaused = false;
  hidden = false;
  error = '';
  status: 'connecting' | 'active' | 'waiting' | 'reconnecting' | 'paused' = 'connecting';
  latencyMs = 0;
  queueWaitMs = 0;
  tokens = 0;
  requests = 0;
  discarded = 0;
  private schedules = new Map<number, Schedule>();
  private pending = new Map<AbortController, number[]>();
  private disposed = false;
  constructor(readonly sim: Simulation, private provider: Provider = fetchDecisions) {
    this.director = new SquadDirector(sim);
    sim.humanDirector = this.director;
    this.syncPause();
  }
  get inFlight() { return this.pending.size; }
  private get busySquads() { return new Set([...this.pending.values()].flat()); }
  get queued() { const busy = this.busySquads; return [...this.schedules].filter(([id, s]) => !busy.has(id) && s.nextAt <= this.sim.time + 1e-9).length; }
  private syncPause() { this.sim.paused = this.manualPaused || this.hidden; }
  private schedule() {
    for (const id of this.schedules.keys()) if (!this.director.squads.some(s => s.id === id)) this.schedules.delete(id);
    for (const squad of this.director.squads) if (!this.schedules.has(squad.id)) this.schedules.set(squad.id, { nextAt: this.sim.time, retryAt: 0, failures: 0, error: '' });
  }
  private refreshStatus() {
    this.error = [...this.schedules.values()].find(s => s.error)?.error ?? '';
    this.status = this.manualPaused || this.hidden || this.sim.outcome ? 'paused' : this.error ? 'reconnecting' : this.pending.size ? (this.director.assignments.size ? 'waiting' : 'connecting') : 'active';
  }
  update(hidden = false) {
    if (this.disposed) return;
    this.hidden = hidden; this.syncPause();
    if (hidden || this.manualPaused || this.sim.outcome) { this.cancel(); this.refreshStatus(); return; }
    this.director.observe(); this.schedule(); this.dispatch();
  }
  togglePause() { this.manualPaused = !this.manualPaused; this.update(this.hidden); }
  retry() {
    if (this.disposed || this.hidden || this.sim.outcome) return;
    this.director.observe(); this.schedule();
    for (const s of this.schedules.values()) { s.nextAt = this.sim.time; s.retryAt = 0; }
    this.dispatch(); // An explicit retry never resumes a manual pause.
  }
  private cancel() {
    for (const [controller, ids] of this.pending) {
      controller.abort();
      for (const id of ids) { const s = this.schedules.get(id); if (s) s.nextAt = this.sim.time; }
    }
    this.pending.clear();
  }
  dispose() { this.disposed = true; this.cancel(); }
  private dispatch() {
    while (this.pending.size < JEV_SCHEDULE.maxConcurrent) {
      const busy = this.busySquads;
      const selected = [...this.schedules].filter(([id, s]) => !busy.has(id) && s.nextAt <= this.sim.time + 1e-9 && performance.now() >= s.retryAt)
        .sort((a, b) => a[1].nextAt - b[1].nextAt || a[0] - b[0]).slice(0, JEV_SCHEDULE.batchSize);
      if (!selected.length) break;
      void this.request(selected);
    }
    this.refreshStatus();
  }
  private async request(selected: [number, Schedule][]) {
    const snapshot = this.director.snapshot(this.runId, selected.map(([id]) => id)), controller = new AbortController();
    this.queueWaitMs = Math.max(...selected.map(([, s]) => Math.max(0, this.sim.time - s.nextAt) * 1000));
    for (const [, s] of selected) s.nextAt = this.sim.time + JEV_SCHEDULE.interval;
    this.pending.set(controller, snapshot.decisionSquadIds); this.requests++;
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error('Jev timed out. Reconnecting…')); controller.abort(); }, 10_000);
      });
      const response = await Promise.race([this.provider(snapshot, controller.signal), deadline]);
      if (this.disposed || !this.pending.has(controller) || this.sim.outcome || this.hidden) return;
      if (!validResponse(response, snapshot)) throw new Error('Jev returned invalid orders. Reconnecting…');
      this.director.observe();
      const applied = this.director.apply(snapshot, response);
      this.discarded += response.decisions.length - applied.length;
      this.latencyMs = performance.now() - started; this.tokens += response.tokens ?? 0;
      for (const [, s] of selected) { s.failures = 0; s.retryAt = 0; s.error = ''; }
    } catch (error) {
      if (this.disposed || !this.pending.has(controller)) return;
      for (const [, s] of selected) {
        s.error = error instanceof Error ? error.message : 'Jev is unavailable. Reconnecting…';
        s.retryAt = performance.now() + Math.min(30_000, 1000 * 2 ** Math.min(s.failures++, 5));
      }
    } finally {
      clearTimeout(timer);
      this.pending.delete(controller);
      if (!this.disposed) { this.syncPause(); this.refreshStatus(); }
    }
  }
}

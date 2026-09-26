import type { Agent, Vec2 } from './types';
export class SpatialIndex {
  private buckets = new Map<string, Agent[]>();
  readonly cell = 12;
  rebuild(agents: Agent[]) {
    this.buckets.clear();
    for (const a of agents) {
      if (a.state === 'dead' || a.state === 'turning') continue;
      const key = `${Math.floor(a.x / this.cell)},${Math.floor(a.z / this.cell)}`;
      const bucket = this.buckets.get(key); if (bucket) bucket.push(a); else this.buckets.set(key, [a]);
    }
  }
  near(p: Vec2, radius: number): Agent[] {
    const list: Agent[] = [];
    for (let z = Math.floor((p.z - radius) / this.cell); z <= Math.floor((p.z + radius) / this.cell); z++) for (let x = Math.floor((p.x - radius) / this.cell); x <= Math.floor((p.x + radius) / this.cell); x++) {
      for (const a of this.buckets.get(`${x},${z}`) ?? []) if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 <= radius ** 2) list.push(a);
    }
    return list;
  }
}

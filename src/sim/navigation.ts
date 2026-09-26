import type { Vec2, World } from './types';

class Heap {
  values: { id: number; f: number }[] = [];
  push(id: number, f: number) {
    const v = { id, f }; let i = this.values.length; this.values.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (this.values[p].f <= f) break; this.values[i] = this.values[p]; i = p; }
    this.values[i] = v;
  }
  pop() {
    const root = this.values[0], last = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.values.length && this.values[c + 1].f < this.values[c].f) c++;
        if (this.values[c].f >= last.f) break;
        this.values[i] = this.values[c]; i = c;
      }
      this.values[i] = last;
    }
    return root.id;
  }
}

export class Navigation {
  readonly cell = 1.5;
  readonly n: number;
  readonly half: number;
  readonly blocked: Uint8Array;
  readonly reachable: number[] = [];
  private component: Uint8Array;
  constructor(readonly world: World) {
    this.n = Math.ceil(world.size / this.cell); this.half = world.size / 2;
    this.blocked = new Uint8Array(this.n * this.n);
    this.component = new Uint8Array(this.n * this.n);
    for (let i = 0; i < this.blocked.length; i++) {
      const p = this.point(i);
      this.blocked[i] = Number(Math.abs(p.x) > this.half - 2 || Math.abs(p.z) > this.half - 2 || world.obstacles.some(o => Math.abs(p.x - o.x) < o.w / 2 + 0.75 && Math.abs(p.z - o.z) < o.d / 2 + 0.75));
    }
    // Retain only the largest connected component for all spawn and route endpoints.
    const seen = new Uint8Array(this.blocked.length); let largest: number[] = [];
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || this.blocked[start]) continue;
      const q = [start]; seen[start] = 1;
      for (let j = 0; j < q.length; j++) for (const next of this.neighbors(q[j])) if (!seen[next]) { seen[next] = 1; q.push(next); }
      if (q.length > largest.length) largest = q;
    }
    this.reachable = largest;
    for (const id of largest) this.component[id] = 1;
  }
  point(id: number): Vec2 { return { x: (id % this.n + 0.5) * this.cell - this.half, z: (Math.floor(id / this.n) + 0.5) * this.cell - this.half }; }
  index(p: Vec2) { return Math.min(this.n - 1, Math.max(0, Math.floor((p.z + this.half) / this.cell))) * this.n + Math.min(this.n - 1, Math.max(0, Math.floor((p.x + this.half) / this.cell))); }
  walkable(p: Vec2) { return Math.abs(p.x) < this.half - 2 && Math.abs(p.z) < this.half - 2 && this.component[this.index(p)] === 1; }
  nearest(p: Vec2): Vec2 {
    if (this.walkable(p)) return this.point(this.index(p));
    let best = this.reachable[0], score = Infinity;
    for (const id of this.reachable) { const q = this.point(id), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < score) { best = id; score = d; } }
    return this.point(best);
  }
  private neighbors(id: number) {
    const x = id % this.n, z = Math.floor(id / this.n), list: number[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || z + dz < 0 || x + dx >= this.n || z + dz >= this.n) continue;
      const next = id + dz * this.n + dx;
      if (this.blocked[next] || (dx && dz && (this.blocked[id + dx] || this.blocked[id + dz * this.n]))) continue;
      list.push(next);
    }
    return list;
  }
  clearPath(a: Vec2, b: Vec2): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell * 0.35));
    for (let i = 0; i <= steps; i++) { const t = steps ? i / steps : 0; if (!this.walkable({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false; }
    return true;
  }
  path(from: Vec2, to: Vec2): Vec2[] {
    const a = this.nearest(from), b = this.nearest(to);
    if (this.clearPath(from, b)) return [b];
    const start = this.index(a), end = this.index(b), total = this.n * this.n;
    const g = new Float32Array(total).fill(Infinity), parent = new Int32Array(total).fill(-1), closed = new Uint8Array(total);
    const heap = new Heap(); g[start] = 0; heap.push(start, 0);
    while (heap.values.length) {
      const current = heap.pop(); if (closed[current]) continue;
      if (current === end) {
        const route: Vec2[] = []; let cursor = end;
        while (cursor !== start) { route.push(this.point(cursor)); cursor = parent[cursor]; }
        route.reverse();
        const smooth: Vec2[] = []; let anchor = from;
        for (let i = 0; i < route.length;) { let j = i; while (j + 1 < route.length && this.clearPath(anchor, route[j + 1])) j++; smooth.push(route[j]); anchor = route[j]; i = j + 1; }
        return smooth;
      }
      closed[current] = 1;
      for (const next of this.neighbors(current)) {
        if (closed[next]) continue;
        const diagonal = next % this.n !== current % this.n && Math.floor(next / this.n) !== Math.floor(current / this.n);
        const score = g[current] + (diagonal ? 1.414214 : 1);
        if (score >= g[next]) continue;
        g[next] = score; parent[next] = current;
        const dx = Math.abs(next % this.n - end % this.n), dz = Math.abs(Math.floor(next / this.n) - Math.floor(end / this.n));
        heap.push(next, score + Math.max(dx, dz) + 0.414214 * Math.min(dx, dz));
      }
    }
    return [];
  }
  visible(a: Vec2, b: Vec2) {
    // Segment–rectangle slabs: buildings, wrecks and dumpsters all occlude sight.
    return !this.world.obstacles.some(o => {
      let low = 0, high = 1;
      for (const axis of ['x', 'z'] as const) {
        const delta = b[axis] - a[axis], extent = (axis === 'x' ? o.w : o.d) / 2;
        const min = o[axis] - extent, max = o[axis] + extent;
        if (Math.abs(delta) < 1e-8) { if (a[axis] < min || a[axis] > max) return false; }
        else { let t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta; if (t1 > t2) [t1, t2] = [t2, t1]; low = Math.max(low, t1); high = Math.min(high, t2); if (low > high) return false; }
      }
      return high > 0.001 && low < 0.999;
    });
  }
}

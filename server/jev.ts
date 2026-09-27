import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { RULES } from '../src/sim/types';
import { JEV_MAX_CONCURRENT, validResponse, type DecisionResponse, type DecisionSnapshot, type Order } from '../src/ai/types';

const kinds = new Set(['hold', 'regroup', 'retreat', 'attack', 'advance', 'search']);
const id = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) < 100;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7;
const point = (p: { x?: unknown; z?: unknown } | undefined) => !!p && finite(p.x) && finite(p.z) && Math.abs(p.x) <= 1000 && Math.abs(p.z) <= 1000;
const orderValid = (o: Order) => !!o && typeof o.id === 'string' && /^[a-z]+(?:_\d+)?$/.test(o.id) && o.id.length < 40 && kinds.has(o.kind)
  && (o.kind === 'hold' || point(o.destination)) && (o.target === undefined || id(o.target));

export function validSnapshot(value: unknown): value is DecisionSnapshot {
  const s = value as DecisionSnapshot | null;
  if (!s || typeof s.runId !== 'string' || s.runId.length > 64 || !/^[\w-]+$/.test(s.runId)
    || !Number.isInteger(s.tick) || s.tick < 0 || !finite(s.time) || s.time < 0
    || !Number.isSafeInteger(s.sequence) || s.sequence < 1
    || !Array.isArray(s.decisionSquadIds) || !s.decisionSquadIds.length || s.decisionSquadIds.length > 50
    || !s.decisionSquadIds.every(id) || new Set(s.decisionSquadIds).size !== s.decisionSquadIds.length
    || !Array.isArray(s.humans) || s.humans.length < 1 || s.humans.length > 50
    || !Array.isArray(s.sightings) || s.sightings.length > 100
    || !Array.isArray(s.squads) || s.squads.length < 1 || s.squads.length > 50) return false;
  if (!s.humans.every(h => h && id(h.id) && point(h) && finite(h.hp) && h.hp > 0 && h.hp <= 100)
    || new Set(s.humans.map(h => h.id)).size !== s.humans.length
    || !s.sightings.every(e => e && id(e.id) && point(e) && finite(e.hp) && e.hp >= 0 && e.hp <= 100 && finite(e.seenAt) && e.seenAt <= s.time && s.time - e.seenAt < 9)) return false;
  const members: number[] = [];
  for (const squad of s.squads) {
    if (!squad || !id(squad.id) || !Number.isSafeInteger(squad.version) || squad.version < 1 || !Array.isArray(squad.members) || squad.members.length < 1 || squad.members.length > 5
      || !squad.members.includes(squad.id) || !squad.members.every(m => s.humans.some(h => h.id === m))
      || !Array.isArray(squad.orders) || squad.orders.length < 1 || squad.orders.length > 19
      || !squad.orders.every(orderValid) || !squad.orders.some(o => o.kind === 'hold')
      || new Set(squad.orders.map(o => o.id)).size !== squad.orders.length
      || (squad.currentOrder !== undefined && !orderValid(squad.currentOrder))) return false;
    members.push(...squad.members);
  }
  return new Set(members).size === members.length && members.length === s.humans.length && s.decisionSquadIds.every(id => s.squads.some(squad => squad.id === id));
}

const rounded = (n: number) => Math.round(n * 10) / 10;
const describeOrder = (order: Order) => `${order.kind}${order.target === undefined ? '' : ` target ${order.target}`}${order.destination ? ` at (${rounded(order.destination.x)},${rounded(order.destination.z)})` : ''}`;

// Candidates belong only in their question's criteria. Sending every squad's
// candidates again in shared state exceeded Jev's context window at population 50.
export function stateFor(snapshot: DecisionSnapshot) {
  return {
    policy: 'Preserve human lives while eliminating zombies. Consider health, local force balance, sighting age and other squads current orders. Avoid pointless oscillation. Unseen zombies are unknown. Coordinates are metres on the x,z plane. Candidate destinations are reachable. Regroup gathers survivors; retreat runs; attack pursues and fights; advance explores; search investigates memory; hold scans. Self-defence in melee is automatic. Questions are independent: do not assume new orders for other squads.',
    columns: { humans: ['id', 'x', 'z', 'hp'], sightings: ['id', 'x', 'z', 'hp', 'secondsSinceSeen'], squads: ['leaderId', 'memberIds', 'currentOrder'] },
    humans: snapshot.humans.map(h => [h.id, rounded(h.x), rounded(h.z), h.hp]),
    sightings: snapshot.sightings.map(s => [s.id, rounded(s.x), rounded(s.z), s.hp, rounded(snapshot.time - s.seenAt)]),
    squads: snapshot.squads.map(s => [s.id, s.members, s.currentOrder ? describeOrder(s.currentOrder) : 'awaiting orders']),
    rules: { melee: RULES.melee, humanDamage: RULES.humanDamage, zombieDamage: RULES.zombieDamage, humanCooldown: RULES.humanCooldown, zombieCooldown: RULES.zombieCooldown, humanSpeed: RULES.humanSpeed, zombieSpeed: RULES.zombieSpeed, retreatSpeed: RULES.retreatSpeed },
  };
}

export function questionsFor(snapshot: DecisionSnapshot) {
  return Object.fromEntries(snapshot.squads.filter(s => snapshot.decisionSquadIds.includes(s.id)).map(squad => [String(squad.id), choice(
    `Choose the next complete order for squad with leaderId ${squad.id} in \`squads\`, following \`policy\`.`,
    Object.fromEntries(squad.orders.map(order => [order.id, describeOrder(order)])),
  )]));
}

export function publicJevError(error: unknown): string {
  const e = error as { status?: number; name?: string; message?: string } | null;
  if (e?.status === 400 && e.message?.includes('max_tokens_exceeded')) return 'Jev rejected an oversized decision request. Restart the server with the latest game code, then retry.';
  if (e?.status === 401 || e?.status === 403) return 'Jev rejected the API key. Check .env.local and restart the server.';
  if (e?.status === 429) return 'Jev rate limit reached. Wait briefly, then retry.';
  if (e?.name === 'APIConnectionError') return 'The game server cannot reach TypeSafe. Check its network access, then retry.';
  if (e?.name === 'APITimeoutError') return 'Jev timed out. Retry the connection.';
  return 'Jev could not return orders. Check the connection and retry.';
}

export async function evaluate(snapshot: DecisionSnapshot, client: TypeSafeClient, signal: AbortSignal): Promise<DecisionResponse> {
  const started = performance.now();
  const response = await client.systemOne({ state: stateFor(snapshot), questions: questionsFor(snapshot) }, { signal });
  const result: DecisionResponse = {
    runId: snapshot.runId, tick: snapshot.tick,
    decisions: snapshot.decisionSquadIds.map(squadId => ({ squadId, orderId: response.answers[String(squadId)]?.choice, confidence: response.answers[String(squadId)]?.confidence })),
    latencyMs: performance.now() - started, tokens: response.usage.input_tokens + response.usage.output_tokens,
  };
  if (!validResponse(result, snapshot)) throw new Error('Invalid upstream response');
  return result;
}

export function jevPlugin(): Plugin {
  let env: Record<string, string> = {};
  let inFlight = 0;
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/jev/decide') { next(); return; }
    const send = (status: number, body: unknown) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); } };
    if (req.method !== 'POST') { send(405, { error: 'Use POST.' }); return; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) { send(403, { error: 'Same-origin requests only.' }); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'JSON required.' }); return; }
    const key = env.TYPESAFE_API_KEY?.trim();
    if (!key) { send(503, { error: 'Add TYPESAFE_API_KEY to .env.local, restart the server, then retry.' }); return; }
    if (inFlight >= JEV_MAX_CONCURRENT) { send(429, { error: 'Jev is busy. Retry shortly.' }); return; }
    const abort = new AbortController();
    const closed = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close', closed);
    inFlight++;
    try {
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 256_000) { send(413, { error: 'Snapshot too large.' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      let snapshot: unknown;
      try { snapshot = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(400, { error: 'Invalid JSON.' }); return; }
      if (!validSnapshot(snapshot)) { send(400, { error: 'Invalid game snapshot.' }); return; }
      const client = new TypeSafeClient({ apiKey: key, defaultModel: env.TYPESAFE_MODEL?.trim() || undefined, timeout: 10_000, retry: { maxRetries: 0 }, logLevel: 'off' });
      send(200, await evaluate(snapshot, client, abort.signal));
    } catch (error) {
      send(502, { error: publicJevError(error) });
    } finally { inFlight--; res.off('close', closed); }
  };
  return {
    name: 'jev-local-api',
    configResolved(config) { env = loadEnv(config.mode, config.envDir, 'TYPESAFE_'); },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

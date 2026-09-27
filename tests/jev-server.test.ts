import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { jevPlugin } from '../server/jev';
import { Simulation } from '../src/sim/simulation';
import { SquadDirector } from '../src/ai/squads';

vi.mock('vite', async importOriginal => ({ ...await importOriginal<typeof import('vite')>(), loadEnv: () => ({ TYPESAFE_API_KEY: 'test-only' }) }));
afterEach(() => vi.restoreAllMocks());

it('allows four server evaluations concurrently, rejects overflow, and frees capacity', async () => {
  const releases: (() => void)[] = [];
  const sdk = vi.spyOn(TypeSafeClient.prototype, 'systemOne').mockImplementation((request) => {
    const result = new Promise(resolve => releases.push(() => resolve({
      answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { choice: 'hold', confidence: .8 }])),
      usage: { input_tokens: 100, output_tokens: 10 },
    })));
    return result as ReturnType<TypeSafeClient['systemOne']>;
  });
  const plugin = jevPlugin();
  (plugin.configResolved as Function)({ mode: 'test', envDir: '.' });
  let handler!: Function;
  (plugin.configureServer as Function)({ middlewares: { use: (fn: Function) => { handler = fn; } } });
  const snapshot = new SquadDirector(new Simulation()).snapshot('test', [0]);
  const send = () => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(snapshot))]), { url: '/api/jev/decide', method: 'POST', headers: { 'content-type': 'application/json' } });
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, writeHead: vi.fn(), end: vi.fn(() => { res.writableEnded = true; }) });
    return { res, done: handler(req, res, () => {}) as Promise<void> };
  };
  const calls = Array.from({ length: 4 }, send);
  const overflow = send(); await overflow.done;
  expect(overflow.res.writeHead).toHaveBeenCalledWith(429, expect.anything());
  await vi.waitFor(() => expect(sdk).toHaveBeenCalledTimes(4));
  releases[0](); await calls[0].done;
  expect(calls[0].res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  const replacement = send(); await vi.waitFor(() => expect(sdk).toHaveBeenCalledTimes(5));
  releases.slice(1).forEach(release => release());
  await Promise.all([...calls.map(c => c.done), replacement.done]);
  expect(replacement.res.writeHead).toHaveBeenCalledWith(200, expect.anything());
});

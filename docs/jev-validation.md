# Jev integration validation

- `npm test`: simulation regressions plus squad formation, shared perception, all six orders, melee self-defence, stale response rejection, cancellation, timeout, pause/retry behaviour, payload validation, and the real TypeSafe SDK with a mocked HTTP transport.
- `npm run build`: type-checks browser and server code and builds the browser bundle. The TypeSafe SDK is imported only from server code.
- `npm run audit:simulation`: retains the five-seed procedural baseline; checks navigation and population accounting. It does not evaluate model quality.
- Current async regression tests verify movement and advancing time during slow refreshes, initial connection, timeout and API failure; automatic backoff; manual pause; bounded batches; damage-triggered reassessment; partial acceptance after membership changes; stale sequence/age/target rejection; and selected-squad API validation.
- Read-only browser diagnostics at `window.__zombieClash.snapshot().jev` expose request count, queued squads, last successful latency, last batch's maximum queue wait in simulation milliseconds, discarded decisions, tokens, and tokens per simulation minute.

The current scheduler refreshes squads every simulated second using up to four concurrent requests of thirteen squads. Tests cover per-squad in-flight deduplication, progress while another batch is delayed, independent failure reporting, and the server concurrency limit/released capacity. Persistent-order tests cover arrival, hold, splits, merges and unchanged routes. These mocked tests establish behavior, not live Jev latency, costs or win rates.

## Earlier synchronous integration observations

Live verification with the configured key caught a `max_tokens_exceeded` rejection on the full opening population. The server now sends a compact shared state (rounded positions and shared policy) and includes candidate descriptions only in each squad's Choice criteria. A regression test covers the full 50-human snapshot instead of only small fixtures.

After this fix, a live request returned all 38 opening squad decisions in approximately 512 ms (27,591 reported tokens). That was the previous full-batch implementation, not a measurement of the current scheduler. The local server must have outbound access to TypeSafe.

These are smoke-test observations, not guarantees of model quality, latency, or outcomes. No fixed confidence threshold overrides the model's choice.


Regression coverage also runs the full opening population for ten simulated seconds with a nonresponding provider, checks that most humans travel rather than hold before initial orders arrive. Once Jev supplies an executable order, it remains in effect until replaced.


Movement and perception regressions cover rear hearing, obstacle attenuation, inactive-contact exclusion, heard contacts reaching Jev, no idle spinning, and movement-only choices after prolonged idling or during an unfinished route. Hearing distances and movement policy are gameplay tuning values; live model win rates remain unmeasured.

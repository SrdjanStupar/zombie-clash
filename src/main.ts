import './style.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import { Simulation } from './sim/simulation';
import { TownScene } from './render/scene';
import type { State } from './sim/types';
import { Music } from './audio/music';
import { JevController } from './ai/controller';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="m8 4 12 8-12 8Z"/>',
    music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>', cross: '<path d="M5 5l14 14M5 19 19 5"/>',
    focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="m8 5 7 7-7 7"/>', human: '<circle cx="12" cy="6" r="3"/><path d="M5 21v-5a7 7 0 0 1 14 0v5M8 21v-5m8 5v-5"/>',
    zombie: '<path d="M5 13V9a7 7 0 0 1 14 0v4l-3 2v5H8v-5Z"/><path d="m8 9 2 1m4 0 2-1M10 17v3m4-3v3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Zombie Clash home"><span class="brand-mark">Z<span>/</span>C</span><span>ZOMBIE CLASH<small>A WORLD LEFT TO ITSELF</small></span></a>
    <div class="header-center"><span class="small-cross">+</span> AUTONOMOUS SURVIVAL SIMULATION <span class="version">POC / 01</span></div>
    <div class="observer">${icon('eye')} OBSERVER MODE</div>
  </header>
  <main>
    <section class="world-panel" aria-label="Simulation viewport">
      <div id="viewport"></div>
      <div class="world-heading"><div class="eyebrow"><span></span> QUARANTINE ZONE 06</div><h1>The last district.</h1><p>No rescue. No intervention. Just survival.</p></div>
      <div class="coordinates">45° 15′ N<br>19° 50′ E</div>
      <div class="compass" title="Camera orientation"><span>N</span><div id="compass-needle">↑</div><small>W&nbsp; + &nbsp;E</small></div>
      <div class="map-caption"><span class="map-dot"></span> ASHFIELD <span>/</span> 6 × 6 BLOCKS</div>
      <div class="camera-controls"><button id="zoom-in" title="Zoom in" aria-label="Zoom in">${icon('plus')}</button><button id="zoom-out" title="Zoom out" aria-label="Zoom out">${icon('minus')}</button><i></i><button id="reset-camera" title="Reset camera" aria-label="Reset camera">${icon('focus')}</button></div>
      <div id="pause-label" class="pause-label" hidden>${icon('pause')} OBSERVATION PAUSED</div>
      <div id="outcome" class="outcome" hidden role="status"></div>
      <div class="viewport-bottom"><span><i class="legend-human"></i> HUMAN <i class="legend-zombie"></i> INFECTED</span><span>DRAG TO ORBIT <b>·</b> RIGHT-DRAG TO PAN <b>·</b> SCROLL TO ZOOM</span></div>
    </section>
    <aside class="sidebar" aria-label="Observation dashboard">
      <section class="situation"><div class="section-heading">DISTRICT STATUS <span id="live-status"><i></i> LIVE</span></div>
        <div class="clock-row"><span>ELAPSED TIME</span><strong id="clock">00:00</strong></div>
        <div class="populations"><div class="population humans">${icon('human')}<strong id="humans">50</strong><span>HUMANS</span></div><div class="versus">/</div><div class="population infected">${icon('zombie')}<strong id="zombies">50</strong><span>INFECTED</span></div></div>
        <div class="balance"><span id="human-bar"></span><span id="zombie-bar"></span></div>
        <div class="minor-stats"><span>CONVERTED <b id="converted">00</b></span><span>DEAD <b id="dead">00</b></span></div>
        <div class="turning-line"><span id="turning">0</span> currently turning</div>
      </section>
      <section class="jev-panel" aria-label="Jev squad command"><div class="section-heading">JEV / SQUAD COMMAND <span id="jev-status">CONNECTING</span></div><p id="jev-message" role="status">Connecting to squad command…</p><button id="jev-retry" class="secondary-button" hidden>Retry Jev</button></section>
      <section class="inspection"><div class="section-heading">FIELD OBSERVATION <button id="clear-selection" class="small-button" aria-label="Clear selection" hidden>${icon('cross')}</button></div>
        <div id="inspection-content"></div>
      </section>
      <section class="activity"><div class="section-heading">EVENT LOG <span class="subtle">LATEST TRANSMISSIONS</span></div><ol id="event-log"><li class="initial-event"><time>00:00</time><span>100 signals detected.<br><small>The district is now under observation.</small></span></li></ol></section>
      <div class="sidebar-note"><span class="small-cross">+</span><p>Humans rely on sight.<br>The infected follow the scent.</p></div>
    </aside>
  </main>
  <footer class="controlbar"><div class="run-controls"><button id="pause" class="primary-button">${icon('pause')}<span>Pause simulation</span><kbd>SPACE</kbd></button><button id="restart" class="secondary-button">${icon('reset')}<span>Restart</span></button></div><div class="music-controls"><button id="music" class="secondary-button" aria-pressed="false" title="Ashfield After Dark — original ambient score">${icon('music')}<span id="music-label">Music off</span></button><input id="music-volume" type="range" min="0" max="100" value="28" aria-label="Music volume" title="Music volume"/><span id="music-status" class="sr-only" role="status"></span></div><div class="footer-note">50 HUMAN LIVES. <span>ONE POSSIBLE END.</span></div><div class="seed">SEED <b>001986</b><span id="performance">LOCAL SIMULATION</span></div></footer>
`;

let sim = new Simulation();
let jev = new JevController(sim);
let selected: number | null = null;
let view: TownScene;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const music = new Music();
function updateMusic() {
  const button = $<HTMLButtonElement>('music');
  button.disabled = music.loading;
  button.setAttribute('aria-pressed', String(music.enabled));
  button.dataset.audioState = music.state;
  button.dataset.duration = String(music.duration);
  $('music-label').textContent = music.loading ? 'Loading…' : music.error ? 'Retry music' : music.enabled ? 'Music on' : 'Music off';
  button.title = music.error || `Ashfield After Dark · ${music.enabled && (sim.paused || sim.outcome) ? 'paused with simulation' : 'original 64-second ambient loop'}`;
  $('music-status').textContent = music.error;
}
music.onChange = updateMusic;
$('music').onclick = () => { void music.toggle(); };
$<HTMLInputElement>('music-volume').oninput = e => music.setVolume(Number((e.target as HTMLInputElement).value) / 100);
document.addEventListener('visibilitychange', () => { jev.update(document.hidden); music.setPaused(document.hidden || sim.paused || !!sim.outcome); });
window.addEventListener('pagehide', () => music.setPaused(true));
if (import.meta.hot) import.meta.hot.dispose(() => { music.dispose(); jev.dispose(); });
const timeLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const descriptions: Record<State, string> = {
  hold: 'Holding position and scanning for threats.',
  patrol: 'Moving through the district, searching for signs of life.', pursue: 'Tracking a detected opponent through the streets.',
  search: 'Searching the last known position. Contact has been lost.', regroup: 'Staying near a visible ally, following their movement and scanning while waiting.',
  retreat: 'Outnumbered. Falling back before reassessing the threat.', attack: 'In close combat. Every opening counts.',
  turning: 'Overwhelmed by the infected. The transformation has begun.', dead: 'Permanently lost. This infected will not rise again.',
};
let lastInspected: number | null | undefined;
function renderInspection() {
  const a = sim.agents.find(b => b.id === selected);
  $('clear-selection').hidden = !a;
  if (!a) {
    if (lastInspected !== null) $('inspection-content').innerHTML = `<div class="empty-inspector"><div class="reticle">${icon('focus')}</div><h2>Every life has a story.</h2><p>Select anyone in the district<br>to see what happens next.</p><span>CLICK A CHARACTER TO INSPECT</span></div>`;
    lastInspected = null; return;
  }
  if (lastInspected !== a.id) {
    $('inspection-content').innerHTML = `<div class="agent-heading"><div id="agent-icon"></div><div><small id="agent-faction"></small><h2 id="agent-name"></h2></div><span id="agent-number"></span></div><div class="health-label"><span>VITALITY</span><b id="health-value"></b></div><div class="health-track"><div id="health-fill"></div></div><div class="behavior"><span id="agent-state"></span><p id="agent-description"></p></div><div class="agent-detail"><span>TRACKING</span><b id="agent-target"></b></div><button id="focus-agent" class="focus-button">${icon('focus')} Locate in district ${icon('arrow')}</button>`;
    $('focus-agent').onclick = () => view.focus(a.id); lastInspected = a.id;
  }
  $('agent-icon').innerHTML = icon(a.faction); $('agent-icon').className = a.faction;
  $('agent-faction').textContent = a.faction === 'human' ? 'SURVIVOR / MACHETE' : 'INFECTED / CLAWS & TEETH';
  $('agent-name').textContent = a.name; $('agent-number').textContent = `#${String(a.id + 1).padStart(3, '0')}`;
  $('health-value').textContent = a.state === 'turning' ? 'TURNING' : `${Math.ceil(a.hp)} / 100`;
  $('health-fill').style.width = `${a.hp}%`; $('health-fill').style.background = a.faction === 'human' ? 'var(--human)' : 'var(--zombie)';
  $('agent-state').textContent = a.state; $('agent-description').textContent = descriptions[a.state];
  if (a.faction === 'human') {
    const info = jev.director.inspect(a.id), assignment = info?.assignment;
    if (info) {
      const order = jev.director.instruction(a);
      const destination = order?.destination;
      $('agent-description').textContent = `Squad ${info.squad.id + 1} · ${info.squad.members.length} survivors. ${order ? `Jev: ${order.kind}${order.target !== undefined ? ` → #${order.target + 1}` : ''}${destination ? ` (${destination.x.toFixed(0)}, ${destination.z.toFixed(0)})` : ''}. ${(sim.time - assignment!.issuedAt).toFixed(1)}s ago · ${Math.round(assignment!.confidence * 100)}% confidence.` : 'Local survival behavior while awaiting fresh Jev orders.'}`;
    }
  }
  $('agent-target').textContent = a.target === null ? 'No contact' : sim.agents.find(b => b.id === a.target)?.name ?? 'No contact';
}
let log: { time: number; text: string; kind: string }[] = [];
const previousState = new Map<number, State>();
function updateUI() {
  $('jev-status').textContent = sim.outcome ? 'COMPLETE' : jev.manualPaused ? 'PAUSED' : jev.status.toUpperCase();
  $('jev-message').textContent = jev.error ? `${jev.error} Humans continue locally; retrying automatically.` : jev.status === 'connecting' ? 'Contacting squad command. Humans act locally while waiting.' : `${jev.director.squads.length} squads · ${jev.queued} queued · ${Math.round(jev.latencyMs)} ms · ${jev.tokens.toLocaleString()} tokens`;
  $('jev-retry').hidden = !jev.error;
  music.setPaused(document.hidden || sim.paused || !!sim.outcome); updateMusic();
  const c = sim.counts;
  $('viewport').dataset.simTime = String(sim.time);
  $('viewport').dataset.agentState = JSON.stringify(sim.agents.map(a => [a.id, a.x, a.z, a.hp, a.state]));
  $('clock').textContent = timeLabel(sim.time); $('humans').textContent = String(c.humans); $('zombies').textContent = String(c.zombies);
  $('converted').textContent = String(c.conversions).padStart(2, '0'); $('dead').textContent = String(c.dead).padStart(2, '0'); $('turning').textContent = String(c.turning);
  $('human-bar').style.width = `${c.humans / Math.max(1, c.humans + c.zombies) * 100}%`; $('zombie-bar').style.flex = '1';
  const resume = jev.manualPaused;
  const pauseAction = resume ? 'resume' : 'pause';
  // Keep the button's children stable between pointer-down and click. Replacing
  // them every UI tick can swallow a click on its label or icon.
  if ($('pause').dataset.action !== pauseAction) {
    $('pause').dataset.action = pauseAction;
    $('pause').innerHTML = `${icon(resume ? 'play' : 'pause')}<span>${resume ? 'Resume simulation' : 'Pause simulation'}</span><kbd>SPACE</kbd>`;
  }
  ($('pause') as HTMLButtonElement).disabled = !!sim.outcome;
  $('pause-label').hidden = !sim.paused || !!sim.outcome;
  $('live-status').innerHTML = `<i class="${sim.paused || sim.outcome ? 'inactive' : ''}"></i> ${sim.outcome ? 'COMPLETE' : sim.paused ? 'PAUSED' : 'LIVE'}`;
  for (const a of sim.agents) {
    if ((a.state === 'turning' || a.state === 'dead') && previousState.get(a.id) !== a.state) {
      log.unshift({ time: sim.time, text: a.state === 'turning' ? `${a.name} has been infected.` : `${a.name} was eliminated.`, kind: a.state });
    }
    previousState.set(a.id, a.state);
  }
  log = log.slice(0, 4);
  if (log.length) $('event-log').innerHTML = log.map(e => `<li class="${e.kind}"><time>${timeLabel(e.time)}</time><span>${e.text}</span></li>`).join('');
  renderInspection();
  $('outcome').hidden = !sim.outcome;
  if (sim.outcome) $('outcome').innerHTML = `<span class="eyebrow">OBSERVATION COMPLETE</span><h2>${sim.outcome === 'humans' ? 'The living remain.' : sim.outcome === 'zombies' ? 'The district has fallen.' : 'Silence, at last.'}</h2><p>${sim.outcome === 'humans' ? 'Every infected has been eliminated.' : sim.outcome === 'zombies' ? 'No humans remain in Ashfield.' : 'Neither side survived.'}</p><div>${timeLabel(sim.time)} elapsed <span>·</span> ${c.humans} humans <span>·</span> ${c.zombies} infected<br>${c.conversions} converted <span>·</span> ${c.dead} dead</div><button id="run-again" class="primary-button">Observe again ${icon('reset')}</button>`;
  const again = document.getElementById('run-again'); if (again) again.onclick = restart;
}
function togglePause() { if (!sim.outcome) { jev.togglePause(); updateUI(); } }
function restart() {
  jev.dispose();
  const fresh = new Simulation(sim.seed, sim.world);
  // Retain the Simulation object shared by picking and camera helpers.
  Object.assign(sim, fresh); selected = null; lastInspected = undefined; log = []; previousState.clear(); view.resetEffects();
  jev = new JevController(sim);
  $('event-log').innerHTML = '<li class="initial-event"><time>00:00</time><span>100 signals detected.<br><small>The district is now under observation.</small></span></li>';
  updateUI();
}
$('pause').onclick = togglePause; $('restart').onclick = restart;
$('jev-retry').onclick = () => { jev.retry(); updateUI(); };
$('clear-selection').onclick = () => { selected = null; renderInspection(); };
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); togglePause(); }
  if (e.code === 'Escape') { selected = null; renderInspection(); }
});

try {
  view = new TownScene($('viewport'), sim);
  view.onSelect = id => { selected = id; renderInspection(); };
  $('zoom-in').onclick = () => view.zoom(1.4); $('zoom-out').onclick = () => view.zoom(1 / 1.4); $('reset-camera').onclick = () => view.resetCamera();
  let previous = performance.now(), lastUI = 0, frames = 0, sampleStart = previous;
  const frameTimes: number[] = [];
  function frame(now: number) {
    const delta = (now - previous) / 1000; previous = now;
    jev.update(document.hidden);
    if (!document.hidden) { sim.advance(delta); view.render(sim, selected); }
    if (now - lastUI > 200) { updateUI(); lastUI = now; $('compass-needle').style.transform = `rotate(${-view.controls.getAzimuthalAngle() * 180 / Math.PI + 45}deg)`; }
    frames++; frameTimes.push(delta * 1000); if (frameTimes.length > 300) frameTimes.shift();
    if (now - sampleStart > 2000) {
      $('performance').textContent = `${Math.round(frames * 1000 / (now - sampleStart))} FPS · LOCAL`;
      $('performance').dataset.meanFrameMs = String(frameTimes.reduce((sum, t) => sum + t, 0) / frameTimes.length);
      $('performance').dataset.drawCalls = String(view.renderer.info.render.calls);
      $('performance').dataset.triangles = String(view.renderer.info.render.triangles);
      sampleStart = now; frames = 0;
    }
    requestAnimationFrame(frame);
  }
  // Read-only diagnostics for local browser verification; no character-control API.
  Object.defineProperty(window, '__zombieClash', { value: {
    snapshot: () => ({ time: sim.time, paused: sim.paused, outcome: sim.outcome, counts: sim.counts, selected, jev: { status: jev.status, requests: jev.requests, queued: jev.queued, latencyMs: jev.latencyMs, queueWaitSimMs: jev.queueWaitMs, discarded: jev.discarded, tokens: jev.tokens, tokensPerSimMinute: sim.time ? jev.tokens * 60 / sim.time : 0 }, agents: sim.agents.map(a => ({ id: a.id, x: a.x, z: a.z, hp: a.hp, faction: a.faction, state: a.state })), frameMs: [...frameTimes], drawCalls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles }),
  } });
  updateUI(); requestAnimationFrame(frame);
} catch (error) {
  $('viewport').innerHTML = `<div class="render-error"><h2>The district could not load.</h2><p>This simulation requires a browser with WebGL 2 and hardware acceleration enabled.</p><pre></pre></div>`;
  $('viewport').querySelector('pre')!.textContent = error instanceof Error ? error.message : String(error);
  ($('pause') as HTMLButtonElement).disabled = true;
  console.error(error);
}

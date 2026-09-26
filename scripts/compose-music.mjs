// Original procedural score: “Ashfield After Dark”. No samples or external assets.
// Render a cyclic stereo mix; wrap note/reverb tails for a seamless 64-second loop.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const rate = 32000, seconds = 64, length = rate * seconds;
const left = new Float64Array(length), right = new Float64Array(length);
let seed = 1986;
function random() { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }
const tau = Math.PI * 2;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
function add(start, duration, pan, voice, level) {
  const l = Math.sqrt((1 - pan) / 2), r = Math.sqrt((1 + pan) / 2);
  for (let i = 0; i < duration * rate; i++) {
    const t = i / rate, index = (Math.round(start * rate) + i) % length;
    const sample = voice(t, duration) * level;
    left[index] += sample * l; right[index] += sample * r;
  }
}
// D pedal with slow, cyclic beating and a drifting low fifth. Frequencies end on exact cycles.
for (let i = 0; i < length; i++) {
  const t = i / rate;
  for (const [midi, level, phase] of [[26,.095,0], [38,.047,1.3], [45,.019,2.4], [50,.011,.7]]) {
    const f = Math.round(hz(midi) * seconds) / seconds;
    const breath = .7 + .3 * Math.sin(tau * t / 32 + phase);
    const s = Math.sin(tau * f * t + .2 * Math.sin(tau * t / 16 + phase)) * breath * level;
    left[i] += s; right[i] += Math.sin(tau * f * t + phase * .15 + .2 * Math.sin(tau * t / 16 + phase)) * breath * level;
  }
}
// Four slow suspended harmonies; deliberately leave the minor second unresolved.
const chords = [[50,57,65], [46,53,62], [43,50,58], [45,52,63]];
chords.forEach((chord, bar) => chord.forEach((note, j) => {
  const f = hz(note), pan = (j - 1) * .48;
  add(bar * 16, 23, pan, (t, d) => {
    const env = Math.min(1,t / 5) ** 2 * Math.min(1,(d - t) / 10) ** 2;
    return env * (Math.sin(tau*f*t + .7*Math.sin(tau*.12*t)) + .26*Math.sin(tau*f*2.003*t) + .07*Math.sin(tau*f*3*t));
  }, .027);
}));
// Sparse, original music-box motif; inharmonic partials suggest distant, damaged bells.
for (const [start,note,level] of [[2,74,.10],[7,77,.065],[13,75,.065],[21,69,.08],[27,74,.07],[34,77,.09],[39,81,.055],[45,75,.07],[51,76,.07],[58,73,.05],[61,74,.06]]) {
  const f = hz(note);
  add(start, 12, (random()-.5)*1.2, t => (1-Math.exp(-t*75)) * (
    Math.sin(tau*f*t)*Math.exp(-t/.95) + .32*Math.sin(tau*f*2.756*t)*Math.exp(-t/.42) + .18*Math.sin(tau*f*1.003*t)*Math.exp(-t/2.7)
  ), level);
}
// A distant paired heartbeat every four seconds. No jump-scare peaks.
for (let beat = 0; beat < 64; beat += 4) for (const [delay, level] of [[0,.09],[.43,.055]]) {
  add(beat+delay, 1.4, 0, t => Math.sin(tau*(43*t + 1.6*(1-Math.exp(-t*14)))) * Math.exp(-t*7) * (1-Math.exp(-t*90)), level);
}
// Filtered air and occasional bowed-metal swells sit behind the tonal score.
let air = 0;
for (let i = 0; i < length; i++) {
  air = air * .975 + (random()*2-1)*.025;
  const t = i/rate, env = Math.sin(Math.PI*t/seconds)**2 * (.012 + .009*Math.sin(tau*t/16)**2);
  left[i] += air*env; right[i] += air*env*.85;
}
for (const start of [11, 30, 48]) {
  const f = 160+random()*70;
  add(start, 9, (random()-.5), (t,d) => Math.sin(Math.PI*t/d)**3 * (Math.sin(tau*f*t + 1.8*Math.sin(tau*1.31*t)) + .15*Math.sin(tau*f*1.414*t)), .018);
}
// Stereo multi-tap diffusion. Wrap each tail into the beginning of the next loop.
const dryL = left.slice(), dryR = right.slice();
for (const [delay,gain] of [[.173,.20],[.319,.17],[.487,.15],[.733,.13],[1.137,.10],[1.713,.08],[2.531,.065],[3.791,.04]]) {
  const offset = Math.round(delay*rate);
  for (let i = 0; i < length; i++) { const j = (i+offset)%length; left[j] += dryR[i]*gain; right[j] += dryL[i]*gain; }
}
let peak = 0, sum = 0;
for (let i = 0; i < length; i++) { left[i] = Math.tanh(left[i]*1.3); right[i] = Math.tanh(right[i]*1.3); peak = Math.max(peak,Math.abs(left[i]),Math.abs(right[i])); }
const scale = .65 / peak;
const data = Buffer.alloc(44+length*4);
data.write('RIFF',0); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16);
data.writeUInt16LE(1,20); data.writeUInt16LE(2,22); data.writeUInt32LE(rate,24); data.writeUInt32LE(rate*4,28); data.writeUInt16LE(4,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(length*4,40);
for (let i = 0; i < length; i++) {
  const l = left[i]*scale, r = right[i]*scale; sum += l*l+r*r;
  data.writeInt16LE(Math.round(l*32767),44+i*4); data.writeInt16LE(Math.round(r*32767),46+i*4);
}
mkdirSync('artifacts/music',{recursive:true});
const output = resolve('artifacts/music/ashfield-after-dark.wav'); writeFileSync(output,data);
console.log(JSON.stringify({output,seconds,sampleRate:rate,peakDb:20*Math.log10(.65),rmsDb:20*Math.log10(Math.sqrt(sum/(length*2))),loopBoundaryDelta:Math.max(Math.abs(left[0]-left[length-1]),Math.abs(right[0]-right[length-1]))*scale}));

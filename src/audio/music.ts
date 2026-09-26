/** User-initiated, sample-accurate ambient loop. Independent of the simulation seed. */
export class Music {
  enabled = false;
  loading = false;
  volume = .28;
  error = '';
  private context?: AudioContext;
  private gain?: GainNode;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private paused = false;
  private suspended = true;
  private suspendTimer?: ReturnType<typeof setTimeout>;
  onChange = () => {};

  async toggle() {
    if (this.loading) return;
    this.enabled = !this.enabled; this.error = '';
    if (!this.enabled) { this.sync(); this.onChange(); return; }
    this.loading = true; this.onChange();
    try {
      this.context ??= new AudioContext();
      // Resume directly from the click, before the asynchronous asset load.
      await this.context.resume();
      if (!this.buffer) {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/ashfield-after-dark.ogg?v=2`);
        if (!response.ok) throw new Error('Music download failed');
        this.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.gain = this.context.createGain(); this.gain.gain.value = 0; this.gain.connect(this.context.destination);
        this.source = this.context.createBufferSource(); this.source.buffer = this.buffer; this.source.loop = true; this.source.connect(this.gain); this.source.start();
      }
      this.suspended = !this.paused; this.sync();
    } catch {
      this.enabled = false; this.error = 'Music unavailable — click to retry.';
      await this.context?.suspend();
    } finally { this.loading = false; this.onChange(); }
  }
  setPaused(paused: boolean) { this.paused = paused; this.sync(); }
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); if (this.gain && this.context) this.gain.gain.setTargetAtTime(this.enabled && !this.paused ? this.volume : 0, this.context.currentTime, .12); }
  private sync() {
    if (!this.context || !this.gain) return;
    const suspend = !this.enabled || this.paused;
    if (suspend === this.suspended) return;
    this.suspended = suspend;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.gain.gain.setTargetAtTime(suspend ? 0 : this.volume, this.context.currentTime, .08);
    if (suspend) this.suspendTimer = setTimeout(() => { if (this.suspended) void this.context?.suspend(); }, 350);
    else void this.context.resume().catch(() => { this.enabled = false; this.error = 'Click to resume music.'; this.onChange(); });
  }
  dispose() { if (this.suspendTimer) clearTimeout(this.suspendTimer); this.source?.stop(); void this.context?.close(); }
  get state() { return this.context?.state ?? 'idle'; }
  get duration() { return this.buffer?.duration ?? 0; }
}

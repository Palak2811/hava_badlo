/** Procedural WebAudio sound — no copyrighted music. A tanpura-like drone plus Raag Bhupali (S R G P D) plucks. */
type Sfx = 'click' | 'buy' | 'unlock' | 'notify' | 'alert' | 'achievement' | 'error' | 'build' | 'cash' | 'stamp' | 'fanfare' | 'tick';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private droneNodes: OscillatorNode[] = [];
  sfxOn = true;
  musicOn = false;
  musicVol = 0.4;
  sfxVol = 0.6;

  private ensure() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  configure(o: { sfx: boolean; music: boolean; musicVolume: number; sfxVolume: number }) {
    this.sfxOn = o.sfx;
    this.musicVol = o.musicVolume;
    this.sfxVol = o.sfxVolume;
    this.applyVolumes();
    if (o.music !== this.musicOn) {
      this.musicOn = o.music;
      if (o.music) this.startMusic();
      else this.stopMusic();
    }
  }

  private applyVolumes() {
    if (this.musicGain) this.musicGain.gain.value = this.musicVol * 0.25;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol * 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, when = 0, vol = 1, dest?: GainNode | null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.sfxGain!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(s: Sfx) {
    if (!this.sfxOn) return;
    const notes: Record<Sfx, [number, number, OscillatorType, number][]> = {
      click: [[660, 0.06, 'triangle', 0]],
      buy: [[523, 0.12, 'triangle', 0], [784, 0.18, 'triangle', 0.08]],
      unlock: [[440, 0.1, 'sine', 0], [554, 0.1, 'sine', 0.08], [659, 0.1, 'sine', 0.16], [880, 0.3, 'sine', 0.24]],
      notify: [[880, 0.1, 'sine', 0], [1175, 0.15, 'sine', 0.1]],
      alert: [[330, 0.18, 'square', 0], [262, 0.25, 'square', 0.2]],
      achievement: [[523, 0.1, 'triangle', 0], [659, 0.1, 'triangle', 0.1], [784, 0.1, 'triangle', 0.2], [1047, 0.4, 'triangle', 0.3]],
      error: [[200, 0.15, 'sawtooth', 0]],
      // hammer taps for construction
      build: [[180, 0.05, 'square', 0], [180, 0.05, 'square', 0.12], [240, 0.08, 'square', 0.24]],
      // coins for weekly settlement
      cash: [[1319, 0.06, 'triangle', 0], [1568, 0.06, 'triangle', 0.07], [2093, 0.14, 'triangle', 0.14]],
      // rubber stamp on an approval
      stamp: [[120, 0.08, 'square', 0], [90, 0.12, 'sine', 0.03]],
      fanfare: [[392, 0.18, 'triangle', 0], [523, 0.18, 'triangle', 0.18], [659, 0.18, 'triangle', 0.36], [784, 0.5, 'triangle', 0.54]],
      tick: [[880, 0.04, 'sine', 0]],
    };
    for (const [f, d, t, w] of notes[s]) this.tone(f, d, t, w, s === 'alert' || s === 'error' || s === 'stamp' ? 0.25 : 0.5);
  }

  private startMusic() {
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    const sa = 146.83; // D3
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(this.musicGain);
    for (const f of [sa / 2, sa, sa * 1.5]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(filter);
      o.start();
      this.droneNodes.push(o);
    }
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4];
    let i = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.musicOn) return;
      const deg = scale[(i * 3 + Math.floor(Math.random() * 3)) % scale.length];
      this.tone(sa * 2 * deg, 0.9, 'triangle', 0, 0.35, this.musicGain);
      if (i % 4 === 0) this.tone(sa, 0.3, 'sine', 0.25, 0.4, this.musicGain); // tabla-ish thump
      i++;
    }, 520);
  }

  private stopMusic() {
    for (const o of this.droneNodes) o.stop();
    this.droneNodes = [];
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

export const sound = new SoundEngine();

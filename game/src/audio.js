// All sound is synthesised live with WebAudio — there are no audio
// files. Short one-shot voices (a pistol crack, a pickup chime, a
// mission sting, a collision thud, the spray shop's cash-register
// sting, the cab's hail horn and fare chimes) are built from
// oscillators and a noise buffer when the world reports an event;
// three loop voices run while they apply: the engine (pitch follows
// speed), the skid (noise while the handbrake bites) and the police
// siren (a two-tone sweep whose volume follows the nearest officer).
// The context is created lazily on the first user gesture, as
// browsers require.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engine = null;
    this.skid = null;
    this.siren = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.buildNoise();
    this.engine = this.startLoop('sawtooth', 60, 0.0);
    this.skid = this.startNoiseLoop(0.0);
    this.siren = this.startLoop('triangle', 700, 0.0);
  }

  buildNoise() {
    const length = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < length; i += 1) {
      s = (Math.imul(s, 1103515245) + 12345) | 0;
      data[i] = ((s >>> 9) & 0xffff) / 32768 - 1;
    }
    return buffer;
  }

  startLoop(type, freq, gainValue) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    osc.connect(gain).connect(this.master);
    osc.start();
    return { osc, gain };
  }

  startNoiseLoop(gainValue) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { src, gain };
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  tone(freq, seconds, type = 'square', volume = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  noiseHit(seconds, volume, freq = 400) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + seconds + 0.02);
  }

  /** React to one world event ({type}) with a one-shot voice. */
  playEvent(event) {
    if (!this.ctx || this.muted) return;
    switch (event.type) {
      case 'shot': this.noiseHit(0.09, 0.25, 2400); this.tone(190, 0.07, 'square', 0.12, 60); break;
      case 'hit': this.noiseHit(0.16, 0.3, 500); break;
      case 'crash': this.noiseHit(0.28, 0.4, 320); this.tone(70, 0.2, 'sine', 0.25, 40); break;
      case 'pickup': this.tone(660, 0.09, 'sine', 0.2); this.tone(990, 0.12, 'sine', 0.2, null, 0.08); break;
      case 'cash': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.2, null, i * 0.07)); break;
      case 'spray': this.noiseHit(0.05, 0.12, 3000); this.tone(1318, 0.07, 'square', 0.16); this.tone(1760, 0.1, 'square', 0.16, null, 0.07); this.tone(2093, 0.16, 'triangle', 0.18, null, 0.16); break;
      case 'enter': this.tone(220, 0.08, 'square', 0.12); this.tone(330, 0.08, 'square', 0.12, null, 0.07); break;
      case 'busted': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, null, i * 0.16)); break;
      case 'wasted': [330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.14, null, i * 0.2)); break;
      case 'star': this.tone(1180, 0.1, 'square', 0.14); break;
      // Crew & street races: countdown beeps, the GO horn, the
      // checkpoint chime, the win arpeggio and the hire blip.
      case 'raceCountdown': this.tone(880, 0.09, 'square', 0.18); break;
      case 'raceGo': this.tone(660, 0.1, 'square', 0.2); this.tone(990, 0.22, 'square', 0.2, null, 0.09); break;
      case 'raceCheckpoint': this.tone(990, 0.08, 'sine', 0.2); this.tone(1320, 0.14, 'sine', 0.2, null, 0.07); break;
      case 'raceWin': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.22, null, i * 0.08)); break;
      case 'hire': this.tone(523, 0.09, 'triangle', 0.2); this.tone(784, 0.14, 'triangle', 0.2, null, 0.08); break;
      // Cab work: the hail horn when a rider waves, the boarding
      // chime, the fare-paid arpeggio with a tip ding, and the
      // descending blip when a rider bails or walks off.
      case 'taxiHail': this.tone(740, 0.07, 'square', 0.14); this.tone(740, 0.07, 'square', 0.14, null, 0.11); break;
      case 'taxiPickup': this.tone(784, 0.09, 'sine', 0.2); this.tone(1047, 0.13, 'sine', 0.2, null, 0.08); break;
      case 'taxiDropoff': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.2, null, i * 0.07)); this.tone(1568, 0.18, 'sine', 0.18, null, 0.3); break;
      case 'taxiBail': this.tone(494, 0.14, 'sawtooth', 0.12, 330); this.tone(330, 0.18, 'sawtooth', 0.12, 220, 0.14); break;
      case 'taxiLeft': this.tone(440, 0.12, 'sine', 0.12, 330); break;
      // Harbor Heist League: the board's paper rustle, the grab's
      // low thud, and the fence's cash-register arpeggio.
      case 'heistPlan': this.tone(880, 0.08, 'triangle', 0.16); this.tone(1174, 0.12, 'triangle', 0.16, null, 0.08); break;
      case 'heistGrab': this.tone(140, 0.18, 'sine', 0.3, 60); this.noiseHit(0.2, 0.3, 420); break;
      case 'heistFence': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.22, null, i * 0.08)); break;
      default: break;
    }
  }

  /** Per-frame loop voices: engine by speed, skid, siren by distance. */
  update(world, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const driving = world.player.car;
    const speed = driving ? Math.abs(driving.speed) : 0;
    const engineTarget = driving && !this.muted ? 0.05 + Math.min(0.05, speed / 9000) : 0;
    this.engine.gain.gain.setTargetAtTime(engineTarget, t, 0.08);
    this.engine.osc.frequency.setTargetAtTime(55 + speed * 0.55, t, 0.08);
    const skidding = driving && driving.skidding && speed > 120;
    this.skid.gain.gain.setTargetAtTime(skidding && !this.muted ? 0.12 : 0, t, 0.05);
    let nearest = Infinity;
    for (const cop of world.police) {
      const d = Math.hypot(cop.x - world.player.x, cop.y - world.player.y);
      if (d < nearest) nearest = d;
    }
    const sirenOn = world.wanted > 0 && nearest < 700 && !this.muted;
    this.siren.gain.gain.setTargetAtTime(sirenOn ? Math.max(0.02, 0.1 - nearest / 8000) : 0, t, 0.1);
    if (sirenOn) {
      const phase = Math.floor(world.time * 1.6) % 2;
      this.siren.osc.frequency.setTargetAtTime(phase ? 950 : 680, t, 0.05);
    }
    void dt;
  }
}

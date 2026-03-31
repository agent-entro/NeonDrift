/**
 * NeonDrift audio system — pure Web Audio API, no external libraries.
 *
 * Sounds:
 *  - engineHum: oscillator-based, pitch and volume track car speed
 *  - driftScreech: filtered noise burst, triggered on high lateral slip
 *  - boostSFX: frequency sweep up on boost activation
 *  - powerupPickup: ascending arpeggio (boost=high, shield=warm, emp=harsh, gravity_well=deep, time_warp=eerie)
 *  - countdown: low/high beep at 3/2/1 and fanfare chord on GO
 *  - raceFinish: triumphant 3-chord fanfare
 */

import type { PowerupKind } from "@neondrift/shared";

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private _engineRunning = false;
  private _speed = 0;
  private _driftIntensity = 0;
  private _driftTimeout: ReturnType<typeof setTimeout> | null = null;
  private _muted = false;

  /** Call once after first user gesture (autoplay policy) */
  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // Audio not available (e.g. test environment)
    }
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Start the continuous engine hum. Call once when race starts. */
  startEngine(): void {
    if (!this.ctx || !this.masterGain || this._engineRunning) return;
    this._engineRunning = true;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.15;
    this.engineGain.connect(this.masterGain);

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 80; // idle pitch
    this.engineOsc.connect(this.engineGain);
    this.engineOsc.start();
  }

  stopEngine(): void {
    if (!this._engineRunning) return;
    this._engineRunning = false;
    try {
      this.engineOsc?.stop();
    } catch {
      // may already be stopped
    }
    this.engineOsc = null;
    this.engineGain = null;
  }

  /**
   * Update engine sound from game state.
   * Call every frame.
   * @param speedMs  Car speed in m/s
   * @param lateralVelAbs  Abs lateral velocity (for drift detection)
   */
  updateEngine(speedMs: number, lateralVelAbs: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;

    this._speed = speedMs;
    this._driftIntensity = lateralVelAbs;

    const t = this.ctx.currentTime;
    // Pitch: 80Hz idle → 220Hz at top speed (35 m/s)
    const pitch = 80 + (speedMs / 35) * 140;
    this.engineOsc.frequency.setTargetAtTime(pitch, t, 0.1);

    // Volume: louder at higher speed
    const vol = 0.08 + (speedMs / 35) * 0.18;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);

    // Drift screech
    if (lateralVelAbs > 4 && !this._driftTimeout) {
      this._triggerDriftScreech();
    }
  }

  private _triggerDriftScreech(): void {
    if (!this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2800 + this._driftIntensity * 80;
    filter.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.value = 0.25;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();

    // Debounce: don't re-trigger for 300ms
    this._driftTimeout = setTimeout(() => {
      this._driftTimeout = null;
    }, 300);
  }

  /** Play boost activation sound: rising sweep */
  playBoost(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Play power-up pickup sound, tuned per kind */
  playPowerupPickup(kind: PowerupKind): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Different tones per kind
    const configs: Record<PowerupKind, { freqs: number[]; type: OscillatorType }> = {
      boost:        { freqs: [523, 659, 784], type: "square"   }, // C5-E5-G5 ascending
      shield:       { freqs: [392, 494, 587], type: "sine"     }, // G4-B4-D5 warm
      emp:          { freqs: [200, 150, 400], type: "sawtooth" }, // harsh buzz
      gravity_well: { freqs: [130, 110, 98 ], type: "triangle" }, // deep rumble
      time_warp:    { freqs: [440, 466, 415], type: "sine"     }, // eerie chromatic cluster
    };

    const cfg = configs[kind] ?? configs.boost;

    cfg.freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = cfg.type;
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const startTime = t + i * 0.07;
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.22);
    });
  }

  /** Play countdown beep. seconds=3,2,1 = low tone; seconds=0 = GO fanfare */
  playCountdown(seconds: number): void {
    if (!this.ctx || !this.masterGain) return;
    if (seconds === 0) {
      this._playGoFanfare();
      return;
    }

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const freq = seconds >= 1 ? 440 : 880;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private _playGoFanfare(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Major chord arpeggio: C5, E5, G5, C6
    [523, 659, 784, 1046].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const st = t + i * 0.05;
      gain.gain.setValueAtTime(0.25, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.4);
    });
  }

  /** Play race finish fanfare */
  playRaceFinish(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Triumphant: C-E-G → F-A-C → G-B-D played in sequence
    const chords = [
      [523, 659, 784],
      [349, 440, 523],
      [392, 494, 587],
    ];

    chords.forEach((chord, ci) => {
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        const st = t + ci * 0.35;
        gain.gain.setValueAtTime(0.2, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.55);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(st);
        osc.stop(st + 0.55);
      });
    });
  }

  /** Clean up all audio resources */
  destroy(): void {
    this.stopEngine();
    if (this._driftTimeout) {
      clearTimeout(this._driftTimeout);
      this._driftTimeout = null;
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.masterGain = null;
  }
}

/** Singleton instance */
export const audioSystem = new AudioSystem();

import { midiToFreq } from "../music/scales.ts";

/**
 * A monophonic 303-flavoured voice:
 *
 *   osc (saw/square) ─▶ lowpass (resonant) ─▶ amp ─▶ engine.input
 *
 * The "acid" comes from the filter envelope: every note snaps the cutoff open
 * and lets it decay back down through a resonant peak — that vocal squelch.
 * Accents hit harder and open the filter wider; slides glide the pitch and keep
 * the gate open so notes bleed into one another (legato), the way a real 303
 * does. One persistent oscillator is automated rather than recreated per note,
 * which is what makes smooth portamento possible.
 */
export class AcidVoice {
  private readonly osc: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly amp: GainNode;

  // Live-tweakable character controls.
  private baseCutoff = 420; // Hz
  private envMod = 0.7; // 0..1, how far the filter envelope opens
  private decay = 0.22; // seconds, envelope decay
  private accentAmount = 0.7; // 0..1
  private level = 0.32; // base voice level

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = 110;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.baseCutoff;
    this.filter.Q.value = 12;

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.osc.connect(this.filter);
    this.filter.connect(this.amp);
    this.amp.connect(destination);

    this.osc.start();
  }

  // --- character controls (safe to call any time) ---------------------------
  setWaveform(type: "sawtooth" | "square"): void {
    this.osc.type = type;
  }
  setCutoff(hz: number): void {
    this.baseCutoff = clamp(hz, 60, 8000);
  }
  setResonance(q: number): void {
    this.filter.Q.value = clamp(q, 0.5, 30);
  }
  setEnvMod(amount: number): void {
    this.envMod = clamp(amount, 0, 1);
  }
  setDecay(seconds: number): void {
    this.decay = clamp(seconds, 0.04, 0.8);
  }
  setAccent(amount: number): void {
    this.accentAmount = clamp(amount, 0, 1);
  }

  /**
   * Schedule a note at audio-clock `time`.
   * @param legato true when the previous step slid into this one — keeps the
   *   gate open and glides the pitch instead of retriggering.
   */
  noteOn(time: number, midi: number, accent: boolean, legato: boolean): void {
    const freq = midiToFreq(midi);
    const accentScale = accent ? 1 + this.accentAmount : 1;
    const slideTime = 0.055;

    // --- pitch ---
    const f = this.osc.frequency;
    f.cancelAndHoldAtTime(time);
    if (legato) {
      f.setTargetAtTime(freq, time, slideTime); // glide
    } else {
      f.setValueAtTime(freq, time);
    }

    // --- filter envelope (the squelch) ---
    const peak = clamp(this.baseCutoff * (1 + this.envMod * (accent ? 5 : 3)), this.baseCutoff, 14000);
    const cut = this.filter.frequency;
    cut.cancelAndHoldAtTime(time);
    if (legato) {
      cut.exponentialRampToValueAtTime(Math.max(peak * 0.85, 1), time + 0.02);
    } else {
      cut.setValueAtTime(Math.max(peak, 1), time);
    }
    cut.exponentialRampToValueAtTime(Math.max(this.baseCutoff, 1), time + this.decay * (accent ? 0.7 : 0.95));

    // --- amp envelope ---
    const g = this.amp.gain;
    const peakGain = this.level * accentScale;
    g.cancelAndHoldAtTime(time);
    if (legato) {
      g.linearRampToValueAtTime(peakGain, time + 0.02);
      g.exponentialRampToValueAtTime(0.0001, time + this.decay * 1.8);
    } else {
      g.linearRampToValueAtTime(peakGain, time + 0.004); // snappy attack
      g.exponentialRampToValueAtTime(0.0001, time + this.decay * 1.2);
    }
  }

  /** Gate off — a rest step. */
  noteOff(time: number): void {
    const g = this.amp.gain;
    g.cancelAndHoldAtTime(time);
    g.setTargetAtTime(0, time, 0.012);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Owns the AudioContext and the shared master chain that every voice runs
 * through:
 *
 *   voice ─▶ drive (waveshaper) ─▶ postGain ─┬─▶ master ─▶ analyser ─▶ out
 *                                            └─▶ delay (feedback) ─▶ master
 *
 * Voices connect to `input`. The engine never assumes the context is running —
 * browsers require a user gesture, so `resume()` is called from the first
 * play/generate interaction.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  /** Voices connect here (head of the drive stage). */
  readonly input: GainNode;
  readonly analyser: AnalyserNode;

  private readonly drive: WaveShaperNode;
  private readonly postGain: GainNode;
  private readonly master: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly delayWet: GainNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });

    this.input = this.ctx.createGain();

    this.drive = this.ctx.createWaveShaper();
    this.drive.oversample = "4x";
    this.setDrive(0.25);

    this.postGain = this.ctx.createGain();
    this.postGain.gain.value = 0.9;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    // Feedback delay for the acid "space".
    this.delay = this.ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.27;
    this.feedback = this.ctx.createGain();
    this.feedback.gain.value = 0.32;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = 0.18;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;

    // Wire it up.
    this.input.connect(this.drive);
    this.drive.connect(this.postGain);

    this.postGain.connect(this.master); // dry
    this.postGain.connect(this.delay); // send
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay); // feedback loop
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.master);

    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  /** Browsers start the context suspended; call on first user gesture. */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setMasterVolume(v: number): void {
    this.master.gain.setTargetAtTime(clamp(v, 0, 1), this.now, 0.01);
  }

  /** 0..1 overdrive amount feeding the waveshaper curve. */
  setDrive(amount: number): void {
    this.drive.curve = makeDriveCurve(clamp(amount, 0, 1));
  }

  /** 0..1 wet level for the feedback delay. */
  setDelayMix(amount: number): void {
    this.delayWet.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.6, this.now, 0.02);
  }

  /** Lock the delay time to the groove (e.g. a dotted 8th of the step grid). */
  setDelayTime(seconds: number): void {
    this.delay.delayTime.setTargetAtTime(clamp(seconds, 0.01, 1.4), this.now, 0.05);
  }
}

/** A soft-clipping curve; `amount` pushes harder into saturation. */
function makeDriveCurve(amount: number) {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 1 + amount * 24; // gentle at 0, gnarly near 1
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

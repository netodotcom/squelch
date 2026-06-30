import type { Pattern, Step } from "./types.ts";

export interface SchedulerOptions {
  /** Audio clock, e.g. () => audioCtx.currentTime. */
  now: () => number;
  /** Current pattern (read fresh each step so live regeneration is seamless). */
  getPattern: () => Pattern;
  /** Called to actually make sound for a step at an exact audio-clock time. */
  onTrigger: (step: Step, index: number, time: number, legato: boolean) => void;
}

/**
 * The "tale of two clocks" sequencer. A coarse `setInterval` (the lookahead)
 * wakes us every 25ms; each wake-up we schedule every step that falls inside
 * the next 100ms directly on the precise audio clock. The JS timer only has to
 * be *roughly* on time — the audio events are sample-accurate.
 *
 * A separate `currentStep()` query lets the render loop highlight the step the
 * listener is actually hearing, accounting for the scheduling lead.
 */
export class Scheduler {
  private readonly opts: SchedulerOptions;

  private bpm = 130;
  private readonly stepsPerBeat = 4; // 16th notes

  private playing = false;
  private timer: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;

  // Queue of (step, time) handed to the visual layer.
  private readonly queue: { index: number; time: number }[] = [];
  private lastDrawn = -1;

  private static readonly LOOKAHEAD_MS = 25;
  private static readonly SCHEDULE_AHEAD = 0.1; // seconds

  constructor(opts: SchedulerOptions) {
    this.opts = opts;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  /** Duration of one 16th-note step in seconds. */
  get secondsPerStep(): number {
    return 60 / this.bpm / this.stepsPerBeat;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.stepIndex = 0;
    this.lastDrawn = -1;
    this.queue.length = 0;
    this.nextStepTime = this.opts.now() + 0.06; // tiny offset to settle
    this.tick();
    this.timer = window.setInterval(() => this.tick(), Scheduler.LOOKAHEAD_MS);
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.queue.length = 0;
    this.lastDrawn = -1;
  }

  toggle(): void {
    this.playing ? this.stop() : this.start();
  }

  /** Schedule every step whose time falls inside the lookahead window. */
  private tick(): void {
    const horizon = this.opts.now() + Scheduler.SCHEDULE_AHEAD;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.stepIndex, this.nextStepTime);
      this.advance();
    }
  }

  private scheduleStep(index: number, time: number): void {
    const pattern = this.opts.getPattern();
    const len = pattern.steps.length;
    if (len === 0) return;
    const i = index % len;
    const step = pattern.steps[i];

    // Legato when the previous *sounding* step slid into this one.
    const prev = pattern.steps[(i - 1 + len) % len];
    const legato = step.on && prev.on && prev.slide;

    this.opts.onTrigger(step, i, time, legato);
    this.queue.push({ index: i, time });
  }

  private advance(): void {
    const len = Math.max(1, this.opts.getPattern().steps.length);
    this.nextStepTime += this.secondsPerStep;
    this.stepIndex = (this.stepIndex + 1) % len;
  }

  /**
   * Which step is sounding *now* — for the playhead highlight. Drains the
   * queue up to the current audio time so the visual matches the ear.
   */
  currentStep(): number {
    const t = this.opts.now();
    while (this.queue.length > 0 && this.queue[0].time <= t) {
      this.lastDrawn = this.queue.shift()!.index;
    }
    return this.lastDrawn;
  }
}

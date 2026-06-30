import "./style.css";
import { AudioEngine } from "./audio/AudioEngine.ts";
import { AcidVoice } from "./audio/AcidVoice.ts";
import { Scheduler } from "./sequencer/Scheduler.ts";
import { generatePattern } from "./sequencer/generator.ts";
import type { GenSettings, Pattern } from "./sequencer/types.ts";
import { ROOTS, SCALES } from "./music/scales.ts";
import { exportPattern, type DawTarget } from "./export/midi.ts";
import { createDeck, type ControlSpec } from "./ui/ui.ts";

// --- audio graph + transport -------------------------------------------------
const engine = new AudioEngine();
const voice = new AcidVoice(engine.ctx, engine.input);

const gen: GenSettings = {
  root: 33, // A1
  scaleId: "minor",
  steps: 16,
  density: 0.7,
  accentChance: 0.35,
  slideChance: 0.3,
  octaves: 2,
};

let bpm = 130;
let pattern: Pattern = generatePattern(gen);

const scheduler = new Scheduler({
  now: () => engine.now,
  getPattern: () => pattern,
  onTrigger: (step, _index, time, legato) => {
    if (step.on) voice.noteOn(time, step.note, step.accent, legato);
    else voice.noteOff(time);
  },
});
scheduler.setBpm(bpm);

// A 3/16 echo locked to the groove gives that rolling acid space.
const syncDelay = () => engine.setDelayTime(scheduler.secondsPerStep * 3);
syncDelay();
engine.setDelayMix(0.3);

// Browsers start the audio clock suspended; every entry point that should make
// sound resumes it first (we're always inside a user gesture here).
const ensureAudio = () => engine.resume();

async function togglePlay(): Promise<void> {
  await ensureAudio();
  scheduler.toggle();
  deck.setPlaying(scheduler.isPlaying);
}

function generate(): void {
  // Generating is pure and instant — never block it on the audio clock.
  // Prime the context on this gesture (fire-and-forget) so playback is ready.
  void ensureAudio();
  pattern = generatePattern(gen);
  deck.renderPattern(pattern);
}

function setBpm(v: number): void {
  bpm = v;
  scheduler.setBpm(v);
  syncDelay();
}

function exportTo(target: DawTarget): void {
  const name = exportPattern(pattern, bpm, target);
  const where = target === "ableton" ? "Ableton" : "FL Studio";
  deck.toast(`↓ ${name} — drop it into ${where}`);
}

/** Mutate a generation setting and immediately reroll so the change is heard. */
function applyGen(mutate: () => void): void {
  mutate();
  pattern = generatePattern(gen);
  deck.renderPattern(pattern);
}

// --- control specs -----------------------------------------------------------
const pct = (v: number) => `${Math.round(v * 100)}%`;

const soundControls: ControlSpec[] = [
  { kind: "slider", key: "cutoff", label: "Cutoff", min: 60, max: 4000, step: 1, value: 420, format: (v) => `${Math.round(v)} Hz`, onInput: (v) => voice.setCutoff(v) },
  { kind: "slider", key: "reso", label: "Reso", min: 1, max: 28, step: 0.5, value: 12, format: (v) => v.toFixed(1), onInput: (v) => voice.setResonance(v) },
  { kind: "slider", key: "env", label: "Env Mod", min: 0, max: 1, step: 0.01, value: 0.7, format: pct, onInput: (v) => voice.setEnvMod(v) },
  { kind: "slider", key: "decay", label: "Decay", min: 40, max: 800, step: 5, value: 220, format: (v) => `${Math.round(v)} ms`, onInput: (v) => voice.setDecay(v / 1000) },
  { kind: "slider", key: "accent", label: "Accent", min: 0, max: 1, step: 0.01, value: 0.7, format: pct, onInput: (v) => voice.setAccent(v) },
  { kind: "slider", key: "drive", label: "Drive", min: 0, max: 1, step: 0.01, value: 0.25, format: pct, onInput: (v) => engine.setDrive(v) },
  { kind: "slider", key: "delay", label: "Delay", min: 0, max: 1, step: 0.01, value: 0.3, format: pct, onInput: (v) => engine.setDelayMix(v) },
  { kind: "slider", key: "volume", label: "Volume", min: 0, max: 1, step: 0.01, value: 0.85, format: pct, onInput: (v) => engine.setMasterVolume(v) },
  { kind: "seg", key: "wave", label: "Wave", value: "sawtooth", options: [{ value: "sawtooth", label: "SAW" }, { value: "square", label: "SQR" }], onInput: (v) => voice.setWaveform(v as "sawtooth" | "square") },
];

const genControls: ControlSpec[] = [
  { kind: "select", key: "scale", label: "Scale", value: gen.scaleId, options: SCALES.map((s) => ({ value: s.id, label: s.name })), onInput: (v) => applyGen(() => (gen.scaleId = v)) },
  { kind: "select", key: "root", label: "Key", value: String(gen.root), options: ROOTS.map((r) => ({ value: String(r.id), label: r.name })), onInput: (v) => applyGen(() => (gen.root = Number(v))) },
  { kind: "select", key: "steps", label: "Steps", value: String(gen.steps), options: [8, 16, 24, 32].map((n) => ({ value: String(n), label: String(n) })), onInput: (v) => applyGen(() => (gen.steps = Number(v))) },
  { kind: "slider", key: "density", label: "Density", min: 0.2, max: 1, step: 0.01, value: gen.density, format: pct, onInput: (v) => applyGen(() => (gen.density = v)) },
  { kind: "slider", key: "accents", label: "Accents", min: 0, max: 1, step: 0.01, value: gen.accentChance, format: pct, onInput: (v) => applyGen(() => (gen.accentChance = v)) },
  { kind: "slider", key: "slides", label: "Slides", min: 0, max: 1, step: 0.01, value: gen.slideChance, format: pct, onInput: (v) => applyGen(() => (gen.slideChance = v)) },
  { kind: "select", key: "octaves", label: "Octaves", value: String(gen.octaves), options: [1, 2, 3].map((n) => ({ value: String(n), label: String(n) })), onInput: (v) => applyGen(() => (gen.octaves = Number(v))) },
];

// --- mount UI ----------------------------------------------------------------
const mount = document.getElementById("app")!;
const deck = createDeck(mount, {
  soundControls,
  genControls,
  initialBpm: bpm,
  analyser: engine.analyser,
  getPlayhead: () => scheduler.currentStep(),
  onTogglePlay: () => void togglePlay(),
  onGenerate: () => void generate(),
  onBpm: setBpm,
  onExport: exportTo,
});
deck.renderPattern(pattern);

// --- keyboard: space = play/stop, G = new line -------------------------------
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Space") {
    e.preventDefault();
    void togglePlay();
  } else if (e.key === "g" || e.key === "G") {
    e.preventDefault();
    void generate();
  }
});

import type { Pattern } from "../sequencer/types.ts";

/**
 * Standard MIDI File (SMF) export.
 *
 * Both Ableton Live and FL Studio import `.mid` natively, so a well-formed SMF
 * is the reliable interchange format (hand-rolling .als / .flp project files is
 * version-fragile and not worth it). We encode the acid line so it lands
 * musically in either DAW:
 *
 *   - timing  : a 16th-note grid (PPQ 96 → 24 ticks per step), so 16 steps make
 *               a clean one-bar loop at 4/4.
 *   - accent  : note velocity (accented = 118, normal = 92).
 *   - slide   : the note's gate overlaps into the next step (legato). On a mono
 *               / portamento instrument — exactly what you'd use for a 303 line —
 *               overlapping notes trigger the glide. Non-slid notes are plucky
 *               (half-step gate).
 *   - tempo   : embedded as a meta event (Type-1 conductor track) so the clip
 *               imports at the right BPM.
 */

const PPQ = 96; // ticks per quarter note
const STEP_TICKS = PPQ / 4; // a 16th note = 24 ticks
const SLIDE_OVERLAP = 8; // ticks a slid note bleeds into the next (glide)
const VEL_ACCENT = 118;
const VEL_NORMAL = 92;
const GM_SYNTH_BASS = 38; // a sensible default if dropped on a GM instrument

export interface MidiOptions {
  /** Name written to the note track (shows up in both DAWs). */
  trackName: string;
}

export function encodePatternToMidi(pattern: Pattern, bpm: number, opts: MidiOptions): Uint8Array<ArrayBuffer> {
  const steps = pattern.steps;
  const endTick = Math.max(STEP_TICKS, steps.length * STEP_TICKS);

  // --- conductor track: tempo + time signature ---
  const usPerQuarter = Math.round(60_000_000 / clamp(bpm, 20, 400));
  const conductor: TrackEvent[] = [
    { tick: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff] },
    { tick: 0, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] }, // 4/4
  ];

  // --- note track ---
  const notes: TrackEvent[] = [
    { tick: 0, data: [0xff, 0x03, ...vlq(opts.trackName.length), ...ascii(opts.trackName)] },
    { tick: 0, data: [0xc0, GM_SYNTH_BASS] }, // program change
  ];

  steps.forEach((step, i) => {
    if (!step.on) return;
    const start = i * STEP_TICKS;
    const gate = step.slide ? STEP_TICKS + SLIDE_OVERLAP : Math.round(STEP_TICKS * 0.5);
    const off = Math.min(start + gate, endTick);
    const note = step.note & 0x7f;
    const vel = step.accent ? VEL_ACCENT : VEL_NORMAL;
    notes.push({ tick: start, data: [0x90, note, vel] }); // note on
    notes.push({ tick: off, data: [0x80, note, 0] }); // note off
  });

  const bytes = [
    ...chunk("MThd", [0x00, 0x01, 0x00, 0x02, (PPQ >> 8) & 0xff, PPQ & 0xff]),
    ...trackChunk(conductor, endTick),
    ...trackChunk(notes, endTick),
  ];
  return new Uint8Array(bytes);
}

interface TrackEvent {
  tick: number;
  data: number[];
}

/** Lower rank sorts earlier when two events share a tick. */
function rank(status: number): number {
  if (status === 0xff || status === 0xc0) return 0; // meta / program first
  if (status === 0x80) return 1; // note-off before note-on
  return 2; // note-on
}

function trackChunk(events: TrackEvent[], endTick: number): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || rank(a.data[0]) - rank(b.data[0]));
  const out: number[] = [];
  let prev = 0;
  for (const ev of sorted) {
    out.push(...vlq(ev.tick - prev), ...ev.data);
    prev = ev.tick;
  }
  out.push(...vlq(Math.max(0, endTick - prev)), 0xff, 0x2f, 0x00); // End of Track
  return chunk("MTrk", out);
}

function chunk(id: string, data: number[]): number[] {
  const len = data.length;
  return [...ascii(id), (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...data];
}

/** Variable-length quantity (MIDI delta-time encoding). */
function vlq(value: number): number[] {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0) & 0x7f);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// --- download helpers --------------------------------------------------------
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export type DawTarget = "ableton" | "fl-studio";

const DAW_LABEL: Record<DawTarget, string> = {
  ableton: "Ableton Live",
  "fl-studio": "FL Studio",
};

/** Build the MIDI, trigger a download, and return the chosen file name. */
export function exportPattern(pattern: Pattern, bpm: number, target: DawTarget): string {
  const bytes = encodePatternToMidi(pattern, bpm, {
    trackName: `squelch acid (${DAW_LABEL[target]})`,
  });
  const name = `squelch_${slug(pattern.rootName)}-${slug(pattern.scaleName)}_${Math.round(bpm)}bpm_${target}.mid`;
  downloadBytes(bytes, name);
  return name;
}

function downloadBytes(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

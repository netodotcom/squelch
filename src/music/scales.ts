/**
 * Minimal music theory needed for acid lines: scale tables, MIDI helpers and
 * note naming. Kept pure (no audio, no DOM) so it can be reasoned about and
 * reused by the generator and the UI alike.
 */

export interface Scale {
  id: string;
  name: string;
  /** Semitone offsets from the root, ascending within one octave. */
  intervals: number[];
}

// Scales that give that hypnotic acid/techno colour. Phrygian and the minor
// flavours are the classic 303 territory; major is here for brighter jams.
export const SCALES: Scale[] = [
  { id: "minor", name: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "phrygian", name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: "minorPenta", name: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] },
  { id: "dorian", name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "harmonicMinor", name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: "major", name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Root choices, expressed as MIDI numbers in a low bass octave. */
export const ROOTS = [
  { id: 33, name: "A1" },
  { id: 34, name: "A#1" },
  { id: 35, name: "B1" },
  { id: 36, name: "C2" },
  { id: 37, name: "C#2" },
  { id: 38, name: "D2" },
  { id: 39, name: "D#2" },
  { id: 40, name: "E2" },
  { id: 41, name: "F2" },
  { id: 42, name: "F#2" },
  { id: 43, name: "G2" },
  { id: 44, name: "G#2" },
];

/** Equal-tempered frequency for a MIDI note (A4 = 69 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Human-readable note name, e.g. 45 -> "A2". */
export function midiToName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function getScale(id: string): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

/**
 * Build a ladder of MIDI notes from a root across `octaves` octaves of the
 * given scale. Returns a flat ascending array the generator can index into.
 */
export function scaleNotes(root: number, scale: Scale, octaves: number): number[] {
  const notes: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const interval of scale.intervals) {
      notes.push(root + o * 12 + interval);
    }
  }
  return notes;
}

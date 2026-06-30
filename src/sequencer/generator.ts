import { getScale, midiToName, scaleNotes } from "../music/scales.ts";
import type { GenSettings, Pattern, Step } from "./types.ts";

/**
 * Generate an acid line.
 *
 * A purely random sequence sounds like noise; a 303 line sounds *intentional*.
 * So this is a biased random walk over a scale ladder: it keeps gravitating
 * back to the root, mostly takes small melodic steps, occasionally leaps an
 * octave (the signature acid move), and sprinkles accents and slides. The
 * downbeat is always gated so the loop has an anchor the ear can lock onto.
 *
 * `rng` is injectable so the behaviour is testable and reproducible.
 */
export function generatePattern(s: GenSettings, rng: () => number = Math.random): Pattern {
  const scale = getScale(s.scaleId);
  const ladder = scaleNotes(s.root, scale, Math.max(1, s.octaves));
  const rootIndex = 0; // root is the first entry of the ladder

  const steps: Step[] = [];
  // Start mid-ladder (root, an octave up) so the walk has room to move in both
  // directions instead of bottoming out on the lowest note.
  let index = Math.min(scaleDegreesPerOctave(ladder.length), ladder.length - 1);

  for (let i = 0; i < s.steps; i++) {
    const downbeat = i % 4 === 0;
    // Density gates the step; the very first step is always on as an anchor.
    const on = i === 0 ? true : rng() < s.density;

    if (i === 0) {
      index = rootIndex; // the "one" lands on the root — a stable anchor
    } else if (on) {
      index = nextNote(index, ladder.length, rootIndex, downbeat, rng);
    }

    // Accents fall a little more readily on the downbeats — that pumping feel.
    const accentBias = downbeat ? 0.18 : 0;
    const accent = on && rng() < clamp01(s.accentChance + accentBias);
    const slide = on && rng() < s.slideChance;

    steps.push({ on, note: ladder[index], accent, slide });
  }

  // Guard against a near-silent reroll feeling broken: ensure a few hits.
  ensureMinimumActivity(steps, ladder, rng);

  return {
    steps,
    rootName: midiToName(s.root),
    scaleName: scale.name,
  };
}

/** Pick the next ladder index with root-gravity, small steps and octave leaps. */
function nextNote(
  current: number,
  ladderLen: number,
  rootIndex: number,
  downbeat: boolean,
  rng: () => number,
): number {
  const deg = scaleDegreesPerOctave(ladderLen);
  const roll = rng();
  const rootSnap = downbeat ? 0.36 : 0.18;
  // Gravitate to a root — sometimes the upper octave, for that acid bounce.
  if (roll < rootSnap) {
    const up = rootIndex + deg;
    return up < ladderLen && rng() < 0.5 ? up : rootIndex;
  }
  // Octave leap — the classic 303 jump.
  if (roll < rootSnap + 0.16) {
    const dir = rng() < 0.5 ? -1 : 1;
    return clampIndex(current + dir * deg, ladderLen);
  }
  // Otherwise a melodic step, weighted toward small moves but free to wander.
  const deltas = [-3, -2, -1, -1, 1, 1, 2, 3];
  const delta = deltas[Math.floor(rng() * deltas.length)];
  return clampIndex(current + delta, ladderLen);
}

/** Rough number of scale degrees that make up an octave for this ladder. */
function scaleDegreesPerOctave(ladderLen: number): number {
  // Ladders are built octave-by-octave, so this is exact when octaves >= 1.
  return ladderLen >= 7 ? 7 : ladderLen;
}

function ensureMinimumActivity(steps: Step[], ladder: number[], rng: () => number): void {
  const active = steps.filter((st) => st.on).length;
  const minHits = Math.max(3, Math.floor(steps.length / 4));
  if (active >= minHits) return;
  // Sprinkle a few more notes on so a low-density roll still grooves.
  let guard = steps.length * 2;
  while (steps.filter((st) => st.on).length < minHits && guard-- > 0) {
    const i = Math.floor(rng() * steps.length);
    if (!steps[i].on) {
      steps[i] = {
        on: true,
        note: ladder[Math.floor(rng() * ladder.length)],
        accent: rng() < 0.3,
        slide: rng() < 0.3,
      };
    }
  }
}

function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len - 1, i));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

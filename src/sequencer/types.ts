/** One step of the acid line. A 303 step is more than a note: its character
 *  comes from whether it's gated, accented, and whether it slides into the next. */
export interface Step {
  /** Whether the step sounds at all (false = rest / gate off). */
  on: boolean;
  /** MIDI note. Only meaningful when `on` is true. */
  note: number;
  /** Accented steps hit harder and open the filter wider. */
  accent: boolean;
  /** Slide glides pitch into the next step and keeps the gate open (legato). */
  slide: boolean;
}

export interface Pattern {
  steps: Step[];
  /** Echo of the settings that produced this pattern (handy for the UI). */
  rootName: string;
  scaleName: string;
}

/** Tunable knobs for generation — mirrors Sting's density / length / accents. */
export interface GenSettings {
  root: number;
  scaleId: string;
  steps: number;
  /** 0..1 — chance a step is gated on (the "density" control). */
  density: number;
  /** 0..1 — chance a gated step is accented. */
  accentChance: number;
  /** 0..1 — chance a gated step slides into the next. */
  slideChance: number;
  /** How many octaves of the scale notes may span. */
  octaves: number;
}

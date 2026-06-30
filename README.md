# squelch

A playful little web tool for sketching **acid basslines** — inspired by the
[Sting](https://www.ableton.com/en/blog/sting-free-acid-pattern-generator-skinnerbox/)
device for Ableton, but built for the browser. Hit the smile, get a fresh
303-style line, and jam.

The focus is on the **sequence generation** and the squelchy acid feel — not a
pixel-perfect 303 clone.

## Play

- **Space** — start / stop playback
- **G** or the **☻ smile button** — generate a new line (rerolls with the
  current settings)
- Tweak **Sound** (cutoff, resonance, env mod, decay, accent, drive, delay) and
  **Generate** (scale, key, steps, density, accents, slides, octaves) live —
  the loop updates on the next step, no stutter.

The current step lights up, accents glow amber, and slides show a magenta
connector to the next note, so you can *see* what you're hearing.

## Export to your DAW

Two buttons under the grid export the current line as a **Standard MIDI File**
— the format both DAWs import natively. Accents become note velocity, slides
become overlapping (legato) notes so a mono/portamento synth glides, and the
tempo is embedded so it drops in at the right BPM (16 steps = one clean bar).

- **Ableton Live** — drag the `.mid` onto a MIDI track (or *Create → Import MIDI
  File…*). Point the track at a synth (Operator/Analog with mono + glide for the
  303 feel). Live will offer to import the embedded tempo.
- **FL Studio** — *File → Import → MIDI file* (Ctrl+M), or drag the `.mid` into
  the Channel Rack / Playlist and pick a channel in the *Import MIDI data*
  dialog. The notes land in the Piano Roll; for slides, use a mono instrument
  with portamento.

## Run

```bash
npm install
npm run dev      # open the printed localhost URL
npm run build    # static bundle in dist/, deployable anywhere
```

## How it works

- **Timing** — a lookahead scheduler ("a tale of two clocks"): a coarse 25 ms
  `setInterval` schedules notes ~100 ms ahead on the sample-accurate
  `AudioContext` clock, so the groove never jitters.
- **Voice** — one persistent oscillator → resonant lowpass → amp. Each note
  fires a filter envelope (the squelch); accents hit harder and open the filter
  wider; slides glide the pitch and keep the gate open (legato).
- **Generation** — a biased random walk over a scale ladder with root-gravity,
  small melodic steps, occasional octave leaps, and sprinkled accents/slides —
  so lines feel intentional, not random.

## Structure

```
src/
  audio/       AudioEngine (master chain) · AcidVoice (the 303 voice)
  sequencer/   Scheduler (transport) · generator · types
  music/       scales & MIDI helpers
  export/      Standard MIDI File writer (Ableton / FL Studio)
  ui/          DOM rendering, controls, playhead + scope
  main.ts      composition root
```

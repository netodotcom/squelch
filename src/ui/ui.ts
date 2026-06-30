import { midiToName } from "../music/scales.ts";
import type { Pattern } from "../sequencer/types.ts";
import type { DawTarget } from "../export/midi.ts";

/** Declarative control specs — `main` owns the ranges and handlers, the UI
 *  only knows how to render them. Keeps the view layer free of app logic. */
export type ControlSpec =
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
      format: (v: number) => string;
      onInput: (v: number) => void;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      value: string;
      onInput: (v: string) => void;
    }
  | {
      kind: "seg";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      value: string;
      onInput: (v: string) => void;
    };

export interface DeckConfig {
  soundControls: ControlSpec[];
  genControls: ControlSpec[];
  initialBpm: number;
  analyser: AnalyserNode;
  /** Step index currently sounding, or -1 when idle. */
  getPlayhead: () => number;
  onTogglePlay: () => void;
  onGenerate: () => void;
  onBpm: (bpm: number) => void;
  onExport: (target: DawTarget) => void;
}

export interface Deck {
  renderPattern: (pattern: Pattern) => void;
  setPlaying: (playing: boolean) => void;
  toast: (message: string) => void;
}

const SMILE_SVG = `
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <circle class="face" cx="20" cy="20" r="16" />
    <circle class="eye" cx="14" cy="16" r="2.2" />
    <circle class="eye" cx="26" cy="16" r="2.2" />
    <path class="face" d="M12 24 Q20 32 28 24" />
  </svg>`;

export function createDeck(mount: HTMLElement, config: DeckConfig): Deck {
  mount.innerHTML = `
    <div class="deck">
      <header class="topbar">
        <div class="brand">
          <h1>squelch</h1>
          <p>acid bassline sketch</p>
        </div>
        <div class="transport">
          <button class="btn play" id="play" title="Play / stop (Space)">▶</button>
          <div class="tempo">
            <label>Tempo</label>
            <input type="range" id="bpm" min="80" max="180" step="1" value="${config.initialBpm}" />
            <output id="bpmVal">${config.initialBpm} BPM</output>
          </div>
          <button class="btn generate" id="generate" title="New line (G)">${SMILE_SVG}</button>
        </div>
        <div class="hint">SPACE play / stop · G or ☻ new line</div>
      </header>

      <section class="stage">
        <div class="patmeta">
          <span id="patKey">—</span>
          <span id="patLen"></span>
        </div>
        <div class="steps" id="steps"></div>
        <canvas class="scope" id="scope"></canvas>
        <div class="exportbar">
          <span class="exlabel">Export bassline →</span>
          <button class="btn export" id="exportAbleton">Ableton</button>
          <button class="btn export" id="exportFL">FL Studio</button>
          <span class="exhint">Standard MIDI · drop the .mid on a MIDI / instrument track</span>
        </div>
      </section>
      <div class="toast" id="toast"></div>

      <section class="panels">
        <div class="panel">
          <h2>sound</h2>
          <div class="knobs" id="soundKnobs"></div>
        </div>
        <div class="panel">
          <h2>generate</h2>
          <div class="knobs" id="genKnobs"></div>
        </div>
      </section>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => mount.querySelector(sel) as T;

  const playBtn = $<HTMLButtonElement>("#play");
  const genBtn = $<HTMLButtonElement>("#generate");
  const bpmInput = $<HTMLInputElement>("#bpm");
  const bpmVal = $<HTMLOutputElement>("#bpmVal");
  const stepsEl = $<HTMLDivElement>("#steps");
  const patKey = $<HTMLSpanElement>("#patKey");
  const patLen = $<HTMLSpanElement>("#patLen");
  const scope = $<HTMLCanvasElement>("#scope");

  // Blur after click so the button doesn't keep keyboard focus and re-fire on
  // the next Space/G (which we handle globally).
  playBtn.addEventListener("click", () => {
    config.onTogglePlay();
    playBtn.blur();
  });
  genBtn.addEventListener("click", () => {
    config.onGenerate();
    genBtn.blur();
  });

  const exAbleton = $<HTMLButtonElement>("#exportAbleton");
  const exFL = $<HTMLButtonElement>("#exportFL");
  exAbleton.addEventListener("click", () => {
    config.onExport("ableton");
    exAbleton.blur();
  });
  exFL.addEventListener("click", () => {
    config.onExport("fl-studio");
    exFL.blur();
  });
  bpmInput.addEventListener("input", () => {
    const v = Number(bpmInput.value);
    bpmVal.textContent = `${v} BPM`;
    config.onBpm(v);
  });

  renderControls($<HTMLDivElement>("#soundKnobs"), config.soundControls);
  renderControls($<HTMLDivElement>("#genKnobs"), config.genControls);

  // --- pattern grid ----------------------------------------------------------
  let cells: HTMLDivElement[] = [];
  let activeIdx = -1;

  function renderPattern(pattern: Pattern): void {
    const ons = pattern.steps.filter((s) => s.on).map((s) => s.note);
    const min = ons.length ? Math.min(...ons) : 0;
    const max = ons.length ? Math.max(...ons) : 1;
    const span = Math.max(1, max - min);

    stepsEl.innerHTML = "";
    cells = pattern.steps.map((step, i) => {
      const cell = document.createElement("div");
      cell.className = "step";
      if (i % 4 === 0) cell.classList.add("beat");
      if (!step.on) cell.classList.add("rest");
      if (step.on && step.accent) cell.classList.add("accent");
      if (step.on && step.slide) cell.classList.add("slide");

      const h = step.on ? 30 + ((step.note - min) / span) * 70 : 12;
      cell.innerHTML = `
        <div class="bar" style="height:${h}%"></div>
        <span class="note">${step.on ? midiToName(step.note) : "·"}</span>`;
      stepsEl.appendChild(cell);
      return cell;
    });

    activeIdx = -1;
    patKey.innerHTML = `<b>${pattern.rootName}</b> ${pattern.scaleName}`;
    patLen.textContent = `${pattern.steps.length} steps`;
  }

  function setPlaying(playing: boolean): void {
    playBtn.classList.toggle("playing", playing);
    playBtn.textContent = playing ? "■" : "▶";
  }

  const toastEl = $<HTMLDivElement>("#toast");
  let toastTimer = 0;
  function toast(message: string): void {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // --- animation loop: playhead + oscilloscope -------------------------------
  const ctx2d = scope.getContext("2d")!;
  const scopeData = new Uint8Array(config.analyser.fftSize);

  function resizeScope(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = scope.getBoundingClientRect();
    scope.width = Math.max(1, Math.floor(rect.width * dpr));
    scope.height = Math.max(1, Math.floor(rect.height * dpr));
  }
  resizeScope();
  window.addEventListener("resize", resizeScope);

  function frame(): void {
    // playhead
    const idx = config.getPlayhead();
    if (idx !== activeIdx) {
      if (cells[activeIdx]) cells[activeIdx].classList.remove("playing");
      if (idx >= 0 && cells[idx]) cells[idx].classList.add("playing");
      activeIdx = idx;
    }

    // oscilloscope
    config.analyser.getByteTimeDomainData(scopeData);
    const w = scope.width;
    const h = scope.height;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.lineWidth = Math.max(1, (window.devicePixelRatio || 1) * 1.4);
    ctx2d.strokeStyle = "#c6ff3a";
    ctx2d.shadowColor = "rgba(198,255,58,0.6)";
    ctx2d.shadowBlur = 8;
    ctx2d.beginPath();
    const slice = w / scopeData.length;
    for (let i = 0; i < scopeData.length; i++) {
      const y = (scopeData[i] / 255) * h;
      const x = i * slice;
      i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
    }
    ctx2d.stroke();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { renderPattern, setPlaying, toast };
}

function renderControls(container: HTMLElement, specs: ControlSpec[]): void {
  for (const spec of specs) {
    const wrap = document.createElement("div");
    wrap.className = "knob";

    if (spec.kind === "slider") {
      wrap.innerHTML = `
        <div class="row">
          <label>${spec.label}</label>
          <span class="val">${spec.format(spec.value)}</span>
        </div>
        <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.value}" />`;
      const input = wrap.querySelector("input")!;
      const val = wrap.querySelector(".val")!;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        val.textContent = spec.format(v);
        spec.onInput(v);
      });
    } else if (spec.kind === "select") {
      wrap.innerHTML = `<label>${spec.label}</label>`;
      const select = document.createElement("select");
      for (const o of spec.options) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === spec.value) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => spec.onInput(select.value));
      wrap.appendChild(select);
    } else {
      wrap.innerHTML = `<label>${spec.label}</label>`;
      const seg = document.createElement("div");
      seg.className = "seg";
      for (const o of spec.options) {
        const b = document.createElement("button");
        b.textContent = o.label;
        if (o.value === spec.value) b.classList.add("active");
        b.addEventListener("click", () => {
          seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          spec.onInput(o.value);
        });
        seg.appendChild(b);
      }
      wrap.appendChild(seg);
    }
    container.appendChild(wrap);
  }
}

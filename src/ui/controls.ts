import type { SignPlayer } from "../player/SignPlayer";
import type { SignLibrary } from "../signs/library";
import { translate, type Lexicon } from "../engine/translate";

/**
 * Bottom control bar: text input (engine), gloss-sequence input, transport
 * buttons, speed slider, active-gloss indicator, and the panel of
 * available glosses.
 *
 * The gloss input is the renderer's native language; the text input above
 * it runs the rule-based engine and writes its output INTO the gloss
 * input before playing, so the text -> gloss -> sign seam stays visible.
 */
export function createControls(player: SignPlayer, library: SignLibrary, lexicon: Lexicon | null): void {
  const bar = document.createElement("div");
  bar.className = "controls";

  // ---- row 0: natural-language input -> engine ----
  const textRow = document.createElement("div");
  textRow.className = "ctl-row";

  const textInput = document.createElement("input");
  textInput.className = "ctl-input text";
  textInput.placeholder = "English or Urdu text — translated to glosses, then signed";
  textInput.spellcheck = false;
  textInput.dir = "auto";

  const translateBtn = button("Translate ▸", "ctl-btn");
  textRow.append(textInput, translateBtn);

  // ---- row 1: input + transport ----
  const inputRow = document.createElement("div");
  inputRow.className = "ctl-row";

  const input = document.createElement("input");
  input.className = "ctl-input";
  input.placeholder = 'Gloss sequence — e.g. HELLO A L I (unknown glosses are fingerspelled)';
  input.spellcheck = false;
  input.dir = "auto"; // Urdu glosses render right-to-left
  input.value = "HELLO A L I";

  const playBtn = button("Play", "ctl-btn primary");
  const pauseBtn = button("Pause", "ctl-btn");
  const stopBtn = button("Stop", "ctl-btn");
  const replayBtn = button("Replay", "ctl-btn");

  inputRow.append(input, playBtn, pauseBtn, stopBtn, replayBtn);

  // ---- row 2: speed + active gloss ----
  const speedRow = document.createElement("div");
  speedRow.className = "ctl-row";

  const speedLabel = document.createElement("span");
  speedLabel.className = "ctl-label";
  speedLabel.textContent = "Speed";

  const speed = document.createElement("input");
  speed.type = "range";
  speed.className = "ctl-slider";
  speed.min = "0.25";
  speed.max = "2";
  speed.step = "0.05";
  speed.value = "1";

  const speedValue = document.createElement("span");
  speedValue.className = "ctl-label mono";
  speedValue.textContent = "1.00×";

  const glossBadge = document.createElement("span");
  glossBadge.className = "ctl-gloss";

  speedRow.append(speedLabel, speed, speedValue, glossBadge);

  // ---- row 3: available glosses ----
  const panel = document.createElement("div");
  panel.className = "ctl-glosses";
  const chips = new Map<string, HTMLButtonElement>();

  const defs = library.list().sort((a, b) => {
    if (a.type !== b.type) return a.type === "word" ? -1 : 1;
    return a.gloss.localeCompare(b.gloss);
  });
  for (const def of defs) {
    const chip = button(def.gloss, `ctl-chip ${def.type}`);
    chip.title = `${def.type} — click to add`;
    chip.addEventListener("click", () => {
      input.value = `${input.value.trim()} ${def.gloss}`.trim();
      input.focus();
    });
    chips.set(def.gloss, chip);
    panel.appendChild(chip);
  }

  if (lexicon) bar.append(textRow);
  bar.append(inputRow, speedRow, panel);
  document.body.appendChild(bar);

  // ---- behavior ----
  const parse = () => input.value.trim().split(/\s+/).filter(Boolean);

  const doPlay = () => {
    const seq = parse();
    if (seq.length > 0) void player.play(seq);
  };
  playBtn.addEventListener("click", doPlay);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doPlay();
  });

  const doTranslate = () => {
    if (!lexicon) return;
    const text = textInput.value.trim();
    if (!text) return;
    const { glosses, trace } = translate(text, lexicon);
    console.info(`[engine] "${text}" ->`, glosses, trace);
    if (glosses.length === 0) return;
    input.value = glosses.join(" ");
    doPlay();
  };
  translateBtn.addEventListener("click", doTranslate);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doTranslate();
  });

  pauseBtn.addEventListener("click", () => {
    if (player.state === "paused") player.resume();
    else player.pause();
  });

  stopBtn.addEventListener("click", () => player.stop());
  replayBtn.addEventListener("click", () => void player.replay());

  speed.addEventListener("input", () => {
    const value = parseFloat(speed.value);
    player.setSpeed(value);
    speedValue.textContent = `${value.toFixed(2)}×`;
  });

  let activeChip: HTMLButtonElement | null = null;
  player.onGlossChange = (gloss) => {
    glossBadge.textContent = gloss ? `Signing: ${gloss}` : "";
    activeChip?.classList.remove("active");
    activeChip = gloss ? (chips.get(gloss) ?? null) : null;
    activeChip?.classList.add("active");
  };

  // Keep transport buttons in sync with player state.
  setInterval(() => {
    const state = player.state;
    pauseBtn.disabled = state === "idle";
    pauseBtn.textContent = state === "paused" ? "Resume" : "Pause";
    stopBtn.disabled = state === "idle";
    replayBtn.disabled = !player.hasPlayed || state !== "idle";
  }, 150);
}

function button(label: string, className: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.className = className;
  el.textContent = label;
  return el;
}

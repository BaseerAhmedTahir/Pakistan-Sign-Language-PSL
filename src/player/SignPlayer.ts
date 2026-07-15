import * as THREE from "three";
import type { LoadedAvatar } from "../avatar/loadAvatar";
import type { SignLibrary, SignDef } from "../signs/library";

/** One scheduled sign in a resolved sequence. */
interface PlayItem {
  /** Display label — the letter itself when fingerspelling. */
  gloss: string;
  def: SignDef;
  fadeS: number;
  holdS: number;
}

interface ActiveSequence {
  items: PlayItem[];
  index: number;
  /** "sign": clip playing; "hold": clamped on last frame; "toRest": final fade. */
  phase: "sign" | "hold" | "toRest";
  phaseElapsedS: number;
  action: THREE.AnimationAction | null;
  resolve: () => void;
}

export type PlayerState = "idle" | "playing" | "paused";

const GRAPHEME_SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Split into grapheme clusters (falls back to code points). */
function graphemes(text: string): string[] {
  if (GRAPHEME_SEGMENTER) {
    return [...GRAPHEME_SEGMENTER.segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Plays gloss sequences on the avatar. The renderer's single public entry
 * point (the future translation engine only ever calls `play`).
 *
 * One timeline drives two channels every frame, in this order:
 *   1. skeletal: AnimationMixer over the avatar's animation targets
 *   2. facial:   expression weights ramped toward the current sign's `nmf`
 * The caller must run `player.update(delta)` BEFORE `avatar.update(delta)`
 * each frame — three-vrm propagates normalized bones and expression values
 * to the skinned mesh inside `vrm.update`.
 *
 * Rest is a real clip cross-faded like any other transition (no direct
 * bone writes), so returning to neutral uses the same blend math as
 * sign-to-sign transitions.
 */
export class SignPlayer {
  onGlossChange: ((gloss: string | null) => void) | null = null;

  private readonly mixer: THREE.AnimationMixer;
  private readonly avatar: LoadedAvatar;
  private readonly library: SignLibrary;

  private speed = 1;
  private paused = false;
  private activeAction: THREE.AnimationAction;
  private seq: ActiveSequence | null = null;
  private lastSequence: string[] = [];

  /** Expression channel state: name -> weight. */
  private exprCurrent = new Map<string, number>();
  private exprTarget = new Map<string, number>();
  private exprRampS = 0.25;
  private warnedNoExpressions = false;

  constructor(avatar: LoadedAvatar, library: SignLibrary) {
    this.avatar = avatar;
    this.library = library;
    this.mixer = new THREE.AnimationMixer(avatar.animationRoot);

    const restAction = this.mixer.clipAction(library.rest.clip);
    restAction.setLoop(THREE.LoopRepeat, Infinity);
    restAction.play();
    this.activeAction = restAction;
  }

  get state(): PlayerState {
    if (this.paused) return "paused";
    return this.seq ? "playing" : "idle";
  }

  get currentSpeed(): number {
    return this.speed;
  }

  /** True once a sequence has been played (enables Replay in the UI). */
  get hasPlayed(): boolean {
    return this.lastSequence.length > 0;
  }

  /**
   * Play a gloss sequence. Known glosses play their clip; unknown glosses
   * are fingerspelled letter-by-letter. Resolves once the avatar is back
   * at rest. Calling while already playing cancels the running sequence
   * and starts the new one from the current pose.
   */
  play(glossSequence: string[]): Promise<void> {
    this.cancelCurrent();
    this.lastSequence = [...glossSequence];

    const items = glossSequence.flatMap((g) => this.resolveGloss(g));
    if (items.length === 0) {
      console.warn("[player] nothing playable in sequence", glossSequence);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.seq = { items, index: -1, phase: "sign", phaseElapsedS: 0, action: null, resolve };
      this.advance();
    });
  }

  replay(): Promise<void> {
    return this.play(this.lastSequence);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Playback speed multiplier (scales clips, fades and holds uniformly). */
  setSpeed(speed: number): void {
    this.speed = THREE.MathUtils.clamp(speed, 0.1, 3);
  }

  /** Cancel any running sequence and ease back to rest. */
  stop(): void {
    this.paused = false; // a paused fade-to-rest would never finish
    if (this.seq) this.beginToRest();
  }

  /** Advance both channels. Call once per frame, before avatar.update(). */
  update(delta: number): void {
    this.mixer.timeScale = this.paused ? 0 : this.speed;
    const scaled = delta * this.mixer.timeScale;
    this.mixer.update(delta);
    this.updateSequence(scaled);
    this.updateExpressions(scaled);
  }

  // ---- sequence scheduling ----

  private resolveGloss(gloss: string): PlayItem[] {
    const upper = gloss.toUpperCase();
    const def = this.library.get(upper);
    if (def) return [this.toItem(upper, def)];

    // Unknown gloss: fingerspell grapheme by grapheme. Grapheme-cluster
    // segmentation keeps an Urdu letter and its combining marks (e.g. بِ)
    // as one unit, so Urdu fingerspelling works as soon as letter clips
    // keyed by Urdu characters exist in the manifest. Remaining TODO(Urdu):
    // record those clips and decide diacritic handling (spell base letter
    // vs. dedicated marked-letter signs).
    const items: PlayItem[] = [];
    for (const ch of graphemes(upper)) {
      const letter = this.library.get(ch);
      if (!letter) {
        console.warn(`[player] no letter clip for "${ch}" (in "${gloss}") — skipped`);
        continue;
      }
      items.push(this.toItem(ch, letter));
    }
    if (items.length === 0) console.warn(`[player] could not fingerspell "${gloss}"`);
    return items;
  }

  private toItem(gloss: string, def: SignDef): PlayItem {
    const d = this.library.defaults;
    const isLetter = def.type === "letter";
    return {
      gloss,
      def,
      fadeS: (def.fadeMs ?? (isLetter ? d.letterFadeMs : d.wordFadeMs)) / 1000,
      holdS: (def.holdMs ?? (isLetter ? d.letterHoldMs : d.wordHoldMs)) / 1000,
    };
  }

  private advance(): void {
    const seq = this.seq;
    if (!seq) return;
    seq.index += 1;

    if (seq.index >= seq.items.length) {
      this.beginToRest();
      return;
    }

    const item = seq.items[seq.index];
    // Same clip twice in a row (double letters): a distinct clip instance
    // is needed so the mixer can cross-fade the pose into itself.
    let clip = item.def.clip;
    if (this.activeAction.getClip() === clip) {
      item.def.clipAlt ??= clip.clone();
      clip = item.def.clipAlt;
    }

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.crossFadeFrom(this.activeAction, item.fadeS, false);
    this.activeAction = action;

    seq.action = action;
    seq.phase = "sign";
    seq.phaseElapsedS = 0;

    this.setExpressionTargets(item.def.nmf, item.fadeS);
    this.onGlossChange?.(item.gloss);
  }

  private beginToRest(): void {
    const seq = this.seq;
    if (!seq) return;

    const fadeS = this.library.defaults.restFadeMs / 1000;
    const restAction = this.mixer.clipAction(this.library.rest.clip);
    restAction.reset();
    restAction.setLoop(THREE.LoopRepeat, Infinity);
    restAction.play();
    if (restAction !== this.activeAction) {
      restAction.crossFadeFrom(this.activeAction, fadeS, false);
    }
    this.activeAction = restAction;

    seq.phase = "toRest";
    seq.phaseElapsedS = 0;
    seq.action = null;

    this.setExpressionTargets(undefined, fadeS);
    this.onGlossChange?.(null);
  }

  private updateSequence(scaledDelta: number): void {
    const seq = this.seq;
    if (!seq) return;
    seq.phaseElapsedS += scaledDelta;

    switch (seq.phase) {
      case "sign": {
        const action = seq.action!;
        if (action.time >= action.getClip().duration - 1e-4) {
          seq.phase = "hold";
          seq.phaseElapsedS = 0;
        }
        break;
      }
      case "hold": {
        // clampWhenFinished keeps the final pose; the hold is what makes
        // fingerspelled letters readable.
        if (seq.phaseElapsedS >= seq.items[seq.index].holdS) this.advance();
        break;
      }
      case "toRest": {
        if (seq.phaseElapsedS >= this.library.defaults.restFadeMs / 1000) {
          seq.resolve();
          this.seq = null;
        }
        break;
      }
    }
  }

  private cancelCurrent(): void {
    if (this.seq) {
      this.seq.resolve();
      this.seq = null;
      this.onGlossChange?.(null);
    }
  }

  // ---- expression (non-manual features) channel ----

  private setExpressionTargets(nmf: Record<string, number> | undefined, rampS: number): void {
    this.exprRampS = Math.max(rampS, 1 / 60);
    for (const name of this.exprTarget.keys()) this.exprTarget.set(name, 0);
    if (nmf) {
      const manager = this.avatar.vrm?.expressionManager;
      if (!manager && !this.warnedNoExpressions) {
        console.warn("[player] sign has nmf but avatar has no expression manager — facial channel inactive");
        this.warnedNoExpressions = true;
      }
      for (const [name, weight] of Object.entries(nmf)) this.exprTarget.set(name, weight);
    }
  }

  private updateExpressions(scaledDelta: number): void {
    if (this.exprTarget.size === 0 && this.exprCurrent.size === 0) return;
    const manager = this.avatar.vrm?.expressionManager;
    const step = scaledDelta / this.exprRampS;

    for (const [name, target] of this.exprTarget) {
      const current = this.exprCurrent.get(name) ?? 0;
      const next =
        Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
      this.exprCurrent.set(name, next);
      manager?.setValue(name, next);
      if (next === 0 && target === 0) {
        this.exprTarget.delete(name);
        this.exprCurrent.delete(name);
      }
    }
  }
}

/**
 * Sign library data formats.
 *
 * Clip JSON is the interchange format for sign animations: procedurally
 * generated now (scripts/generate-clips.mjs), exported by the Milestone 4
 * authoring tool later. Bones are addressed by VRM humanoid bone name;
 * the loader resolves them to actual scene nodes at load time.
 */

/** One keyframe track in a clip file. Keys: [timeSec, ...values]. */
export interface ClipTrackJson {
  /** VRM humanoid bone name, e.g. "rightUpperArm", "rightIndexProximal". */
  bone: string;
  /** "quaternion" keys are [t,x,y,z,w]; "position" keys are [t,x,y,z]. */
  type: "quaternion" | "position";
  keys: number[][];
}

export interface ClipJson {
  name: string;
  fps?: number;
  tracks: ClipTrackJson[];
}

export type SignType = "word" | "letter" | "rest";

/** Dataset metadata carried by each sign (see docs/DATASHEET.md). */
export interface SignMeta {
  english?: string;
  urdu?: string;
  /** e.g. "greeting", "hospital", "fingerspelling-latin", "fingerspelling-urdu" */
  category?: string;
  /**
   * placeholder = procedural stand-in, NOT a verified PSL sign;
   * recorded  = captured from a signer (authoring tool or converted data);
   * validated = reviewed/approved by Deaf PSL users or experts.
   */
  status?: "placeholder" | "recorded" | "validated";
  /** Anonymous signer code for recorded signs, e.g. "S01". */
  signer?: string;
  method?: "procedural" | "mocap-webcam" | "converted" | "manual";
}

/** One entry in /public/signs/manifest.json. */
export interface ManifestEntryJson {
  /** Uppercase gloss label; single character for fingerspelling letters. */
  gloss: string;
  /** Clip file name, relative to the signs directory. */
  clip: string;
  type: SignType;
  /** Optional per-sign overrides of the rhythm defaults. */
  holdMs?: number;
  fadeMs?: number;
  /**
   * Non-manual features: VRM expression name -> weight (0..1), ramped in
   * over the sign's cross-fade and held for its duration. Ignored (with a
   * warning) on avatars without an expression manager. Full facial grammar
   * is a later phase; this is the first-class hook for it.
   */
  nmf?: Record<string, number>;
  /** Dataset metadata (ignored by playback; used by dataset export). */
  meta?: SignMeta;
}

/** Playback rhythm defaults; word vs letter matters (fingerspelling needs
 * a longer readable hold and a crisper inter-letter transition). */
export interface RhythmDefaults {
  wordHoldMs: number;
  wordFadeMs: number;
  letterHoldMs: number;
  letterFadeMs: number;
  restFadeMs: number;
}

export interface ManifestJson {
  defaults?: Partial<RhythmDefaults>;
  signs: ManifestEntryJson[];
}

export const RHYTHM_DEFAULTS: RhythmDefaults = {
  wordHoldMs: 120,
  wordFadeMs: 250,
  letterHoldMs: 300,
  letterFadeMs: 120,
  restFadeMs: 450,
};

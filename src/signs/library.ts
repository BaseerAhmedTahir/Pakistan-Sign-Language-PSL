import type * as THREE from "three";
import type { LoadedAvatar } from "../avatar/loadAvatar";
import { buildAnimationClip } from "./clipLoader";
import {
  RHYTHM_DEFAULTS,
  type ClipJson,
  type ManifestEntryJson,
  type ManifestJson,
  type RhythmDefaults,
  type SignType,
} from "./types";

/** A manifest entry with its clip resolved against the current avatar. */
export interface SignDef {
  gloss: string;
  type: SignType;
  clip: THREE.AnimationClip;
  /**
   * Lazily created clone used when the same sign plays twice in a row
   * (e.g. fingerspelling a double letter) — the mixer needs a distinct
   * action to cross-fade a clip into itself.
   */
  clipAlt?: THREE.AnimationClip;
  holdMs?: number;
  fadeMs?: number;
  nmf?: Record<string, number>;
}

export class SignLibrary {
  readonly defaults: RhythmDefaults;
  readonly rest: SignDef;
  private signs: Map<string, SignDef>;

  constructor(defaults: RhythmDefaults, rest: SignDef, signs: Map<string, SignDef>) {
    this.defaults = defaults;
    this.rest = rest;
    this.signs = signs;
  }

  get(gloss: string): SignDef | undefined {
    return this.signs.get(gloss.toUpperCase());
  }

  /** All playable glosses (words + letters), for the UI panel. */
  list(): SignDef[] {
    return [...this.signs.values()];
  }
}

/**
 * Load /signs/manifest.json and every referenced clip, resolved against
 * the avatar's bone map. Call after the avatar has loaded.
 */
export async function loadSignLibrary(
  avatar: LoadedAvatar,
  baseUrl = "/signs/"
): Promise<SignLibrary> {
  const manifestRes = await fetch(`${baseUrl}manifest.json`);
  if (!manifestRes.ok) throw new Error(`manifest.json: HTTP ${manifestRes.status}`);
  const manifest = (await manifestRes.json()) as ManifestJson;

  const defaults: RhythmDefaults = { ...RHYTHM_DEFAULTS, ...manifest.defaults };

  const defs = await Promise.all(
    manifest.signs.map(async (entry: ManifestEntryJson): Promise<SignDef> => {
      const res = await fetch(`${baseUrl}${entry.clip}`);
      if (!res.ok) throw new Error(`${entry.clip}: HTTP ${res.status}`);
      const clipJson = (await res.json()) as ClipJson;
      return {
        gloss: entry.gloss.toUpperCase(),
        type: entry.type,
        clip: buildAnimationClip(clipJson, avatar.bones, avatar.mirrorClipSpace),
        holdMs: entry.holdMs,
        fadeMs: entry.fadeMs,
        nmf: entry.nmf,
      };
    })
  );

  const rest = defs.find((d) => d.type === "rest");
  if (!rest) {
    throw new Error('manifest.json must contain an entry with type "rest" (the neutral idle pose)');
  }

  const signs = new Map<string, SignDef>();
  for (const def of defs) {
    if (def.type !== "rest") signs.set(def.gloss, def);
  }

  console.info(
    `[signs] library loaded: ${signs.size} signs (${defs.filter((d) => d.type === "letter").length} letters)`
  );
  return new SignLibrary(defaults, rest, signs);
}

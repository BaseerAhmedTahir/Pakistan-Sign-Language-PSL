import type * as THREE from "three";
import type { ClipJson } from "../signs/types";
import type { BoneFrame } from "./tracker";

/**
 * Captures solved bone frames while recording and assembles them into the
 * clip JSON format Milestone 2 consumes (bones by VRM humanoid name,
 * quaternion keys [t,x,y,z,w], clip-space values).
 */
export class Recorder {
  private frames: Array<{ t: number; frame: BoneFrame }> = [];
  private startedAt = 0;
  private _recording = false;

  get recording(): boolean {
    return this._recording;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  get durationS(): number {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0;
  }

  start(): void {
    this.frames = [];
    this.startedAt = performance.now();
    this._recording = true;
  }

  /** Add the current solved frame (call once per solved video frame). */
  capture(frame: BoneFrame): void {
    if (!this._recording) return;
    const t = (performance.now() - this.startedAt) / 1000;
    // Clone quaternions — the tracker reuses them across frames.
    const copy: BoneFrame = new Map();
    for (const [bone, q] of frame) copy.set(bone, q.clone());
    this.frames.push({ t, frame: copy });
  }

  stop(): void {
    this._recording = false;
  }

  /** Assemble the recording into clip JSON. Returns null if empty. */
  toClipJson(name: string): ClipJson | null {
    if (this.frames.length < 2) return null;

    // Union of all bones seen; a bone missing in some frames (tracking
    // dropout) simply has no key there — three.js interpolates across it.
    const bones = new Set<string>();
    for (const { frame } of this.frames) for (const bone of frame.keys()) bones.add(bone);

    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    const tracks = [...bones].map((bone) => ({
      bone,
      type: "quaternion" as const,
      keys: this.frames
        .filter(({ frame }) => frame.has(bone))
        .map(({ t, frame }) => {
          const q = frame.get(bone) as THREE.Quaternion;
          return [round(t), round(q.x), round(q.y), round(q.z), round(q.w)];
        }),
    }));

    return { name, fps: 30, tracks };
  }

  /** Trigger a browser download of the clip JSON. */
  download(json: ClipJson): void {
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${json.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** The manifest entry to append for this clip. */
  manifestEntry(gloss: string, clipFile: string, type: "word" | "letter"): string {
    return JSON.stringify({ gloss: gloss.toUpperCase(), clip: clipFile, type });
  }
}

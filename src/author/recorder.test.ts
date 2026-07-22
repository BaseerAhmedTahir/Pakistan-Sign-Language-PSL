import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Recorder } from "./recorder";
import type { BoneFrame } from "./tracker";

function frame(entries: Record<string, [number, number, number, number]>): BoneFrame {
  const map: BoneFrame = new Map();
  for (const [bone, [x, y, z, w]] of Object.entries(entries)) {
    map.set(bone, new THREE.Quaternion(x, y, z, w));
  }
  return map;
}

describe("Recorder", () => {
  it("assembles captured frames into clip JSON with per-bone tracks", () => {
    const rec = new Recorder();
    rec.start();
    rec.capture(frame({ rightHand: [0, 0, 0, 1], head: [0, 0.1, 0, 0.99] }));
    rec.capture(frame({ rightHand: [0, 0, 0.5, 0.86] })); // head dropped out this frame
    rec.stop();

    const json = rec.toClipJson("wave")!;
    expect(json.name).toBe("wave");
    const bones = json.tracks.map((t) => t.bone).sort();
    expect(bones).toEqual(["head", "rightHand"]);

    const hand = json.tracks.find((t) => t.bone === "rightHand")!;
    const head = json.tracks.find((t) => t.bone === "head")!;
    expect(hand.keys).toHaveLength(2); // present in both frames
    expect(head.keys).toHaveLength(1); // tracking dropout -> key only where seen
    expect(hand.keys[0].slice(1)).toEqual([0, 0, 0, 1]);
  });

  it("returns null for recordings with fewer than 2 frames", () => {
    const rec = new Recorder();
    rec.start();
    rec.capture(frame({ head: [0, 0, 0, 1] }));
    rec.stop();
    expect(rec.toClipJson("x")).toBeNull();
  });

  it("clones quaternions so later mutation cannot corrupt captured frames", () => {
    const rec = new Recorder();
    rec.start();
    const live = frame({ head: [0, 0, 0, 1] });
    rec.capture(live);
    live.get("head")!.set(9, 9, 9, 9); // tracker reuses its objects
    rec.capture(live);
    rec.stop();
    const head = rec.toClipJson("x")!.tracks[0];
    expect(head.keys[0].slice(1)).toEqual([0, 0, 0, 1]);
    expect(head.keys[1].slice(1)).toEqual([9, 9, 9, 9]);
  });
});

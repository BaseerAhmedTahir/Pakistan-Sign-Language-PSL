import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildAnimationClip } from "./clipLoader";
import type { ClipJson } from "./types";

/** Track values are Float32Array — compare with float32 tolerance. */
function expectClose(actual: ArrayLike<number>, expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 6);
  }
}

function makeBones(...names: string[]): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>();
  for (const name of names) {
    const node = new THREE.Object3D();
    node.name = name;
    map.set(name, node);
  }
  return map;
}

const clipJson: ClipJson = {
  name: "test",
  fps: 30,
  tracks: [
    {
      bone: "rightUpperArm",
      type: "quaternion",
      keys: [
        [0, 0.1, 0.2, 0.3, 0.9],
        [1.5, 0.4, 0.5, 0.6, 0.7],
      ],
    },
  ],
};

describe("buildAnimationClip", () => {
  it("binds tracks by node uuid and derives duration from keyframes", () => {
    const bones = makeBones("rightUpperArm");
    const clip = buildAnimationClip(clipJson, bones);
    expect(clip.duration).toBeCloseTo(1.5);
    expect(clip.tracks).toHaveLength(1);
    expect(clip.tracks[0].name).toBe(`${bones.get("rightUpperArm")!.uuid}.quaternion`);
    expectClose(clip.tracks[0].values, [0.1, 0.2, 0.3, 0.9, 0.4, 0.5, 0.6, 0.7]);
  });

  it("mirrors clip space via 180°-Y conjugation: (x,y,z,w) -> (-x,y,-z,w)", () => {
    const bones = makeBones("rightUpperArm");
    const clip = buildAnimationClip(clipJson, bones, true);
    expectClose(clip.tracks[0].values, [-0.1, 0.2, -0.3, 0.9, -0.4, 0.5, -0.6, 0.7]);
  });

  it("mirrors position tracks as (x,y,z) -> (-x,y,-z)", () => {
    const bones = makeBones("hips");
    const clip = buildAnimationClip(
      { name: "p", tracks: [{ bone: "hips", type: "position", keys: [[0, 1, 2, 3]] }] },
      bones,
      true
    );
    expectClose(clip.tracks[0].values, [-1, 2, -3]);
  });

  it("skips tracks whose bone the avatar lacks", () => {
    const clip = buildAnimationClip(clipJson, makeBones("someOtherBone"));
    expect(clip.tracks).toHaveLength(0);
  });

  it("rejects malformed keys", () => {
    expect(() =>
      buildAnimationClip(
        { name: "bad", tracks: [{ bone: "hips", type: "quaternion", keys: [[0, 1, 2]] }] },
        makeBones("hips")
      )
    ).toThrow(/expected 5/);
  });
});

import * as THREE from "three";
import type { ClipJson } from "./types";

/**
 * Build a THREE.AnimationClip from clip JSON, resolving VRM humanoid bone
 * names to the avatar's actual animation target nodes.
 *
 * Tracks are named by node **uuid** rather than node name: three-vrm's
 * normalized humanoid nodes have implementation-defined names, and
 * PropertyBinding resolves uuids just as well — this keeps binding exact
 * on both the placeholder and a real VRM.
 *
 * Clip duration is derived from the keyframes (never from manifest data),
 * so declared and real durations cannot drift.
 */
export function buildAnimationClip(
  json: ClipJson,
  bones: Map<string, THREE.Object3D>,
  mirrorClipSpace = false
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];

  for (const trackJson of json.tracks) {
    const node = bones.get(trackJson.bone);
    if (!node) {
      console.warn(`[signs] clip "${json.name}": avatar has no bone "${trackJson.bone}" — track skipped`);
      continue;
    }

    const isQuaternion = trackJson.type === "quaternion";
    const valueSize = isQuaternion ? 4 : 3;
    const times: number[] = [];
    const values: number[] = [];
    for (const key of trackJson.keys) {
      if (key.length !== valueSize + 1) {
        throw new Error(
          `clip "${json.name}" bone "${trackJson.bone}": key has ${key.length} numbers, expected ${valueSize + 1}`
        );
      }
      times.push(key[0]);
      if (mirrorClipSpace) {
        // Conjugate by a 180° Y-rotation: clips are authored in +Z-facing
        // space; -Z-facing (VRM0) rigs need (x,y,z[,w]) -> (-x,y,-z[,w]).
        values.push(-key[1], key[2], -key[3]);
        if (isQuaternion) values.push(key[4]);
      } else {
        for (let i = 1; i < key.length; i++) values.push(key[i]);
      }
    }

    tracks.push(
      trackJson.type === "quaternion"
        ? new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, values)
        : new THREE.VectorKeyframeTrack(`${node.uuid}.position`, times, values)
    );
  }

  // -1: compute duration from the tracks' latest keyframe.
  return new THREE.AnimationClip(json.name, -1, tracks);
}

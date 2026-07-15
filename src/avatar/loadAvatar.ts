import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName, type VRM } from "@pixiv/three-vrm";
import { createPlaceholderAvatar, applyRelaxedPose } from "./placeholder";

export interface LoadedAvatar {
  root: THREE.Object3D;
  /**
   * "vrm" when the configured avatar loaded as a VRM, "glb" when it loaded
   * as a plain glTF (renders, but clips may not retarget — bone names are
   * whatever the file uses), "placeholder" otherwise.
   */
  source: "vrm" | "glb" | "placeholder";
  /**
   * Animation targets by VRM humanoid bone name (hips, leftUpperArm,
   * rightIndexProximal, ...). For a VRM these are the *normalized* humanoid
   * nodes (identity rotation = T-pose); the placeholder matches that
   * convention. For a plain GLB the map holds raw bones under raw names.
   */
  bones: Map<string, THREE.Object3D>;
  /**
   * Root object the AnimationMixer must be created on — it contains the
   * nodes in `bones`. For a VRM this is the normalized humanoid rig root,
   * NOT the visible scene.
   */
  animationRoot: THREE.Object3D;
  /**
   * True when the rig's model space faces -Z (VRM0-style): three-vrm's
   * normalized humanoid keeps the source model's facing, so clips authored
   * in +Z-facing space (ours) must be conjugated by a 180° Y-rotation —
   * quaternion (x,y,z,w) -> (-x,y,-z,w) — for every bone. Detected from
   * the rig's rest-pose arm direction, not trusted from metadata.
   */
  mirrorClipSpace: boolean;
  /** The three-vrm instance, when source is "vrm" (expressions live here). */
  vrm?: VRM;
  /** Per-frame update (VRM humanoid/expressions/spring bones). */
  update: (delta: number) => void;
}

/**
 * Load the rigged avatar from `url` (a .vrm from VRoid Studio recommended).
 * Falls back to the procedurally rigged placeholder mannequin if the file
 * is missing or fails to parse, so the rest of the pipeline keeps working.
 */
export async function loadAvatar(url: string): Promise<LoadedAvatar> {
  try {
    // Probe first: Vite's dev server can answer missing-file requests with
    // an HTML fallback, which would otherwise surface as a confusing parse
    // error inside GLTFLoader.
    const probe = await fetch(url, { method: "HEAD" });
    const type = probe.headers.get("content-type") ?? "";
    if (!probe.ok || type.includes("text/html")) {
      throw new Error(`avatar not found at ${url}`);
    }

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);

    const vrm = gltf.userData.vrm as VRM | undefined;
    if (vrm) {
      // VRM0 files face -Z; rotate them to match VRM1's +Z convention.
      VRMUtils.rotateVRM0(vrm);
      VRMUtils.removeUnnecessaryVertices(vrm.scene);

      const bones = new Map<string, THREE.Object3D>();
      for (const name of Object.values(VRMHumanBoneName)) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (node) bones.set(name, node);
      }
      prepareMeshes(vrm.scene);
      const mirrorClipSpace = detectMirroredRig(bones);
      applyRelaxedPose(bones, mirrorClipSpace);
      vrm.scene.name = "Avatar";
      return {
        root: vrm.scene,
        source: "vrm",
        bones,
        animationRoot: vrm.humanoid.normalizedHumanBonesRoot ?? vrm.scene,
        mirrorClipSpace,
        vrm,
        update: (delta) => vrm.update(delta),
      };
    }

    // Plain glTF/GLB without VRM metadata: render it, expose raw bones.
    console.warn(
      "[avatar] File has no VRM metadata — rendering as plain glTF. " +
        "Sign clips target VRM humanoid bone names and may not retarget."
    );
    const bones = new Map<string, THREE.Object3D>();
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) bones.set(obj.name, obj);
    });
    prepareMeshes(gltf.scene);
    gltf.scene.name = "Avatar";
    return {
      root: gltf.scene,
      source: "glb",
      bones,
      animationRoot: gltf.scene,
      mirrorClipSpace: false,
      update: () => {},
    };
  } catch (err) {
    console.warn(`[avatar] Falling back to placeholder rig: ${(err as Error).message}`);
    const placeholder = createPlaceholderAvatar();
    return {
      root: placeholder.root,
      source: "placeholder",
      bones: placeholder.bones,
      animationRoot: placeholder.root,
      mirrorClipSpace: false,
      update: () => {},
    };
  }
}

/**
 * In our clip space (VRM1-style, facing +Z) the left arm extends toward +X
 * in the rest pose. If this rig's left lower arm sits at -X relative to
 * its parent, the rig is in -Z-facing (VRM0) space and clips need the
 * 180°-Y conjugation.
 */
function detectMirroredRig(bones: Map<string, THREE.Object3D>): boolean {
  const lowerArm = bones.get("leftLowerArm");
  if (!lowerArm || Math.abs(lowerArm.position.x) < 1e-6) {
    console.warn("[avatar] could not detect rig facing from leftLowerArm — assuming +Z-facing clip space");
    return false;
  }
  const mirrored = lowerArm.position.x < 0;
  if (mirrored) {
    console.info("[avatar] -Z-facing (VRM0-style) normalized rig detected — clips will be space-mirrored");
  }
  return mirrored;
}

function prepareMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      // Skinned meshes are animated far outside their rest-pose bounds;
      // disable culling so hands never vanish mid-sign.
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) obj.frustumCulled = false;
    }
  });
}

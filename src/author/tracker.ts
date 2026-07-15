import * as THREE from "three";
import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { Pose, Hand, Face } from "kalidokit";

/**
 * Webcam → MediaPipe tasks-vision → Kalidokit → clip-space bone rotations.
 *
 * Output frames are quaternions per VRM humanoid bone name in OUR clip
 * space (+Z-facing, identity = T-pose — see README), i.e. exactly what
 * clip JSON stores, so recording is a straight capture of these frames.
 *
 * Models are fetched from Google's CDN on init (see MODEL_URLS); self-host
 * them under public/models/ and change the URLs for offline use.
 */

// Pin the wasm bundle to the installed @mediapipe/tasks-vision version.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URLS = {
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};

/** One solved frame: VRM bone name -> clip-space quaternion. */
export type BoneFrame = Map<string, THREE.Quaternion>;

/**
 * Kalidokit -> VRM humanoid bone name mapping.
 * Pose: legs are deliberately excluded (signing is upper-body; leg tracking
 * from a seated/framed signer is noise).
 */
const POSE_MAP: Record<string, string> = {
  Hips: "hips",
  Spine: "spine",
  Chest: "chest",
  RightUpperArm: "rightUpperArm",
  RightLowerArm: "rightLowerArm",
  LeftUpperArm: "leftUpperArm",
  LeftLowerArm: "leftLowerArm",
};

/**
 * Kalidokit hand keys -> VRM. Note the thumb shift: Kalidokit uses
 * Proximal/Intermediate/Distal for the thumb, VRM uses
 * Metacarpal/Proximal/Distal.
 */
function handMap(side: "Right" | "Left"): Record<string, string> {
  const s = side.toLowerCase();
  const map: Record<string, string> = { [`${side}Wrist`]: `${s}Hand` };
  for (const finger of ["Index", "Middle", "Ring", "Little"]) {
    for (const seg of ["Proximal", "Intermediate", "Distal"]) {
      map[`${side}${finger}${seg}`] = `${s}${finger}${seg}`;
    }
  }
  map[`${side}ThumbProximal`] = `${s}ThumbMetacarpal`;
  map[`${side}ThumbIntermediate`] = `${s}ThumbProximal`;
  map[`${side}ThumbDistal`] = `${s}ThumbDistal`;
  return map;
}
const RIGHT_HAND_MAP = handMap("Right");
const LEFT_HAND_MAP = handMap("Left");

export interface TrackerOptions {
  /**
   * Selfie view: the on-screen video is mirrored and MediaPipe's
   * "Left"/"Right" hand labels are swapped so your right hand drives the
   * avatar's right hand. Default true (webcams are selfie-view).
   */
  mirror: boolean;
  /**
   * Kalidokit's rotation conventions target VRM0-style (-Z-facing) rigs;
   * our clip space is +Z-facing, so solved rotations are conjugated by
   * 180° about Y by default. If a live-driven avatar moves mirrored/
   * backwards on real footage, toggle this off. Empirical — verify with a
   * camera.
   */
  spaceFlip: boolean;
}

interface KalidokitRotation {
  x: number;
  y: number;
  z: number;
}

export class Tracker {
  options: TrackerOptions = { mirror: true, spaceFlip: true };

  private pose?: PoseLandmarker;
  private hand?: HandLandmarker;
  private face?: FaceLandmarker;
  private lastVideoTime = -1;

  get ready(): boolean {
    return !!(this.pose && this.hand && this.face);
  }

  /** Fetch wasm + the three landmarker models (network, ~17 MB once). */
  async init(onProgress: (msg: string) => void): Promise<void> {
    onProgress("Loading vision runtime…");
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    onProgress("Loading pose model…");
    this.pose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URLS.pose, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    onProgress("Loading hand model…");
    this.hand = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URLS.hand, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
    onProgress("Loading face model…");
    this.face = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URLS.face, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
    });
    onProgress("Models ready.");
  }

  /**
   * Solve one video frame into clip-space bone rotations. Returns null if
   * the frame was already processed or nothing was detected.
   */
  solve(video: HTMLVideoElement, timestampMs: number): BoneFrame | null {
    if (!this.pose || !this.hand || !this.face) return null;
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;

    const frame: BoneFrame = new Map();

    const poseResult = this.pose.detectForVideo(video, timestampMs);
    if (poseResult.landmarks.length > 0) {
      const rig = Pose.solve(
        poseResult.worldLandmarks[0] as unknown as Parameters<typeof Pose.solve>[0],
        poseResult.landmarks[0] as unknown as Parameters<typeof Pose.solve>[1],
        { runtime: "mediapipe", video }
      );
      if (rig) {
        for (const [key, bone] of Object.entries(POSE_MAP)) {
          const rot = (rig as unknown as Record<string, KalidokitRotation | undefined>)[key];
          if (rot) frame.set(bone, this.toClipSpace(rot));
        }
      }
    }

    const handResult = this.hand.detectForVideo(video, timestampMs + 1);
    handResult.landmarks.forEach((landmarks, i) => {
      let label = handResult.handedness[i]?.[0]?.categoryName as "Left" | "Right" | undefined;
      if (!label) return;
      // MediaPipe labels hands as they appear in the image; in selfie view
      // the label already matches the signer's anatomical hand. When NOT
      // mirrored, swap.
      if (!this.options.mirror) label = label === "Left" ? "Right" : "Left";
      const rig = Hand.solve(landmarks as NormalizedLandmark[], label);
      if (!rig) return;
      const map = label === "Right" ? RIGHT_HAND_MAP : LEFT_HAND_MAP;
      for (const [key, bone] of Object.entries(map)) {
        const rot = (rig as unknown as Record<string, KalidokitRotation | undefined>)[key];
        if (rot) frame.set(bone, this.toClipSpace(rot));
      }
    });

    const faceResult = this.face.detectForVideo(video, timestampMs + 2);
    if (faceResult.faceLandmarks.length > 0) {
      const rig = Face.solve(faceResult.faceLandmarks[0] as NormalizedLandmark[], {
        runtime: "mediapipe",
        video,
      });
      if (rig?.head) {
        // Head rotation only for now. Eye/mouth values are the future NMF
        // capture channel (they map to VRM expressions, not bones).
        frame.set("head", this.toClipSpace(rig.head));
      }
    }

    return frame.size > 0 ? frame : null;
  }

  /** Kalidokit euler (radians) -> clip-space quaternion. */
  private toClipSpace(rot: KalidokitRotation): THREE.Quaternion {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, "XYZ"));
    if (this.options.spaceFlip) {
      // Conjugate by 180° about Y: (x,y,z,w) -> (-x,y,-z,w).
      q.set(-q.x, q.y, -q.z, q.w);
    }
    return q;
  }
}

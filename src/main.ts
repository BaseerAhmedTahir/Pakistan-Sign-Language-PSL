import * as THREE from "three";
import { resolveAvatarUrl } from "./config";
import { createScene } from "./scene/createScene";
import { loadAvatar } from "./avatar/loadAvatar";
import { loadSignLibrary } from "./signs/library";
import { SignPlayer } from "./player/SignPlayer";
import { createHud } from "./ui/hud";
import { createControls } from "./ui/controls";
import { loadLexicon, type Lexicon } from "./engine/translate";

async function bootstrap(): Promise<void> {
  const container = document.getElementById("app");
  if (!container) throw new Error("Missing #app container");

  const ctx = createScene(container);
  const hud = createHud(ctx.resetCamera);

  const avatarUrl = resolveAvatarUrl();
  const avatar = await loadAvatar(avatarUrl);
  ctx.scene.add(avatar.root);
  ctx.frameUpperBody(avatar.root);

  switch (avatar.source) {
    case "vrm":
      hud.setStatus(`VRM avatar: ${avatarUrl} (${avatar.bones.size} humanoid bones)`);
      break;
    case "glb":
      hud.setStatus(
        `Plain glTF avatar: ${avatarUrl} — no VRM metadata, sign clips may not retarget.`,
        true
      );
      break;
    case "placeholder":
      hud.setStatus(
        "Using placeholder rig — drop a VRM avatar (VRoid Studio) at public/avatar/avatar.vrm to swap.",
        true
      );
      break;
  }

  let player: SignPlayer | null = null;
  try {
    const library = await loadSignLibrary(avatar);
    player = new SignPlayer(avatar, library);
    // The engine is optional: if the lexicon is missing, the gloss input
    // still works — the renderer never depends on the engine.
    let lexicon: Lexicon | null = null;
    try {
      lexicon = await loadLexicon();
    } catch (err) {
      console.warn("[engine] lexicon unavailable — text input disabled:", err);
    }
    createControls(player, library, lexicon);
  } catch (err) {
    console.error("[signs] library failed to load:", err);
    hud.setStatus(`Sign library failed to load: ${(err as Error).message}`, true);
  }

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__debug = { ctx, avatar, player };
  }

  const clock = new THREE.Clock();
  ctx.renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    // Order matters: player (mixer + expressions) BEFORE avatar.update —
    // vrm.update propagates normalized bones/expressions to the mesh.
    player?.update(delta);
    avatar.update(delta);
    ctx.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  });
}

bootstrap().catch((err) => {
  console.error("[bootstrap]", err);
});

/**
 * Global configuration for the PSL Signing Avatar renderer.
 *
 * To swap the avatar: drop a VRM avatar (make one free in VRoid Studio, or
 * download from VRoid Hub — VRM includes the standardized humanoid rig with
 * full finger bones AND facial expressions/blendshapes, our path to
 * non-manual features) at `public/avatar/avatar.vrm`, or change this URL.
 * If the file is missing, a procedurally rigged placeholder mannequin with
 * VRM-spec bone names is used instead.
 */
/**
 * Prefix a public-asset path with the deploy base (import.meta.env.BASE_URL
 * is "/" in dev and e.g. "/Pakistan-Sign-Language-PSL/" on GitHub Pages).
 */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}

export const AVATAR_URL = assetUrl("avatar/avatar.vrm");

/**
 * The avatar can be overridden per-session with `?avatar=<url>` — used for
 * testing sample models (e.g. `?avatar=/avatar/samples/vrm0_alicia.vrm`,
 * relative to the deploy base) without changing the configured default.
 */
export function resolveAvatarUrl(): string {
  const override = new URLSearchParams(window.location.search).get("avatar");
  return override ? assetUrl(override) : AVATAR_URL;
}

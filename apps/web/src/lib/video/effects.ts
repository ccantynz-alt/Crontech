// ── Video Effects ────────────────────────────────────────────────────
// Helpers for applying effects and transitions to video clips.
// All functions are pure and return new clip instances.

import type { VideoClip, VideoEffect } from "./engine";

/** Apply a fade-in effect to a clip. */
export function applyFadeIn(clip: VideoClip, duration: number): VideoClip {
  const fadeIn: VideoEffect = { type: "fade", duration, params: { direction: 1 } };
  return {
    ...clip,
    effects: [...clip.effects, fadeIn],
  };
}

/** Apply a fade-out effect to a clip. */
export function applyFadeOut(clip: VideoClip, duration: number): VideoClip {
  const fadeOut: VideoEffect = { type: "fade", duration, params: { direction: 0 } };
  return {
    ...clip,
    effects: [...clip.effects, fadeOut],
  };
}

/**
 * Apply a transition between two clips.
 * The effect is appended to the outgoing clip and a corresponding
 * entry is added to the incoming clip so both sides are aware.
 */
export function applyTransition(
  from: VideoClip,
  to: VideoClip,
  effect: VideoEffect,
): [VideoClip, VideoClip] {
  const updatedFrom: VideoClip = {
    ...from,
    effects: [...from.effects, { ...effect, params: { ...effect.params, role: 0 } }],
  };

  const updatedTo: VideoClip = {
    ...to,
    effects: [...to.effects, { ...effect, params: { ...effect.params, role: 1 } }],
  };

  return [updatedFrom, updatedTo];
}

/** Return the list of all available effect types. */
export function getAvailableEffects(): VideoEffect["type"][] {
  return ["fade", "dissolve", "cut", "slide", "zoom"];
}

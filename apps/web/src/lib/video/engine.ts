// ── Video Pipeline Engine ─────────────────────────────────────────────
// Core data structures and timeline manipulation for the AI video builder.
// All operations are immutable — every function returns a new timeline.

export interface VideoEffect {
  type: "fade" | "dissolve" | "cut" | "slide" | "zoom";
  duration: number;
  params?: Record<string, number>;
}

export interface VideoClip {
  id: string;
  src: string;
  startTime: number;
  duration: number;
  effects: VideoEffect[];
}

export interface VideoTimeline {
  clips: VideoClip[];
  totalDuration: number;
  fps: number;
  width: number;
  height: number;
}

/** Generate a unique clip ID. */
function generateClipId(): string {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Create an empty timeline with sensible defaults. */
export function createTimeline(
  config?: Partial<VideoTimeline>,
): VideoTimeline {
  return {
    clips: config?.clips ?? [],
    totalDuration: config?.totalDuration ?? 0,
    fps: config?.fps ?? 30,
    width: config?.width ?? 1920,
    height: config?.height ?? 1080,
  };
}

/** Calculate the total duration of all clips in a timeline. */
export function calculateTotalDuration(timeline: VideoTimeline): number {
  if (timeline.clips.length === 0) return 0;

  return timeline.clips.reduce((total, clip) => {
    const clipEnd = clip.startTime + clip.duration;
    return Math.max(total, clipEnd);
  }, 0);
}

/** Immutably add a clip to the timeline. */
export function addClip(
  timeline: VideoTimeline,
  clip: Omit<VideoClip, "id">,
): VideoTimeline {
  const newClip: VideoClip = {
    ...clip,
    id: generateClipId(),
  };

  const newClips = [...timeline.clips, newClip];
  const updated: VideoTimeline = {
    ...timeline,
    clips: newClips,
  };

  return {
    ...updated,
    totalDuration: calculateTotalDuration(updated),
  };
}

/** Immutably remove a clip from the timeline by ID. */
export function removeClip(
  timeline: VideoTimeline,
  clipId: string,
): VideoTimeline {
  const newClips = timeline.clips.filter((c) => c.id !== clipId);
  const updated: VideoTimeline = {
    ...timeline,
    clips: newClips,
  };

  return {
    ...updated,
    totalDuration: calculateTotalDuration(updated),
  };
}

/** Immutably reorder clips by moving a clip from one index to another. */
export function reorderClips(
  timeline: VideoTimeline,
  fromIndex: number,
  toIndex: number,
): VideoTimeline {
  if (
    fromIndex < 0 ||
    fromIndex >= timeline.clips.length ||
    toIndex < 0 ||
    toIndex >= timeline.clips.length
  ) {
    return timeline;
  }

  const newClips = [...timeline.clips];
  const [moved] = newClips.splice(fromIndex, 1);
  if (moved) newClips.splice(toIndex, 0, moved);

  return {
    ...timeline,
    clips: newClips,
  };
}

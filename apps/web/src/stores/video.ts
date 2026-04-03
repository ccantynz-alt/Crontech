// ── Video Editor Store ───────────────────────────────────────────────
// SolidJS signal-based store for the video editor state.

import { createSignal } from "solid-js";
import type { VideoClip, VideoEffect, VideoTimeline } from "../lib/video/engine";
import {
  createTimeline,
  addClip as addClipToTimeline,
  removeClip as removeClipFromTimeline,
  reorderClips as reorderClipsInTimeline,
} from "../lib/video/engine";
import type { RenderConfig, RenderProgress } from "../lib/video/renderer";
import { renderTimeline } from "../lib/video/renderer";

export interface VideoEditorState {
  timeline: () => VideoTimeline;
  selectedClip: () => string | null;
  rendering: () => boolean;
  renderProgress: () => RenderProgress | null;
  addClip: (clip: Omit<VideoClip, "id">) => void;
  removeClip: (id: string) => void;
  reorderClips: (fromIndex: number, toIndex: number) => void;
  selectClip: (id: string | null) => void;
  deselectClip: () => void;
  render: (config: Omit<RenderConfig, "timeline">) => Promise<Blob>;
  applyEffect: (clipId: string, effect: VideoEffect) => void;
}

/** Create the video editor store. Call once per editor instance. */
export function useVideoEditor(): VideoEditorState {
  const [timeline, setTimeline] = createSignal<VideoTimeline>(createTimeline());
  const [selectedClip, setSelectedClip] = createSignal<string | null>(null);
  const [rendering, setRendering] = createSignal(false);
  const [renderProgress, setRenderProgress] = createSignal<RenderProgress | null>(null);

  function addClip(clip: Omit<VideoClip, "id">): void {
    setTimeline((prev) => addClipToTimeline(prev, clip));
  }

  function removeClip(id: string): void {
    setTimeline((prev) => removeClipFromTimeline(prev, id));
    // Deselect if the removed clip was selected
    if (selectedClip() === id) {
      setSelectedClip(null);
    }
  }

  function reorderClips(fromIndex: number, toIndex: number): void {
    setTimeline((prev) => reorderClipsInTimeline(prev, fromIndex, toIndex));
  }

  function selectClip(id: string | null): void {
    setSelectedClip(id);
  }

  function deselectClip(): void {
    setSelectedClip(null);
  }

  async function render(config: Omit<RenderConfig, "timeline">): Promise<Blob> {
    setRendering(true);
    setRenderProgress(null);

    try {
      const blob = await renderTimeline(
        { ...config, timeline: timeline() },
        (progress) => {
          setRenderProgress(progress);
        },
      );
      return blob;
    } finally {
      setRendering(false);
    }
  }

  function applyEffect(clipId: string, effect: VideoEffect): void {
    setTimeline((prev) => {
      const clips = prev.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        return {
          ...clip,
          effects: [...clip.effects, effect],
        };
      });
      return { ...prev, clips };
    });
  }

  return {
    timeline,
    selectedClip,
    rendering,
    renderProgress,
    addClip,
    removeClip,
    reorderClips,
    selectClip,
    deselectClip,
    render,
    applyEffect,
  };
}

/**
 * SolidJS video editor component with multi-track timeline UI.
 *
 * Features:
 * - Multi-track timeline with drag-to-position clips
 * - Trim handles on clips
 * - Effect stack panel for selected clip
 * - Preview window
 * - Export button with progress
 * - Undo/redo via editor store
 * - Zod schema for AI composability
 */

import {
  type JSX,
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  For,
  Show,
  splitProps,
} from "solid-js";
import { isServer } from "solid-js/web";
import { z } from "zod";
import { Timeline, type Clip, type Track, type TrackType, TimelineSchema } from "../../gpu/video/timeline";
import { VideoFrameEncoder } from "../../gpu/video/encoder";
import { renderFrame, exportTimeline, FileSourceProvider } from "../../gpu/video/renderer";

// ---------------------------------------------------------------------------
// Zod Schema (AI Composability)
// ---------------------------------------------------------------------------

export const VideoEditorPropsSchema = z.object({
  width: z.number().default(1920),
  height: z.number().default(1080),
  fps: z.number().default(30),
});

export type VideoEditorSchemaProps = z.input<typeof VideoEditorPropsSchema>;

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface VideoEditorProps extends VideoEditorSchemaProps {
  class?: string;
  onExportComplete?: (blob: Blob) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${mins}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
}

const TRACK_HEIGHT = 48;
const PIXELS_PER_SECOND = 100;

const TRACK_COLORS: Record<TrackType, string> = {
  video: "bg-blue-600/80",
  audio: "bg-green-600/80",
  text: "bg-yellow-600/80",
  effect: "bg-purple-600/80",
};

const TRACK_LABELS: Record<TrackType, string> = {
  video: "Video",
  audio: "Audio",
  text: "Text",
  effect: "Effect",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VideoEditor(props: VideoEditorProps): JSX.Element {
  const [local, _rest] = splitProps(props, [
    "width",
    "height",
    "fps",
    "class",
    "onExportComplete",
  ]);

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [timeline, setTimeline] = createSignal<Timeline>(
    new Timeline({
      width: local.width ?? 1920,
      height: local.height ?? 1080,
      fps: local.fps ?? 30,
    }),
  );

  const [currentTime, setCurrentTime] = createSignal(0);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [selectedClipId, setSelectedClipId] = createSignal<string | null>(null);
  const [zoom, setZoom] = createSignal(1);
  const [isExporting, setIsExporting] = createSignal(false);
  const [exportProgress, setExportProgress] = createSignal(0);
  const [scrollLeft, setScrollLeft] = createSignal(0);

  // Undo/redo stacks
  const [undoStack, setUndoStack] = createSignal<string[]>([]);
  const [redoStack, setRedoStack] = createSignal<string[]>([]);

  // Source provider for rendering
  const sourceProvider = new FileSourceProvider();

  let previewCanvasRef: HTMLCanvasElement | undefined;
  let timelineContainerRef: HTMLDivElement | undefined;
  let playbackTimer: ReturnType<typeof setInterval> | undefined;

  // -----------------------------------------------------------------------
  // Undo/Redo
  // -----------------------------------------------------------------------

  function pushUndo(): void {
    const snapshot = JSON.stringify(timeline().toJSON());
    setUndoStack((prev) => {
      const next = [...prev, snapshot];
      return next.length > 50 ? next.slice(-50) : next;
    });
    setRedoStack([]);
  }

  function undo(): void {
    const stack = undoStack();
    if (stack.length === 0) return;

    const current = JSON.stringify(timeline().toJSON());
    setRedoStack((prev) => [...prev, current]);

    const prev = stack[stack.length - 1]!;
    setUndoStack((s) => s.slice(0, -1));
    setTimeline(Timeline.fromJSON(JSON.parse(prev)));
  }

  function redo(): void {
    const stack = redoStack();
    if (stack.length === 0) return;

    const current = JSON.stringify(timeline().toJSON());
    setUndoStack((prev) => [...prev, current]);

    const next = stack[stack.length - 1]!;
    setRedoStack((s) => s.slice(0, -1));
    setTimeline(Timeline.fromJSON(JSON.parse(next)));
  }

  // -----------------------------------------------------------------------
  // Playback
  // -----------------------------------------------------------------------

  function play(): void {
    if (isPlaying()) return;
    setIsPlaying(true);

    const fps = timeline().fps;
    const frameDuration = 1000 / fps;

    playbackTimer = setInterval(() => {
      setCurrentTime((t) => {
        const next = t + 1 / fps;
        if (next >= timeline().duration) {
          pause();
          return timeline().duration;
        }
        return next;
      });
    }, frameDuration);
  }

  function pause(): void {
    setIsPlaying(false);
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = undefined;
    }
  }

  function togglePlay(): void {
    if (isPlaying()) pause();
    else play();
  }

  function seekTo(time: number): void {
    setCurrentTime(Math.max(0, Math.min(time, timeline().duration)));
  }

  // -----------------------------------------------------------------------
  // Preview rendering
  // -----------------------------------------------------------------------

  createEffect(() => {
    const t = currentTime();
    const tl = timeline();

    if (!previewCanvasRef) return;
    if (isServer) return;

    renderFrame(tl, t, previewCanvasRef, sourceProvider, {
      previewScale: 0.5,
      backgroundColor: "#000000",
    }).catch(() => {
      // Preview render failed — likely no sources loaded yet
    });
  });

  // -----------------------------------------------------------------------
  // Track/Clip management
  // -----------------------------------------------------------------------

  function addTrack(type: TrackType): void {
    pushUndo();
    const tl = timeline();
    tl.addTrack(type);
    setTimeline(Timeline.fromJSON(tl.toJSON()));
  }

  function removeTrack(trackId: string): void {
    pushUndo();
    const tl = timeline();
    tl.removeTrack(trackId);
    setTimeline(Timeline.fromJSON(tl.toJSON()));
  }

  function addFileAsClip(trackId: string, file: File, startTime: number): void {
    pushUndo();
    const sourceId = `file-${Date.now()}-${file.name}`;
    sourceProvider.addSource(sourceId, file);

    const tl = timeline();
    // Default clip duration of 5 seconds (will be updated after decode)
    tl.addClip(trackId, {
      startTime,
      endTime: startTime + 5,
      sourceId,
      label: file.name,
      trimStart: 0,
      trimEnd: 0,
    });
    setTimeline(Timeline.fromJSON(tl.toJSON()));
  }

  function removeClip(clipId: string): void {
    pushUndo();
    const tl = timeline();
    tl.removeClip(clipId);
    setTimeline(Timeline.fromJSON(tl.toJSON()));
    if (selectedClipId() === clipId) {
      setSelectedClipId(null);
    }
  }

  function splitClipAtPlayhead(): void {
    const clipId = selectedClipId();
    if (!clipId) return;

    pushUndo();
    const tl = timeline();
    tl.splitClip(clipId, currentTime());
    setTimeline(Timeline.fromJSON(tl.toJSON()));
  }

  // -----------------------------------------------------------------------
  // Clip dragging
  // -----------------------------------------------------------------------

  function handleClipMouseDown(
    clipId: string,
    trackId: string,
    e: MouseEvent,
  ): void {
    e.preventDefault();
    e.stopPropagation();
    setSelectedClipId(clipId);

    const startX = e.clientX;
    const tl = timeline();
    const found = tl.getClip(clipId);
    if (!found) return;
    const originalStart = found.clip.startTime;

    const pps = PIXELS_PER_SECOND * zoom();

    function onMouseMove(moveEvent: MouseEvent): void {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;
      const newStart = Math.max(0, originalStart + deltaTime);

      const updatedTl = timeline();
      updatedTl.moveClip(clipId, newStart);
      setTimeline(Timeline.fromJSON(updatedTl.toJSON()));
    }

    function onMouseUp(): void {
      pushUndo();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // -----------------------------------------------------------------------
  // Trim handles
  // -----------------------------------------------------------------------

  function handleTrimStart(clipId: string, e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const tl = timeline();
    const found = tl.getClip(clipId);
    if (!found) return;
    const originalStart = found.clip.startTime;
    const pps = PIXELS_PER_SECOND * zoom();

    function onMouseMove(moveEvent: MouseEvent): void {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;
      const newStart = Math.max(0, originalStart + deltaTime);

      const updatedTl = timeline();
      updatedTl.trimClipStart(clipId, newStart);
      setTimeline(Timeline.fromJSON(updatedTl.toJSON()));
    }

    function onMouseUp(): void {
      pushUndo();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleTrimEnd(clipId: string, e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const tl = timeline();
    const found = tl.getClip(clipId);
    if (!found) return;
    const originalEnd = found.clip.endTime;
    const pps = PIXELS_PER_SECOND * zoom();

    function onMouseMove(moveEvent: MouseEvent): void {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pps;
      const newEnd = originalEnd + deltaTime;

      const updatedTl = timeline();
      updatedTl.trimClipEnd(clipId, newEnd);
      setTimeline(Timeline.fromJSON(updatedTl.toJSON()));
    }

    function onMouseUp(): void {
      pushUndo();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  async function handleExport(): Promise<void> {
    if (isExporting()) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const tl = timeline();
      const encoder = new VideoFrameEncoder({
        codec: "h264",
        width: tl.width,
        height: tl.height,
        bitrate: 5_000_000,
        framerate: tl.fps,
      });
      await encoder.init();

      await exportTimeline(
        tl,
        sourceProvider,
        (frame) => {
          encoder.encode(frame);
        },
        (progress) => {
          setExportProgress(progress);
        },
      );

      const blob = await encoder.toBlob();
      encoder.destroy();

      local.onExportComplete?.(blob);

      // Auto-download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------

  function handleKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    const mod = e.metaKey || e.ctrlKey;

    switch (true) {
      case e.key === " ":
        e.preventDefault();
        togglePlay();
        break;
      case mod && e.key === "z" && !e.shiftKey:
        e.preventDefault();
        undo();
        break;
      case mod && e.key === "z" && e.shiftKey:
        e.preventDefault();
        redo();
        break;
      case e.key === "Delete" || e.key === "Backspace": {
        const clipId = selectedClipId();
        if (clipId) {
          e.preventDefault();
          removeClip(clipId);
        }
        break;
      }
      case e.key === "s" || e.key === "S":
        if (!mod) {
          e.preventDefault();
          splitClipAtPlayhead();
        }
        break;
      case e.key === "ArrowLeft":
        e.preventDefault();
        seekTo(currentTime() - (e.shiftKey ? 1 / (timeline().fps) : 1));
        break;
      case e.key === "ArrowRight":
        e.preventDefault();
        seekTo(currentTime() + (e.shiftKey ? 1 / (timeline().fps) : 1));
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Timeline click to seek
  // -----------------------------------------------------------------------

  function handleTimelineClick(e: MouseEvent): void {
    if (!timelineContainerRef) return;
    const rect = timelineContainerRef.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft();
    const time = x / (PIXELS_PER_SECOND * zoom());
    seekTo(time);
  }

  // -----------------------------------------------------------------------
  // Drag & drop files
  // -----------------------------------------------------------------------

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const tl = timeline();
    const videoTracks = tl.getTracksByType("video");
    let trackId: string;

    if (videoTracks.length === 0) {
      trackId = tl.addTrack("video");
      setTimeline(Timeline.fromJSON(tl.toJSON()));
    } else {
      trackId = videoTracks[0]!.id;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
        addFileAsClip(trackId, file, tl.duration + i * 5);
      }
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  onCleanup(() => {
    if (playbackTimer) clearInterval(playbackTimer);
    sourceProvider.destroy();
  });

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const pps = (): number => PIXELS_PER_SECOND * zoom();
  const timelineWidth = (): number => Math.max(timeline().duration * pps(), 1000);
  const playheadX = (): number => currentTime() * pps();

  function clipStyle(clip: Clip): string {
    const left = clip.startTime * pps();
    const width = (clip.endTime - clip.startTime) * pps();
    return `left:${left}px;width:${Math.max(width, 4)}px`;
  }

  function selectedClip(): Clip | undefined {
    const id = selectedClipId();
    if (!id) return undefined;
    return timeline().getClip(id)?.clip;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      class={`flex flex-col h-full bg-gray-950 text-white ${local.class ?? ""}`}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      tabIndex={0}
      role="application"
      aria-label="Video editor"
    >
      {/* Top toolbar */}
      <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800">
        {/* Undo/Redo */}
        <button
          type="button"
          class="px-2 py-1 text-xs bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30"
          onClick={undo}
          disabled={undoStack().length === 0}
          aria-label="Undo"
        >
          Undo
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30"
          onClick={redo}
          disabled={redoStack().length === 0}
          aria-label="Redo"
        >
          Redo
        </button>

        <div class="w-px h-5 bg-gray-700" />

        {/* Add tracks */}
        <button
          type="button"
          class="px-2 py-1 text-xs bg-blue-700 rounded hover:bg-blue-600"
          onClick={() => addTrack("video")}
        >
          + Video Track
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs bg-green-700 rounded hover:bg-green-600"
          onClick={() => addTrack("audio")}
        >
          + Audio Track
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs bg-yellow-700 rounded hover:bg-yellow-600"
          onClick={() => addTrack("text")}
        >
          + Text Track
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs bg-purple-700 rounded hover:bg-purple-600"
          onClick={() => addTrack("effect")}
        >
          + Effect Track
        </button>

        <div class="flex-1" />

        {/* Zoom */}
        <span class="text-xs text-gray-400">Zoom:</span>
        <input
          type="range"
          min="0.25"
          max="4"
          step="0.25"
          value={zoom()}
          onInput={(e) => setZoom(Number(e.currentTarget.value))}
          class="w-20 accent-blue-500"
          aria-label="Timeline zoom"
        />
        <span class="text-xs font-mono w-10">{zoom().toFixed(1)}x</span>

        <div class="w-px h-5 bg-gray-700" />

        {/* Export */}
        <button
          type="button"
          class="px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-500 disabled:opacity-50"
          onClick={handleExport}
          disabled={isExporting() || timeline().totalClips === 0}
        >
          <Show when={isExporting()} fallback="Export">
            Exporting... {Math.round(exportProgress() * 100)}%
          </Show>
        </button>
      </div>

      {/* Main area: preview + properties */}
      <div class="flex flex-1 min-h-0">
        {/* Preview */}
        <div class="flex-1 flex items-center justify-center bg-black p-4">
          <canvas
            ref={previewCanvasRef}
            class="max-w-full max-h-full object-contain"
            width={local.width ?? 1920}
            height={local.height ?? 1080}
          />
        </div>

        {/* Properties panel */}
        <div class="w-64 bg-gray-900 border-l border-gray-800 overflow-y-auto p-3">
          <Show
            when={selectedClip()}
            fallback={
              <div class="text-gray-500 text-sm text-center mt-8">
                Select a clip to view properties
              </div>
            }
          >
            {(clip) => (
              <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-300">Clip Properties</h3>
                <div class="text-xs space-y-2">
                  <div>
                    <span class="text-gray-500">Label:</span>{" "}
                    <span>{clip().label ?? "Untitled"}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Start:</span>{" "}
                    <span class="font-mono">{formatTime(clip().startTime)}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">End:</span>{" "}
                    <span class="font-mono">{formatTime(clip().endTime)}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Duration:</span>{" "}
                    <span class="font-mono">
                      {formatTime(clip().endTime - clip().startTime)}
                    </span>
                  </div>
                  <div class="pt-2">
                    <label class="text-gray-500 block mb-1">Volume</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={clip().volume}
                      class="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-gray-500 block mb-1">Speed</label>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.1"
                      value={clip().speed}
                      class="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-gray-500 block mb-1">Opacity</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={clip().opacity}
                      class="w-full accent-blue-500"
                    />
                  </div>
                </div>

                {/* Effect stack */}
                <div class="pt-2 border-t border-gray-800">
                  <h4 class="text-xs font-semibold text-gray-400 mb-2">Effects</h4>
                  <Show
                    when={clip().effectParams}
                    fallback={
                      <div class="text-xs text-gray-600">No effects applied</div>
                    }
                  >
                    <div class="bg-gray-800 rounded px-2 py-1 text-xs">
                      {clip().effectParams?.effectType}
                    </div>
                  </Show>
                </div>

                {/* Actions */}
                <div class="pt-2 border-t border-gray-800 space-y-1">
                  <button
                    type="button"
                    class="w-full px-2 py-1 text-xs bg-gray-800 rounded hover:bg-gray-700"
                    onClick={splitClipAtPlayhead}
                  >
                    Split at Playhead (S)
                  </button>
                  <button
                    type="button"
                    class="w-full px-2 py-1 text-xs bg-red-900/50 text-red-400 rounded hover:bg-red-900"
                    onClick={() => {
                      const id = selectedClipId();
                      if (id) removeClip(id);
                    }}
                  >
                    Delete Clip
                  </button>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>

      {/* Transport controls */}
      <div class="flex items-center gap-3 px-3 py-2 bg-gray-900 border-t border-gray-800">
        <button
          type="button"
          class="w-8 h-8 flex items-center justify-center hover:bg-gray-800 rounded"
          onClick={() => seekTo(0)}
          aria-label="Go to start"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          type="button"
          class="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-full"
          onClick={togglePlay}
          aria-label={isPlaying() ? "Pause" : "Play"}
        >
          <Show
            when={isPlaying()}
            fallback={
              <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            }
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          </Show>
        </button>

        <span class="text-xs font-mono tabular-nums text-gray-300 w-24">
          {formatTime(currentTime())} / {formatTime(timeline().duration)}
        </span>
      </div>

      {/* Timeline */}
      <div
        class="relative bg-gray-900 border-t border-gray-800 overflow-x-auto overflow-y-auto"
        style={{ "min-height": "200px", "max-height": "40vh" }}
        ref={timelineContainerRef}
        onClick={handleTimelineClick}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        {/* Time ruler */}
        <div
          class="sticky top-0 z-20 h-6 bg-gray-850 border-b border-gray-700"
          style={{ width: `${timelineWidth()}px`, "min-width": "100%" }}
        >
          <svg class="w-full h-full text-gray-500" style={{ width: `${timelineWidth()}px` }}>
            <For each={Array.from({ length: Math.ceil(timelineWidth() / pps()) + 1 })}>
              {(_, i) => {
                const x = (): number => i() * pps();
                return (
                  <>
                    <line x1={x()} y1="0" x2={x()} y2="24" stroke="currentColor" stroke-width="0.5" />
                    <text x={x() + 4} y="16" fill="currentColor" font-size="10" font-family="monospace">
                      {i()}s
                    </text>
                  </>
                );
              }}
            </For>
          </svg>
        </div>

        {/* Tracks */}
        <div style={{ width: `${timelineWidth()}px`, "min-width": "100%" }}>
          <For each={timeline().tracks as Track[]}>
            {(track) => (
              <div class="flex border-b border-gray-800" style={{ height: `${TRACK_HEIGHT}px` }}>
                {/* Track label */}
                <div class="sticky left-0 z-10 w-28 flex items-center gap-1 px-2 bg-gray-900 border-r border-gray-800 shrink-0">
                  <span
                    class={`w-2 h-2 rounded-full ${TRACK_COLORS[track.type]}`}
                  />
                  <span class="text-xs text-gray-400 truncate">
                    {track.label ?? TRACK_LABELS[track.type]}
                  </span>
                  <button
                    type="button"
                    class="ml-auto text-gray-600 hover:text-red-400 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTrack(track.id);
                    }}
                    aria-label="Remove track"
                  >
                    x
                  </button>
                </div>

                {/* Clip area */}
                <div class="relative flex-1">
                  <For each={track.clips}>
                    {(clip) => (
                      <div
                        class={`absolute top-1 bottom-1 rounded cursor-pointer border transition-all ${
                          selectedClipId() === clip.id
                            ? "border-white ring-1 ring-white/50"
                            : "border-transparent hover:border-white/30"
                        } ${TRACK_COLORS[track.type]}`}
                        style={clipStyle(clip)}
                        onMouseDown={(e) => handleClipMouseDown(clip.id, track.id, e)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                        }}
                      >
                        {/* Trim handles */}
                        <div
                          class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-white/30 hover:bg-white/60 rounded-l"
                          onMouseDown={(e) => handleTrimStart(clip.id, e)}
                        />
                        <div
                          class="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-white/30 hover:bg-white/60 rounded-r"
                          onMouseDown={(e) => handleTrimEnd(clip.id, e)}
                        />

                        {/* Clip label */}
                        <div class="px-2 py-0.5 text-xs truncate pointer-events-none">
                          {clip.label ?? clip.sourceId}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Playhead */}
        <div
          class="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
          style={{ left: `${playheadX() + 112}px` }}
        >
          <div class="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 clip-triangle" />
        </div>
      </div>
    </div>
  );
}

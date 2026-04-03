import { Title } from "@solidjs/meta";
import { For, Show, createSignal } from "solid-js";
import { Button, Card, Text, Stack } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useVideoEditor } from "../stores/video";
import { getAvailableEffects } from "../lib/video/effects";
import type { VideoEffect } from "../lib/video/engine";

// ── Timeline Bar ─────────────────────────────────────────────────────

function TimelineBar(props: {
  editor: ReturnType<typeof useVideoEditor>;
}): ReturnType<typeof Card> {
  const totalDur = (): number => props.editor.timeline().totalDuration || 1;

  return (
    <Card class="w-full" padding="sm">
      <Text variant="caption" weight="semibold" class="mb-2">
        Timeline ({props.editor.timeline().totalDuration.toFixed(1)}s)
      </Text>
      <div class="relative h-16 bg-neutral-800 rounded-lg overflow-hidden flex">
        <For each={props.editor.timeline().clips}>
          {(clip) => {
            const widthPct = (): string =>
              `${((clip.duration / totalDur()) * 100).toFixed(2)}%`;
            const isSelected = (): boolean =>
              props.editor.selectedClip() === clip.id;

            return (
              <button
                type="button"
                class={`h-full flex items-center justify-center text-xs text-white truncate px-2 border-r border-neutral-700 cursor-pointer transition-colors ${
                  isSelected()
                    ? "bg-blue-600"
                    : "bg-neutral-600 hover:bg-neutral-500"
                }`}
                style={{ width: widthPct(), "min-width": "40px" }}
                onClick={() => props.editor.selectClip(clip.id)}
              >
                {clip.src.split("/").pop() ?? "Clip"}
              </button>
            );
          }}
        </For>
        <Show when={props.editor.timeline().clips.length === 0}>
          <div class="flex-1 flex items-center justify-center text-neutral-400 text-sm">
            No clips — add a clip to get started
          </div>
        </Show>
      </div>
    </Card>
  );
}

// ── Clip List Sidebar ────────────────────────────────────────────────

function ClipSidebar(props: {
  editor: ReturnType<typeof useVideoEditor>;
}): ReturnType<typeof Card> {
  const effects = getAvailableEffects();

  return (
    <Card class="w-full h-full overflow-y-auto" padding="sm">
      <Text variant="h4" weight="bold" class="mb-3">
        Clips
      </Text>
      <For each={props.editor.timeline().clips}>
        {(clip, index) => {
          const isSelected = (): boolean =>
            props.editor.selectedClip() === clip.id;

          return (
            <div
              class={`p-3 rounded-lg mb-2 cursor-pointer transition-colors ${
                isSelected()
                  ? "bg-blue-600/20 border border-blue-500"
                  : "bg-neutral-800 border border-transparent hover:border-neutral-600"
              }`}
              onClick={() => props.editor.selectClip(clip.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.editor.selectClip(clip.id);
              }}
              role="button"
              tabIndex={0}
            >
              <Text variant="body" weight="semibold">
                {clip.src.split("/").pop() ?? `Clip ${index() + 1}`}
              </Text>
              <Text variant="caption" class="text-neutral-400">
                {clip.startTime.toFixed(1)}s — {(clip.startTime + clip.duration).toFixed(1)}s
                ({clip.duration.toFixed(1)}s)
              </Text>
              <Show when={clip.effects.length > 0}>
                <Text variant="caption" class="text-blue-400">
                  Effects: {clip.effects.map((e) => e.type).join(", ")}
                </Text>
              </Show>
              <Show when={isSelected()}>
                <Stack direction="horizontal" gap="xs" class="mt-2 flex-wrap">
                  <For each={effects}>
                    {(effectType) => (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          const effect: VideoEffect = {
                            type: effectType,
                            duration: 0.5,
                          };
                          props.editor.applyEffect(clip.id, effect);
                        }}
                      >
                        {effectType}
                      </Button>
                    )}
                  </For>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      props.editor.removeClip(clip.id);
                    }}
                  >
                    Remove
                  </Button>
                </Stack>
              </Show>
            </div>
          );
        }}
      </For>
      <Show when={props.editor.timeline().clips.length === 0}>
        <Text variant="body" class="text-neutral-400">
          No clips yet. Add a clip using the controls below the preview.
        </Text>
      </Show>
    </Card>
  );
}

// ── Preview Area ─────────────────────────────────────────────────────

function PreviewArea(): ReturnType<typeof Card> {
  return (
    <Card class="w-full flex-1" padding="none">
      <div class="flex flex-col h-full">
        <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
          <Text variant="caption" weight="semibold">
            Preview
          </Text>
        </div>
        <div class="flex-1 flex items-center justify-center bg-black text-neutral-500">
          <Stack direction="vertical" align="center" gap="sm">
            <Text variant="h3" class="text-neutral-500">
              Video Preview
            </Text>
            <Text variant="body" class="text-neutral-500">
              WebGPU-accelerated preview will render here once clips are loaded.
            </Text>
          </Stack>
        </div>
      </div>
    </Card>
  );
}

// ── Add Clip Controls ────────────────────────────────────────────────

function AddClipControls(props: {
  editor: ReturnType<typeof useVideoEditor>;
}): ReturnType<typeof Stack> {
  const [src, setSrc] = createSignal("");
  const [duration, setDuration] = createSignal("5");

  const handleAdd = (): void => {
    const srcVal = src().trim();
    if (!srcVal) return;

    const dur = Number.parseFloat(duration()) || 5;
    const currentEnd = props.editor.timeline().totalDuration;

    props.editor.addClip({
      src: srcVal,
      startTime: currentEnd,
      duration: dur,
      effects: [],
    });

    setSrc("");
  };

  return (
    <Stack direction="horizontal" gap="sm" align="end" class="w-full">
      <div class="flex-1">
        <label class="block text-sm text-neutral-400 mb-1" for="clip-src">
          Source URL
        </label>
        <input
          id="clip-src"
          type="text"
          class="w-full rounded-lg bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          placeholder="/videos/intro.mp4"
          value={src()}
          onInput={(e) => setSrc(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
      </div>
      <div class="w-24">
        <label class="block text-sm text-neutral-400 mb-1" for="clip-dur">
          Duration (s)
        </label>
        <input
          id="clip-dur"
          type="number"
          min="0.1"
          step="0.5"
          class="w-full rounded-lg bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          value={duration()}
          onInput={(e) => setDuration(e.currentTarget.value)}
        />
      </div>
      <Button variant="primary" onClick={handleAdd} disabled={!src().trim()}>
        Add Clip
      </Button>
    </Stack>
  );
}

// ── Render Controls ──────────────────────────────────────────────────

function RenderControls(props: {
  editor: ReturnType<typeof useVideoEditor>;
}): ReturnType<typeof Stack> {
  const [format, setFormat] = createSignal<"mp4" | "webm">("webm");
  const [quality, setQuality] = createSignal<"draft" | "preview" | "final">("preview");

  const handleRender = async (): Promise<void> => {
    await props.editor.render({
      outputFormat: format(),
      quality: quality(),
    });
  };

  return (
    <Stack direction="horizontal" gap="sm" align="center">
      <select
        class="rounded-lg bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        value={format()}
        onChange={(e) => setFormat(e.currentTarget.value as "mp4" | "webm")}
      >
        <option value="webm">WebM</option>
        <option value="mp4">MP4</option>
      </select>
      <select
        class="rounded-lg bg-neutral-800 border border-neutral-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        value={quality()}
        onChange={(e) =>
          setQuality(e.currentTarget.value as "draft" | "preview" | "final")
        }
      >
        <option value="draft">Draft</option>
        <option value="preview">Preview</option>
        <option value="final">Final</option>
      </select>
      <Button
        variant="primary"
        onClick={handleRender}
        loading={props.editor.rendering()}
        disabled={props.editor.timeline().clips.length === 0}
      >
        Render
      </Button>
      <Show when={props.editor.renderProgress()}>
        {(progress) => (
          <Text variant="caption" class="text-neutral-400">
            {progress().percent}% — Clip {progress().currentClip}/{progress().totalClips}
            ({progress().estimatedTimeRemaining.toFixed(1)}s remaining)
          </Text>
        )}
      </Show>
    </Stack>
  );
}

// ── Video Editor Page ────────────────────────────────────────────────

export default function VideoPage(): ReturnType<typeof ProtectedRoute> {
  const editor = useVideoEditor();

  return (
    <ProtectedRoute>
      <Title>AI Video Builder - Back to the Future</Title>
      <div class="flex flex-col h-full gap-3 p-4">
        {/* Header */}
        <Stack direction="horizontal" justify="between" align="center">
          <Text variant="h3" weight="bold">
            AI Video Builder
          </Text>
          <RenderControls editor={editor} />
        </Stack>

        {/* Main area: sidebar + preview */}
        <div class="flex flex-1 gap-3 min-h-0">
          <div class="w-72 flex-shrink-0">
            <ClipSidebar editor={editor} />
          </div>
          <div class="flex-1 flex flex-col gap-3 min-h-0">
            <PreviewArea />
            <AddClipControls editor={editor} />
          </div>
        </div>

        {/* Timeline */}
        <TimelineBar editor={editor} />
      </div>
    </ProtectedRoute>
  );
}

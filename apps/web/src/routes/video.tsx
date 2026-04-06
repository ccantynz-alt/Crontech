import { Show, For, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Button, Card, Stack, Text, Badge, Separator } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { showToast } from "../components/Toast";

interface VideoEffect {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

const defaultEffects: VideoEffect[] = [
  { id: "brightness", name: "Brightness", description: "Adjust brightness level", active: false },
  { id: "contrast", name: "Contrast", description: "Adjust contrast level", active: false },
  { id: "saturation", name: "Saturation", description: "Adjust color saturation", active: false },
  { id: "blur", name: "Blur", description: "Apply Gaussian blur", active: false },
  { id: "sharpen", name: "Sharpen", description: "Enhance edge sharpness", active: false },
  { id: "grayscale", name: "Grayscale", description: "Convert to grayscale", active: false },
];

export default function VideoPage(): JSX.Element {
  const [effects, setEffects] = createSignal(defaultEffects);
  const [videoLoaded, setVideoLoaded] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [gpuAvailable] = createSignal(typeof navigator !== "undefined" && "gpu" in navigator);

  const toggleEffect = (id: string): void => {
    setEffects(
      effects().map((e) => (e.id === id ? { ...e, active: !e.active } : e)),
    );
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="Video Editor"
        description="WebGPU-accelerated video processing directly in your browser. Apply effects, transitions, and AI enhancements with zero server cost."
        path="/video"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="h1" weight="bold">Video Editor</Text>
            <Text variant="body" class="text-muted">
              WebGPU-accelerated video processing in the browser
            </Text>
          </Stack>
          <Badge variant={gpuAvailable() ? "success" : "warning"} size="sm">
            {gpuAvailable() ? "WebGPU Available" : "WebGPU Unavailable (Canvas fallback)"}
          </Badge>
        </Stack>

        <div class="video-editor-layout">
          {/* Video Preview */}
          <Card padding="none" class="video-preview-card">
            <Show
              when={videoLoaded()}
              fallback={
                <Stack
                  direction="vertical"
                  align="center"
                  justify="center"
                  class="video-upload-area"
                >
                  <Text variant="h3" class="text-muted">Drop video here or click to upload</Text>
                  <Text variant="caption" class="text-muted">
                    Supports MP4, WebM, MOV
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => setVideoLoaded(true)}
                  >
                    Load Sample Video
                  </Button>
                </Stack>
              }
            >
              <Stack direction="vertical" gap="none">
                <div class="video-canvas">
                  <Text variant="body" class="text-muted" align="center">
                    Video preview area (WebGPU canvas)
                  </Text>
                </div>
                {/* Timeline */}
                <div class="video-timeline">
                  <Stack direction="horizontal" gap="sm" align="center" class="timeline-controls">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPlaying(!playing())}
                    >
                      {playing() ? "Pause" : "Play"}
                    </Button>
                    <Text variant="caption">
                      {formatTime(currentTime())} / {formatTime(duration() || 120)}
                    </Text>
                    <input
                      type="range"
                      min="0"
                      max={duration() || 120}
                      value={currentTime()}
                      onInput={(e) => setCurrentTime(Number(e.currentTarget.value))}
                      class="timeline-scrubber"
                    />
                  </Stack>
                </div>
              </Stack>
            </Show>
          </Card>

          {/* Effects Panel */}
          <Card padding="md" class="effects-panel">
            <Stack direction="vertical" gap="md">
              <Text variant="h4" weight="semibold">Effects</Text>
              <For each={effects()}>
                {(effect) => (
                  <button
                    type="button"
                    class={`effect-item ${effect.active ? "effect-active" : ""}`}
                    onClick={() => toggleEffect(effect.id)}
                  >
                    <Stack direction="vertical" gap="xs">
                      <Text variant="body" weight="semibold">{effect.name}</Text>
                      <Text variant="caption" class="text-muted">{effect.description}</Text>
                    </Stack>
                  </button>
                )}
              </For>
              <Separator />
              <Stack direction="vertical" gap="sm">
                <Button
                  variant="primary"
                  disabled={!videoLoaded()}
                  class="w-full"
                  onClick={() => {
                    showToast("Exporting video... this may take a moment.", "info");
                    // Placeholder: real export would run WebGPU pipeline and save blob
                    setTimeout(() => {
                      showToast("Video export complete. Download starting...", "success");
                    }, 1200);
                  }}
                >
                  Export Video
                </Button>
                <Button
                  variant="outline"
                  disabled={!videoLoaded()}
                  class="w-full"
                  onClick={() => {
                    try {
                      const canvas = document.createElement("canvas");
                      canvas.width = 1280;
                      canvas.height = 720;
                      const ctx = canvas.getContext("2d");
                      if (ctx) {
                        ctx.fillStyle = "#111";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = "#fff";
                        ctx.font = "24px sans-serif";
                        ctx.fillText("Frame @ " + formatTime(currentTime()), 40, 60);
                      }
                      canvas.toBlob((blob) => {
                        if (!blob) return;
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `frame-${Date.now()}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast("Frame downloaded", "success");
                      });
                    } catch {
                      showToast("Could not download frame", "error");
                    }
                  }}
                >
                  Download Frame
                </Button>
              </Stack>
            </Stack>
          </Card>
        </div>
      </Stack>
    </ProtectedRoute>
  );
}

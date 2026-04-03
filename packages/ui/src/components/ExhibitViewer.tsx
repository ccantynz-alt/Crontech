import type { JSX } from "solid-js";
import { Match, Switch, splitProps } from "solid-js";

export type ExhibitType = "pdf" | "image" | "video" | "audio";

export interface ExhibitViewerProps {
  src: string;
  type: ExhibitType;
  title?: string;
  exhibitNumber?: string;
  class?: string;
}

export function ExhibitViewer(props: ExhibitViewerProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "src",
    "type",
    "title",
    "exhibitNumber",
    "class",
  ]);

  return (
    <div
      class={`exhibit-viewer ${local.class ?? ""}`}
      role="figure"
      aria-label={local.title ?? "Exhibit"}
      {...rest}
    >
      {/* Exhibit Header */}
      <div class="exhibit-viewer-header">
        {local.exhibitNumber && (
          <span class="badge badge-info badge-sm" role="status">
            Exhibit {local.exhibitNumber}
          </span>
        )}
        {local.title && (
          <span class="exhibit-viewer-title">{local.title}</span>
        )}
      </div>

      {/* Exhibit Content */}
      <div class="exhibit-viewer-content">
        <Switch>
          <Match when={local.type === "image"}>
            <img
              src={local.src}
              alt={local.title ?? `Exhibit ${local.exhibitNumber ?? ""}`}
              class="exhibit-viewer-image"
              loading="lazy"
            />
          </Match>
          <Match when={local.type === "pdf"}>
            <div class="exhibit-viewer-placeholder">
              <div class="exhibit-viewer-placeholder-icon" aria-hidden="true">
                PDF
              </div>
              <span class="exhibit-viewer-placeholder-label">
                PDF Document
              </span>
              <a
                href={local.src}
                target="_blank"
                rel="noopener noreferrer"
                class="exhibit-viewer-link"
              >
                Open PDF
              </a>
            </div>
          </Match>
          <Match when={local.type === "video"}>
            <div class="exhibit-viewer-placeholder">
              <div class="exhibit-viewer-placeholder-icon" aria-hidden="true">
                VIDEO
              </div>
              <span class="exhibit-viewer-placeholder-label">
                Video Exhibit
              </span>
              <a
                href={local.src}
                target="_blank"
                rel="noopener noreferrer"
                class="exhibit-viewer-link"
              >
                Open Video
              </a>
            </div>
          </Match>
          <Match when={local.type === "audio"}>
            <div class="exhibit-viewer-placeholder">
              <div class="exhibit-viewer-placeholder-icon" aria-hidden="true">
                AUDIO
              </div>
              <span class="exhibit-viewer-placeholder-label">
                Audio Exhibit
              </span>
              <a
                href={local.src}
                target="_blank"
                rel="noopener noreferrer"
                class="exhibit-viewer-link"
              >
                Open Audio
              </a>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

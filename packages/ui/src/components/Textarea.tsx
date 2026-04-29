import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  resize?: "none" | "vertical" | "horizontal" | "both";
}

export function Textarea(props: TextareaProps): JSX.Element {
  const [local, rest] = splitProps(props, ["label", "error", "resize", "class", "id"]);

  const inputId =
    local.id ??
    (local.label ? `textarea-${local.label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div class="textarea-wrapper">
      <Show when={local.label}>
        <label class="textarea-label" for={inputId}>
          {local.label}
        </label>
      </Show>
      <textarea
        id={inputId}
        class={`textarea ${local.error ? "textarea-error" : ""} ${local.class ?? ""}`}
        style={{ resize: local.resize ?? "vertical" }}
        aria-invalid={!!local.error}
        {...rest}
      />
      <Show when={local.error}>
        <span class="textarea-error-text">{local.error}</span>
      </Show>
    </div>
  );
}

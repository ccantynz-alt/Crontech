import type { JSX } from "solid-js";
import { splitProps, Show } from "solid-js";

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  resize?: "none" | "vertical" | "horizontal" | "both";
}

export function Textarea(props: TextareaProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "label",
    "error",
    "resize",
    "class",
  ]);

  return (
    <div class="textarea-wrapper">
      <Show when={local.label}>
        <label class="textarea-label">{local.label}</label>
      </Show>
      <textarea
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

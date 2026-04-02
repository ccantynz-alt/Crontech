import { type JSX, Show, splitProps, createEffect, onCleanup } from "solid-js";

export interface ModalProps {
  open?: boolean;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  onClose?: () => void;
  class?: string;
  children?: JSX.Element;
}

export function Modal(props: ModalProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "open",
    "title",
    "description",
    "size",
    "onClose",
    "class",
    "children",
  ]);

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && local.onClose) {
      local.onClose();
    }
  };

  createEffect(() => {
    if (local.open) {
      document.addEventListener("keydown", handleKeyDown);
    } else {
      document.removeEventListener("keydown", handleKeyDown);
    }
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Show when={local.open}>
      <div
        class="modal-overlay"
        role="presentation"
        onClick={() => local.onClose?.()}
      >
        <div
          class={`modal modal-${local.size ?? "md"} ${local.class ?? ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={local.title}
          onClick={(e) => e.stopPropagation()}
          {...rest}
        >
          <Show when={local.title}>
            <div class="modal-header">
              <h2 class="modal-title">{local.title}</h2>
              <button
                class="modal-close"
                aria-label="Close"
                onClick={() => local.onClose?.()}
              >
                &times;
              </button>
            </div>
          </Show>
          <Show when={local.description}>
            <p class="modal-description">{local.description}</p>
          </Show>
          <div class="modal-body">{local.children}</div>
        </div>
      </div>
    </Show>
  );
}

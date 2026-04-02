import { type JSX, Show, splitProps, createSignal } from "solid-js";

export interface TooltipProps {
  content: string;
  position?: "top" | "bottom" | "left" | "right";
  class?: string;
  children?: JSX.Element;
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "content",
    "position",
    "class",
    "children",
  ]);

  const [visible, setVisible] = createSignal(false);

  return (
    <div
      class={`tooltip-wrapper ${local.class ?? ""}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocusIn={() => setVisible(true)}
      onFocusOut={() => setVisible(false)}
      {...rest}
    >
      {local.children}
      <Show when={visible()}>
        <div
          class={`tooltip tooltip-${local.position ?? "top"}`}
          role="tooltip"
        >
          {local.content}
        </div>
      </Show>
    </div>
  );
}

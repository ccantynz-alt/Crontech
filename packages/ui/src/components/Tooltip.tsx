import { type JSX, splitProps } from "solid-js";
import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";

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

  return (
    <KobalteTooltip placement={local.position ?? "top"} {...rest}>
      <KobalteTooltip.Trigger
        class={`tooltip-wrapper ${local.class ?? ""}`}
        as="span"
      >
        {local.children}
      </KobalteTooltip.Trigger>
      <KobalteTooltip.Portal>
        <KobalteTooltip.Content
          class={`tooltip tooltip-${local.position ?? "top"}`}
        >
          {local.content}
        </KobalteTooltip.Content>
      </KobalteTooltip.Portal>
    </KobalteTooltip>
  );
}

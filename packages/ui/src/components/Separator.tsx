import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  class?: string;
}

export function Separator(props: SeparatorProps): JSX.Element {
  const [local, rest] = splitProps(props, ["orientation", "class"]);

  return (
    <div
      class={`separator separator-${local.orientation ?? "horizontal"} ${local.class ?? ""}`}
      role="separator"
      aria-orientation={local.orientation ?? "horizontal"}
      {...rest}
    />
  );
}

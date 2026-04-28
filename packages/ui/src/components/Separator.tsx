import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  class?: string;
}

export function Separator(props: SeparatorProps): JSX.Element {
  const [local, rest] = splitProps(props, ["orientation", "class"]);

  return (
    <hr
      class={`separator separator-${local.orientation ?? "horizontal"} ${local.class ?? ""}`}
      aria-orientation={local.orientation ?? "horizontal"}
      {...rest}
    />
  );
}

import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  class?: string;
}

export function Spinner(props: SpinnerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["size", "class"]);

  return (
    <output
      class={`spinner spinner-${local.size ?? "md"} ${local.class ?? ""}`}
      aria-label="Loading"
      {...rest}
    >
      <span class="spinner-visual" aria-hidden="true" />
    </output>
  );
}

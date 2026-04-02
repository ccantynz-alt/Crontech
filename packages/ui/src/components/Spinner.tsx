import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  class?: string;
}

export function Spinner(props: SpinnerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["size", "class"]);

  return (
    <div
      class={`spinner spinner-${local.size ?? "md"} ${local.class ?? ""}`}
      role="status"
      aria-label="Loading"
      {...rest}
    >
      <span class="spinner-visual" aria-hidden="true" />
    </div>
  );
}

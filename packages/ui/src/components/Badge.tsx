import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md";
  class?: string;
  children?: JSX.Element;
}

export function Badge(props: BadgeProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "class",
    "children",
  ]);

  return (
    <span
      class={`badge badge-${local.variant ?? "default"} badge-${local.size ?? "md"} ${local.class ?? ""}`}
      role="status"
      {...rest}
    >
      {local.children}
    </span>
  );
}

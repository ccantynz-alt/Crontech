import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "loading",
    "disabled",
    "children",
    "class",
  ]);

  return (
    <button
      disabled={local.disabled || local.loading}
      class={`btn btn-${local.variant ?? "default"} btn-${local.size ?? "md"} ${local.class ?? ""}`}
      {...rest}
    >
      {local.loading ? "Loading..." : local.children}
    </button>
  );
}

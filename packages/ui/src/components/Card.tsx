import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface CardProps {
  title?: string;
  description?: string;
  padding?: "none" | "sm" | "md" | "lg";
  class?: string;
  children?: JSX.Element;
}

export function Card(props: CardProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "title",
    "description",
    "padding",
    "class",
    "children",
  ]);

  return (
    <div class={`card card-padding-${local.padding ?? "md"} ${local.class ?? ""}`} {...rest}>
      {local.title && <h3 class="card-title">{local.title}</h3>}
      {local.description && <p class="card-description">{local.description}</p>}
      {local.children}
    </div>
  );
}

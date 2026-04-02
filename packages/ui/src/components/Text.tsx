import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface TextProps {
  content?: string;
  variant?: "h1" | "h2" | "h3" | "h4" | "body" | "caption" | "code";
  weight?: "normal" | "medium" | "semibold" | "bold";
  align?: "left" | "center" | "right";
  class?: string;
  children?: JSX.Element;
}

const variantTagMap = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  caption: "span",
  code: "code",
} as const;

export function Text(props: TextProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "content",
    "variant",
    "weight",
    "align",
    "class",
    "children",
  ]);

  const tag = (): string => variantTagMap[local.variant ?? "body"];

  return (
    <Dynamic
      component={tag()}
      class={`text-${local.variant ?? "body"} font-${local.weight ?? "normal"} text-${local.align ?? "left"} ${local.class ?? ""}`}
      {...rest}
    >
      {local.content ?? local.children}
    </Dynamic>
  );
}

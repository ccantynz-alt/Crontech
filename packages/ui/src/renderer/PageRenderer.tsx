import { type JSX, For, Show, createMemo } from "solid-js";
import { ComponentSchema } from "@cronix/schemas";
import type { Component as ComponentConfig } from "@cronix/schemas";
import { ComponentRenderer } from "./ComponentRenderer";

export interface PageRendererProps {
  components: ComponentConfig[];
}

interface ValidatedComponent {
  index: number;
  config: ComponentConfig;
  valid: true;
}

interface InvalidComponent {
  index: number;
  error: string;
  valid: false;
}

type ValidationResult = ValidatedComponent | InvalidComponent;

/**
 * Renders an error boundary for invalid component configs.
 * Displays the validation error without crashing the rest of the page.
 */
function RenderError(props: { index: number; error: string }): JSX.Element {
  return (
    <div
      role="alert"
      class="renderer-error"
      style={{
        padding: "12px",
        border: "1px solid #ef4444",
        "background-color": "#fef2f2",
        color: "#991b1b",
        "border-radius": "4px",
        "font-size": "14px",
        margin: "4px 0",
      }}
    >
      <strong>Component {props.index} validation error:</strong> {props.error}
    </div>
  );
}

/**
 * PageRenderer: Renders a full page from an array of AI-generated component configs.
 *
 * Each config is validated against the ComponentSchema before rendering.
 * Invalid configs display an error boundary instead of crashing the page.
 * Valid configs are rendered through ComponentRenderer.
 */
export function PageRenderer(props: PageRendererProps): JSX.Element {
  const validatedComponents = createMemo((): ValidationResult[] =>
    props.components.map((config, index): ValidationResult => {
      const result = ComponentSchema.safeParse(config);
      if (result.success) {
        return { index, config: result.data as ComponentConfig, valid: true };
      }
      return {
        index,
        error: result.error.issues.map((i) => i.message).join("; "),
        valid: false,
      };
    }),
  );

  return (
    <div class="page-renderer">
      <For each={validatedComponents()}>
        {(item) => (
          <Show
            when={item.valid && item}
            fallback={
              <RenderError
                index={(item as InvalidComponent).index}
                error={(item as InvalidComponent).error}
              />
            }
          >
            {(validItem) => (
              <ComponentRenderer config={validItem().config} />
            )}
          </Show>
        )}
      </For>
    </div>
  );
}

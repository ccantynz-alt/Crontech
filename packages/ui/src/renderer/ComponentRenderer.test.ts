import { describe, expect, test } from "bun:test";
import { ComponentSchema } from "@back-to-the-future/schemas";

/**
 * Tests for the generative UI renderer.
 *
 * Since SolidJS components require a DOM + JSX compiler to render,
 * these tests validate the schema layer that feeds into
 * ComponentRenderer and PageRenderer. Valid configs parse successfully;
 * invalid configs are caught before they reach the renderer.
 */

describe("ComponentRenderer schema validation", () => {
  test("valid Button config parses successfully", () => {
    const config = {
      component: "Button",
      props: { label: "Click me", variant: "primary", size: "md", disabled: false, loading: false },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Text config parses successfully", () => {
    const config = {
      component: "Text",
      props: { content: "Hello world", variant: "h1", weight: "bold", align: "center" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Input config parses successfully", () => {
    const config = {
      component: "Input",
      props: { name: "email", type: "email", placeholder: "Enter email", required: true, disabled: false },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Badge config parses successfully", () => {
    const config = {
      component: "Badge",
      props: { label: "New", variant: "success", size: "sm" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Alert config parses successfully", () => {
    const config = {
      component: "Alert",
      props: { variant: "warning", title: "Warning", description: "Something happened", dismissible: true },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Spinner config parses successfully", () => {
    const config = {
      component: "Spinner",
      props: { size: "lg" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Separator config parses successfully", () => {
    const config = {
      component: "Separator",
      props: { orientation: "horizontal" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Avatar config parses successfully", () => {
    const config = {
      component: "Avatar",
      props: { src: "https://example.com/photo.jpg", alt: "User", size: "lg" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Select config parses successfully", () => {
    const config = {
      component: "Select",
      props: {
        options: [
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ],
        placeholder: "Choose one",
        disabled: false,
      },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Textarea config parses successfully", () => {
    const config = {
      component: "Textarea",
      props: { placeholder: "Type here...", rows: 5, resize: "vertical", required: false, disabled: false },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Tabs config parses successfully", () => {
    const config = {
      component: "Tabs",
      props: {
        items: [
          { id: "tab1", label: "Tab 1" },
          { id: "tab2", label: "Tab 2" },
        ],
        defaultTab: "tab1",
      },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Tooltip config parses successfully", () => {
    const config = {
      component: "Tooltip",
      props: { content: "Help text", position: "top" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("valid Modal config parses successfully", () => {
    const config = {
      component: "Modal",
      props: { title: "Confirm", description: "Are you sure?", open: true, size: "md" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe("Nested children validation", () => {
  test("Card with nested children parses successfully", () => {
    const config = {
      component: "Card",
      props: { title: "My Card", padding: "md" },
      children: [
        { component: "Text", props: { content: "Inside the card", variant: "body", weight: "normal", align: "left" } },
        { component: "Button", props: { label: "Action", variant: "primary", size: "md", disabled: false, loading: false } },
      ],
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("Stack with deeply nested children parses successfully", () => {
    const config = {
      component: "Stack",
      props: { direction: "vertical", gap: "md", align: "stretch", justify: "start" },
      children: [
        {
          component: "Card",
          props: { title: "Nested Card", padding: "sm" },
          children: [
            {
              component: "Stack",
              props: { direction: "horizontal", gap: "sm", align: "center", justify: "between" },
              children: [
                { component: "Badge", props: { label: "Status", variant: "info", size: "sm" } },
                { component: "Spinner", props: { size: "sm" } },
              ],
            },
          ],
        },
        { component: "Separator", props: { orientation: "horizontal" } },
        { component: "Text", props: { content: "Footer", variant: "caption", weight: "normal", align: "center" } },
      ],
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("Alert with children parses successfully", () => {
    const config = {
      component: "Alert",
      props: { variant: "error", title: "Error", dismissible: true },
      children: [
        { component: "Text", props: { content: "Something went wrong", variant: "body", weight: "normal", align: "left" } },
      ],
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("Tooltip with children parses successfully", () => {
    const config = {
      component: "Tooltip",
      props: { content: "Help text", position: "bottom" },
      children: [
        { component: "Button", props: { label: "Hover me", variant: "ghost", size: "sm", disabled: false, loading: false } },
      ],
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe("Unknown and invalid configs", () => {
  test("unknown component type fails validation", () => {
    const config = {
      component: "NonExistentWidget",
      props: { foo: "bar" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("missing required props fails validation", () => {
    const config = {
      component: "Button",
      props: {},
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("invalid prop value fails validation", () => {
    const config = {
      component: "Button",
      props: { label: "OK", variant: "banana" },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("invalid child in children array fails validation", () => {
    const config = {
      component: "Card",
      props: { padding: "md" },
      children: [
        { component: "InvalidChild", props: {} },
      ],
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("completely empty object fails validation", () => {
    const result = ComponentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("null input fails validation", () => {
    const result = ComponentSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  test("string input fails validation", () => {
    const result = ComponentSchema.safeParse("not a component");
    expect(result.success).toBe(false);
  });

  test("Select with empty options array fails validation", () => {
    const config = {
      component: "Select",
      props: { options: [], disabled: false },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("Tabs with empty items array fails validation", () => {
    const config = {
      component: "Tabs",
      props: { items: [] },
    };
    const result = ComponentSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("PageRenderer validation logic", () => {
  test("mixed valid and invalid configs are individually validated", () => {
    const configs: unknown[] = [
      { component: "Text", props: { content: "Valid", variant: "body", weight: "normal", align: "left" } },
      { component: "FakeComponent", props: {} },
      { component: "Button", props: { label: "Also valid", variant: "default", size: "md", disabled: false, loading: false } },
    ];

    const results = configs.map((c) => ComponentSchema.safeParse(c));
    expect(results[0]?.success).toBe(true);
    expect(results[1]?.success).toBe(false);
    expect(results[2]?.success).toBe(true);
  });

  test("all valid configs pass validation", () => {
    const configs: unknown[] = [
      { component: "Text", props: { content: "Title", variant: "h1", weight: "bold", align: "left" } },
      { component: "Separator", props: { orientation: "horizontal" } },
      { component: "Button", props: { label: "Submit", variant: "primary", size: "lg", disabled: false, loading: false } },
    ];

    const allValid = configs.every((c) => ComponentSchema.safeParse(c).success);
    expect(allValid).toBe(true);
  });

  test("all invalid configs fail validation", () => {
    const configs: unknown[] = [
      { component: "Nope", props: {} },
      null,
      42,
    ];

    const allInvalid = configs.every((c) => !ComponentSchema.safeParse(c).success);
    expect(allInvalid).toBe(true);
  });
});

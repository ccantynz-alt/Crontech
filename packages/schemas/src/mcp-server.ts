import { z } from "zod";
import {
  ComponentCatalog,
  ComponentSchema,
  type ComponentName,
} from "./components";

// ── MCP Component Info Interface ─────────────────────────────────────
// Machine-readable component metadata for AI agent discovery via MCP.

export interface MCPComponentInfo {
  name: string;
  description: string;
  props: Record<
    string,
    {
      type: string;
      required: boolean;
      default?: unknown;
      description: string;
    }
  >;
  slots: string[];
  variants: string[];
  examples: Array<{ name: string; config: unknown }>;
}

// ── Component Descriptions ───────────────────────────────────────────
// Human-readable descriptions for every component in the catalog.

const componentDescriptions: Record<string, string> = {
  Button:
    "Interactive button component supporting multiple visual variants, sizes, loading states, and click handlers. Use for primary actions, form submissions, and navigation triggers.",
  Input:
    "Text input field supporting multiple input types (text, email, password, number, search, tel, url), validation errors, labels, and placeholder text. Use for single-line user data entry.",
  Card:
    "Container component with optional title and description, configurable padding. Accepts children components for flexible content composition. Use for grouping related content.",
  Stack:
    "Layout component that arranges children in horizontal or vertical stacks with configurable gap, alignment, and justification. The primary layout primitive for composing UI.",
  Text:
    "Typography component for rendering text content with semantic variants (h1-h4, body, caption, code), font weights, and text alignment. Use for all textual content.",
  Modal:
    "Dialog overlay component with title, optional description, and configurable size. Accepts children for custom modal body content. Use for focused interactions and confirmations.",
  Badge:
    "Small status indicator component with semantic color variants (default, success, warning, error, info). Use for labels, counts, and status tags.",
  Alert:
    "Notification banner component with semantic variants (info, success, warning, error), optional title and description, and dismissible support. Use for user-facing messages.",
  Avatar:
    "User representation component displaying an image, initials, or fallback. Configurable sizes. Use for user profiles, comment authors, and presence indicators.",
  Tabs:
    "Tabbed navigation component accepting an array of tab items with labels and optional disabled state. Use for switching between related content panels.",
  Select:
    "Dropdown selection component with typed options, placeholder text, labels, and validation error display. Use for choosing from a predefined list of values.",
  Textarea:
    "Multi-line text input component with configurable rows, resize behavior, labels, and validation. Use for longer-form text entry such as comments and descriptions.",
  Spinner:
    "Loading indicator component with configurable size. Use to signal asynchronous operations in progress.",
  Tooltip:
    "Contextual hint component that displays text content on hover, positioned relative to its child element. Use for supplementary information and icon labels.",
  Separator:
    "Visual divider component with horizontal or vertical orientation. Use to separate sections of content within a layout.",
  Timeline:
    "Case chronology timeline component displaying a vertical list of dated events. Events are color-coded by type (event, filing, hearing, deadline). Use for legal case timelines and chronological displays.",
  ExhibitViewer:
    "Multi-format exhibit viewer that renders images, PDFs, video, or audio exhibits with exhibit number badges. Use for displaying legal evidence and court exhibits.",
  ChainOfCustody:
    "Chain of custody tracker displaying a log of custody transfer events with timestamps, actions, actors, and cryptographic verification status. Use for evidence integrity tracking.",
};

// ── Component Examples ───────────────────────────────────────────────

const componentExamples: Record<
  string,
  Array<{ name: string; config: unknown }>
> = {
  Button: [
    {
      name: "Primary button",
      config: {
        component: "Button",
        props: { variant: "primary", size: "md", label: "Submit" },
      },
    },
    {
      name: "Destructive button",
      config: {
        component: "Button",
        props: { variant: "destructive", size: "md", label: "Delete" },
      },
    },
    {
      name: "Loading button",
      config: {
        component: "Button",
        props: {
          variant: "primary",
          size: "md",
          label: "Saving...",
          loading: true,
        },
      },
    },
  ],
  Input: [
    {
      name: "Email input",
      config: {
        component: "Input",
        props: {
          type: "email",
          name: "email",
          label: "Email",
          placeholder: "you@example.com",
          required: true,
        },
      },
    },
    {
      name: "Password input",
      config: {
        component: "Input",
        props: {
          type: "password",
          name: "password",
          label: "Password",
          required: true,
        },
      },
    },
  ],
  Card: [
    {
      name: "Content card",
      config: {
        component: "Card",
        props: {
          title: "Project Overview",
          description: "Summary of recent activity",
          padding: "md",
        },
        children: [
          {
            component: "Text",
            props: { content: "Card body content goes here.", variant: "body" },
          },
        ],
      },
    },
  ],
  Stack: [
    {
      name: "Vertical stack",
      config: {
        component: "Stack",
        props: { direction: "vertical", gap: "md", align: "stretch" },
        children: [
          {
            component: "Text",
            props: { content: "First item", variant: "body" },
          },
          {
            component: "Text",
            props: { content: "Second item", variant: "body" },
          },
        ],
      },
    },
    {
      name: "Horizontal button group",
      config: {
        component: "Stack",
        props: { direction: "horizontal", gap: "sm", justify: "end" },
        children: [
          {
            component: "Button",
            props: { variant: "outline", label: "Cancel" },
          },
          {
            component: "Button",
            props: { variant: "primary", label: "Confirm" },
          },
        ],
      },
    },
  ],
  Text: [
    {
      name: "Page heading",
      config: {
        component: "Text",
        props: { content: "Dashboard", variant: "h1", weight: "bold" },
      },
    },
    {
      name: "Body text",
      config: {
        component: "Text",
        props: { content: "Welcome back.", variant: "body" },
      },
    },
  ],
  Modal: [
    {
      name: "Confirmation modal",
      config: {
        component: "Modal",
        props: {
          title: "Confirm Delete",
          description: "This action cannot be undone.",
          open: true,
          size: "sm",
        },
        children: [
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "sm", justify: "end" },
            children: [
              {
                component: "Button",
                props: { variant: "outline", label: "Cancel" },
              },
              {
                component: "Button",
                props: { variant: "destructive", label: "Delete" },
              },
            ],
          },
        ],
      },
    },
  ],
  Badge: [
    {
      name: "Success badge",
      config: {
        component: "Badge",
        props: { variant: "success", label: "Active" },
      },
    },
    {
      name: "Error badge",
      config: {
        component: "Badge",
        props: { variant: "error", label: "Failed" },
      },
    },
  ],
  Alert: [
    {
      name: "Info alert",
      config: {
        component: "Alert",
        props: {
          variant: "info",
          title: "Note",
          description: "Your session will expire in 10 minutes.",
          dismissible: true,
        },
      },
    },
    {
      name: "Error alert",
      config: {
        component: "Alert",
        props: {
          variant: "error",
          title: "Error",
          description: "Failed to save changes.",
        },
      },
    },
  ],
  Avatar: [
    {
      name: "Image avatar",
      config: {
        component: "Avatar",
        props: {
          src: "https://example.com/avatar.jpg",
          alt: "Jane Doe",
          size: "md",
        },
      },
    },
    {
      name: "Initials avatar",
      config: {
        component: "Avatar",
        props: { initials: "JD", size: "lg" },
      },
    },
  ],
  Tabs: [
    {
      name: "Settings tabs",
      config: {
        component: "Tabs",
        props: {
          items: [
            { id: "general", label: "General" },
            { id: "security", label: "Security" },
            { id: "billing", label: "Billing", disabled: true },
          ],
          defaultTab: "general",
        },
      },
    },
  ],
  Select: [
    {
      name: "Role selector",
      config: {
        component: "Select",
        props: {
          label: "Role",
          placeholder: "Choose a role",
          options: [
            { value: "admin", label: "Admin" },
            { value: "editor", label: "Editor" },
            { value: "viewer", label: "Viewer" },
          ],
          name: "role",
        },
      },
    },
  ],
  Textarea: [
    {
      name: "Comment input",
      config: {
        component: "Textarea",
        props: {
          label: "Comment",
          placeholder: "Write your comment...",
          rows: 4,
          resize: "vertical",
          name: "comment",
        },
      },
    },
  ],
  Spinner: [
    {
      name: "Default spinner",
      config: {
        component: "Spinner",
        props: { size: "md" },
      },
    },
  ],
  Tooltip: [
    {
      name: "Top tooltip",
      config: {
        component: "Tooltip",
        props: { content: "More information", position: "top" },
        children: [
          {
            component: "Button",
            props: { variant: "ghost", size: "icon", label: "?" },
          },
        ],
      },
    },
  ],
  Separator: [
    {
      name: "Horizontal divider",
      config: {
        component: "Separator",
        props: { orientation: "horizontal" },
      },
    },
  ],
  Timeline: [
    {
      name: "Case timeline",
      config: {
        component: "Timeline",
        props: {
          events: [
            { id: "1", date: "2024-01-15", title: "Case Filed", type: "filing" },
            { id: "2", date: "2024-02-10", title: "Initial Hearing", type: "hearing" },
            { id: "3", date: "2024-03-01", title: "Discovery Deadline", type: "deadline" },
          ],
        },
      },
    },
  ],
  ExhibitViewer: [
    {
      name: "Image exhibit",
      config: {
        component: "ExhibitViewer",
        props: {
          src: "https://example.com/exhibit-a.jpg",
          type: "image",
          title: "Photograph of Scene",
          exhibitNumber: "A-1",
        },
      },
    },
    {
      name: "PDF exhibit",
      config: {
        component: "ExhibitViewer",
        props: {
          src: "https://example.com/contract.pdf",
          type: "pdf",
          title: "Signed Contract",
          exhibitNumber: "B-1",
        },
      },
    },
  ],
  ChainOfCustody: [
    {
      name: "Evidence custody log",
      config: {
        component: "ChainOfCustody",
        props: {
          entries: [
            {
              id: "1",
              timestamp: "2024-01-15T09:00:00Z",
              action: "Evidence collected",
              actor: "Officer Smith",
              signature: "sig_abc123",
              hash: "a1b2c3d4e5f6g7h8i9j0",
            },
            {
              id: "2",
              timestamp: "2024-01-15T14:30:00Z",
              action: "Transferred to lab",
              actor: "Tech Johnson",
              signature: "sig_def456",
              hash: "b2c3d4e5f6g7h8i9j0k1",
            },
          ],
        },
      },
    },
  ],
};

// ── Component Slots ──────────────────────────────────────────────────
// Components that accept `children` expose slots.

const componentSlots: Record<string, string[]> = {
  Button: [],
  Input: [],
  Card: ["children"],
  Stack: ["children"],
  Text: [],
  Modal: ["children"],
  Badge: [],
  Alert: ["children"],
  Avatar: [],
  Tabs: [],
  Select: [],
  Textarea: [],
  Spinner: [],
  Tooltip: ["children"],
  Separator: [],
  Timeline: [],
  ExhibitViewer: [],
  ChainOfCustody: [],
};

// ── Schema Introspection Helpers ─────────────────────────────────────

function describeZodType(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodEnum) return `enum(${(schema as z.ZodEnum<[string, ...string[]]>).options.join(" | ")})`;
  if (schema instanceof z.ZodLiteral) return `literal(${String((schema as z.ZodLiteral<unknown>).value)})`;
  if (schema instanceof z.ZodOptional) return describeZodType((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
  if (schema instanceof z.ZodDefault) return describeZodType((schema as z.ZodDefault<z.ZodTypeAny>).removeDefault());
  if (schema instanceof z.ZodArray) return `array(${describeZodType((schema as z.ZodArray<z.ZodTypeAny>).element)})`;
  if (schema instanceof z.ZodObject) return "object";
  return "unknown";
}

function getDefaultValue(schema: z.ZodTypeAny): unknown | undefined {
  if (schema instanceof z.ZodDefault) {
    return (schema as z.ZodDefault<z.ZodTypeAny>)._def.defaultValue();
  }
  return undefined;
}

function isRequired(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional) return false;
  if (schema instanceof z.ZodDefault) return false;
  return true;
}

function describeProp(key: string, _componentName: string): string {
  // Provide meaningful descriptions based on common prop names
  const descriptions: Record<string, string> = {
    variant: "Visual style variant",
    size: "Size of the component",
    disabled: "Whether the component is disabled",
    loading: "Whether the component is in a loading state",
    label: "Text label displayed in the component",
    onClick: "Handler identifier for click events",
    type: "Input type attribute",
    placeholder: "Placeholder text displayed when empty",
    required: "Whether the field is required",
    error: "Validation error message",
    name: "Form field name attribute",
    title: "Title text",
    description: "Description text",
    padding: "Internal padding size",
    direction: "Layout direction",
    gap: "Spacing between child elements",
    align: "Cross-axis alignment",
    justify: "Main-axis justification",
    content: "Text content to display",
    weight: "Font weight",
    open: "Whether the component is open/visible",
    src: "Image source URL",
    alt: "Alternative text for accessibility",
    initials: "Initials to display as fallback",
    items: "Array of tab items",
    defaultTab: "ID of the initially selected tab",
    options: "Array of selectable options",
    value: "Currently selected value",
    rows: "Number of visible text rows",
    resize: "Resize behavior of the textarea",
    position: "Positioning relative to the trigger element",
    orientation: "Orientation of the separator",
    dismissible: "Whether the component can be dismissed",
    events: "Array of timeline events to display",
    date: "Date of the event",
    exhibitNumber: "Exhibit identification number",
    entries: "Array of chain of custody entries",
    timestamp: "ISO 8601 timestamp of the event",
    action: "Description of the custody action performed",
    actor: "Person or entity who performed the action",
    signature: "Cryptographic signature for verification",
    hash: "SHA-256 hash for tamper detection",
  };
  return descriptions[key] ?? `The ${key} property`;
}

function extractPropsInfo(
  schema: z.ZodTypeAny,
  componentName: string,
): MCPComponentInfo["props"] {
  // The schema is a ZodObject with a `props` field that is also a ZodObject
  if (!(schema instanceof z.ZodObject)) return {};
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  const propsSchema = shape.props;
  if (!propsSchema || !(propsSchema instanceof z.ZodObject)) return {};

  const propsShape = (propsSchema as z.ZodObject<z.ZodRawShape>).shape;
  const result: MCPComponentInfo["props"] = {};

  for (const [key, fieldSchema] of Object.entries(propsShape)) {
    const field = fieldSchema as z.ZodTypeAny;
    const defaultVal = getDefaultValue(field);
    const entry: MCPComponentInfo["props"][string] = {
      type: describeZodType(field),
      required: isRequired(field),
      description: describeProp(key, componentName),
    };
    if (defaultVal !== undefined) {
      entry.default = defaultVal;
    }
    result[key] = entry;
  }

  return result;
}

function extractVariants(schema: z.ZodTypeAny): string[] {
  if (!(schema instanceof z.ZodObject)) return [];
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  const propsSchema = shape.props;
  if (!propsSchema || !(propsSchema instanceof z.ZodObject)) return [];

  const propsShape = (propsSchema as z.ZodObject<z.ZodRawShape>).shape;
  const variantField = propsShape.variant;
  if (!variantField) return [];

  // Unwrap default/optional wrappers to get to the enum
  let inner: z.ZodTypeAny = variantField as z.ZodTypeAny;
  if (inner instanceof z.ZodDefault) inner = (inner as z.ZodDefault<z.ZodTypeAny>).removeDefault();
  if (inner instanceof z.ZodOptional) inner = (inner as z.ZodOptional<z.ZodTypeAny>).unwrap();

  if (inner instanceof z.ZodEnum) {
    return [...(inner as z.ZodEnum<[string, ...string[]]>).options];
  }
  return [];
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Returns detailed MCP-compatible info for a named component by
 * introspecting its Zod schema from ComponentCatalog.
 */
export function getComponentInfo(name: string): MCPComponentInfo | null {
  if (!(name in ComponentCatalog)) return null;

  const componentName = name as ComponentName;
  const schema = ComponentCatalog[componentName];

  return {
    name: componentName,
    description: componentDescriptions[componentName] ?? "",
    props: extractPropsInfo(schema, componentName),
    slots: componentSlots[componentName] ?? [],
    variants: extractVariants(schema),
    examples: componentExamples[componentName] ?? [],
  };
}

/**
 * Returns MCP-compatible info for all components in the catalog.
 */
export function listComponents(): MCPComponentInfo[] {
  return (Object.keys(ComponentCatalog) as ComponentName[]).map((name) => {
    // getComponentInfo is guaranteed non-null for catalog keys
    return getComponentInfo(name) as MCPComponentInfo;
  });
}

/**
 * Simple text search across component names and descriptions.
 * Case-insensitive. Matches partial strings.
 */
export function searchComponents(query: string): MCPComponentInfo[] {
  const lowerQuery = query.toLowerCase();
  return listComponents().filter((info) => {
    return (
      info.name.toLowerCase().includes(lowerQuery) ||
      info.description.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Validates an unknown config object against the ComponentSchema
 * discriminated union. Returns validation result with errors if invalid.
 */
export function validateComponentConfig(config: unknown): {
  valid: boolean;
  errors?: string[];
} {
  const result = ComponentSchema.safeParse(config);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  };
}

/**
 * Returns example configurations for a named component.
 */
export function getComponentExamples(
  name: string,
): Array<{ name: string; config: unknown }> {
  if (!(name in ComponentCatalog)) return [];
  const examples = componentExamples[name];
  return examples !== undefined ? examples : [];
}

// ── Site Generator ──────────────────────────────────────────────────
// Converts AI-generated component trees (PageLayout) into actual
// SolidJS source files, then bundles them into deployable static assets.

import { z } from "zod";
import type { PageLayout } from "../agents/site-builder";
import type { Component } from "@back-to-the-future/schemas";

// ── Types ───────────────────────────────────────────────────────────

/** Map of relative file paths to file content strings */
export type SiteFiles = Record<string, string>;

export const BundledSiteSchema = z.object({
  /** Map of output file paths to their content (ready for deployment) */
  files: z.record(z.string(), z.string()),
  /** Total size in bytes of all output files */
  totalSize: z.number(),
  /** Number of output files */
  fileCount: z.number(),
});

export type BundledSite = z.infer<typeof BundledSiteSchema>;

// ── Component-to-JSX Mapping ────────────────────────────────────────

/** Set of components that support children */
const CONTAINER_COMPONENTS = new Set(["Card", "Stack", "Modal", "Alert", "Tooltip"]);

/**
 * Converts a component tree node into SolidJS JSX source code.
 */
function componentToJSX(component: Component, indent: number = 2): string {
  const pad = " ".repeat(indent);
  const name = (component as { component: string }).component;
  const props = (component as { props: Record<string, unknown> }).props;
  const children = (component as { children?: Component[] }).children;

  // Build props string
  const propEntries = Object.entries(props)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `${key}="${escapeJSXString(value)}"`;
      }
      if (typeof value === "boolean") {
        return value ? key : `${key}={false}`;
      }
      if (typeof value === "number") {
        return `${key}={${value}}`;
      }
      // Arrays and objects
      return `${key}={${JSON.stringify(value)}}`;
    });

  const propsStr = propEntries.length > 0 ? ` ${propEntries.join(" ")}` : "";

  // Self-closing if no children supported or no children present
  if (!CONTAINER_COMPONENTS.has(name) || !children || children.length === 0) {
    return `${pad}<${name}${propsStr} />`;
  }

  // With children
  const childJSX = children
    .map((child: Component) => componentToJSX(child, indent + 2))
    .join("\n");

  return `${pad}<${name}${propsStr}>\n${childJSX}\n${pad}</${name}>`;
}

function escapeJSXString(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Collects all unique component names used in a component tree.
 */
function collectComponentNames(components: Component[]): Set<string> {
  const names = new Set<string>();

  function walk(comp: Component): void {
    const name = (comp as { component: string }).component;
    names.add(name);
    const children = (comp as { children?: Component[] }).children;
    if (children) {
      for (const child of children) {
        walk(child);
      }
    }
  }

  for (const comp of components) {
    walk(comp);
  }

  return names;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Takes a PageLayout and converts the component tree into actual SolidJS
 * source files that can be built and deployed.
 */
export function generateSiteFiles(layout: PageLayout): SiteFiles {
  const files: SiteFiles = {};
  const componentNames = collectComponentNames(layout.components);

  // Generate the main App component
  const imports = Array.from(componentNames).sort();
  const importLine = `import { ${imports.join(", ")} } from "./components";`;

  const componentJSX = layout.components
    .map((comp: Component) => componentToJSX(comp, 6))
    .join("\n");

  files["src/App.tsx"] = `${importLine}

function App() {
  return (
    <main>
${componentJSX}
    </main>
  );
}

export default App;
`;

  // Generate component stubs -- these map to the UI package components
  const componentExports = imports
    .map((name) => generateComponentStub(name))
    .join("\n\n");

  files["src/components.tsx"] = `// Auto-generated component implementations
// In production, these import from @back-to-the-future/ui

${componentExports}
`;

  // Generate entry point
  files["src/index.tsx"] = `import { render } from "solid-js/web";
import App from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("Root element #app not found");

render(() => <App />, root);
`;

  // Generate index.html
  files["index.html"] = generateIndexHtml(layout.title);

  // Generate package.json
  files["package.json"] = generatePackageJson(layout.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));

  return files;
}

/**
 * Generates a minimal index.html shell for a SolidJS SPA.
 */
export function generateIndexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <script type="module" src="/src/index.tsx"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;
}

/**
 * Generates a package.json for the generated site.
 */
export function generatePackageJson(name: string): string {
  const pkg = {
    name,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "bunx --bun vite",
      build: "bunx --bun vite build",
      preview: "bunx --bun vite preview",
    },
    dependencies: {
      "solid-js": "^1.9.0",
    },
    devDependencies: {
      "vite": "^6.0.0",
      "vite-plugin-solid": "^2.11.0",
      typescript: "^5.0.0",
    },
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * Bundles SolidJS source files into deployable static assets using Bun's bundler.
 */
export async function bundleSite(files: SiteFiles): Promise<BundledSite> {
  // Write files to a temp directory, bundle, and read output
  const tmpDir = `${globalThis.process?.env?.TMPDIR || "/tmp"}/btf-site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outDir = `${tmpDir}/dist`;

  try {
    // Write all source files to tmp
    const { mkdir, writeFile, readdir, readFile, rm } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(tmpDir, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    }

    // Write a vite config for building
    const viteConfig = `
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: "dist",
    target: "esnext",
    minify: true,
  },
});
`;
    await writeFile(join(tmpDir, "vite.config.ts"), viteConfig, "utf-8");

    // Write tsconfig for the generated site
    const tsConfig = {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "preserve",
        jsxImportSource: "solid-js",
        strict: true,
        noEmit: true,
      },
    };
    await writeFile(join(tmpDir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2), "utf-8");

    // Use Bun's bundler API directly for the build
    const entrypoint = join(tmpDir, "src/index.tsx");

    const buildResult = await Bun.build({
      entrypoints: [entrypoint],
      outdir: outDir,
      target: "browser",
      minify: true,
      sourcemap: "none",
      external: [],
    });

    if (!buildResult.success) {
      const errors = buildResult.logs
        .filter((log) => log.level === "error")
        .map((log) => log.message)
        .join("\n");
      throw new Error(`Bundle failed: ${errors}`);
    }

    // Read output files
    const outputFiles: Record<string, string> = {};
    let totalSize = 0;

    async function readDirRecursive(dir: string, baseDir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await readDirRecursive(fullPath, baseDir);
        } else {
          const relativePath = fullPath.slice(baseDir.length + 1);
          const content = await readFile(fullPath, "utf-8");
          outputFiles[relativePath] = content;
          totalSize += Buffer.byteLength(content, "utf-8");
        }
      }
    }

    await readDirRecursive(outDir, outDir);

    // Also include the index.html with the bundled script reference
    if (files["index.html"]) {
      // Rewrite index.html to point to bundled output
      const jsFiles = Object.keys(outputFiles).filter((f) => f.endsWith(".js"));
      const mainJs = jsFiles[0] ?? "index.js";
      const bundledHtml = files["index.html"].replace(
        '<script type="module" src="/src/index.tsx"></script>',
        `<script type="module" src="/${mainJs}"></script>`,
      );
      outputFiles["index.html"] = bundledHtml;
      totalSize += Buffer.byteLength(bundledHtml, "utf-8");
    }

    // Clean up temp directory
    await rm(tmpDir, { recursive: true, force: true });

    const result: BundledSite = {
      files: outputFiles,
      totalSize,
      fileCount: Object.keys(outputFiles).length,
    };

    return BundledSiteSchema.parse(result);
  } catch (error) {
    // Attempt cleanup on error
    try {
      const { rm } = await import("node:fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates a stub component implementation for a given component name.
 * These are minimal SolidJS components that render the correct structure.
 */
function generateComponentStub(name: string): string {
  switch (name) {
    case "Button":
      return `export function Button(props: { variant?: string; size?: string; disabled?: boolean; loading?: boolean; label: string; onClick?: string }) {
  return <button class={\`btn btn-\${props.variant || "default"} btn-\${props.size || "md"}\`} disabled={props.disabled || props.loading}>{props.loading ? "Loading..." : props.label}</button>;
}`;
    case "Input":
      return `export function Input(props: { type?: string; placeholder?: string; label?: string; required?: boolean; disabled?: boolean; error?: string; name: string }) {
  return (
    <div class="input-group">
      {props.label && <label for={props.name}>{props.label}</label>}
      <input type={props.type || "text"} name={props.name} placeholder={props.placeholder} required={props.required} disabled={props.disabled} id={props.name} />
      {props.error && <span class="error">{props.error}</span>}
    </div>
  );
}`;
    case "Card":
      return `export function Card(props: { title?: string; description?: string; padding?: string; children?: any }) {
  return (
    <div class={\`card card-pad-\${props.padding || "md"}\`}>
      {props.title && <h3 class="card-title">{props.title}</h3>}
      {props.description && <p class="card-desc">{props.description}</p>}
      {props.children}
    </div>
  );
}`;
    case "Stack":
      return `export function Stack(props: { direction?: string; gap?: string; align?: string; justify?: string; children?: any }) {
  return (
    <div class={\`stack stack-\${props.direction || "vertical"} gap-\${props.gap || "md"}\`} style={\`align-items:\${props.align || "stretch"};justify-content:\${props.justify || "start"}\`}>
      {props.children}
    </div>
  );
}`;
    case "Text":
      return `export function Text(props: { content: string; variant?: string; weight?: string; align?: string }) {
  const Tag = (props.variant === "h1" || props.variant === "h2" || props.variant === "h3" || props.variant === "h4") ? props.variant : "p";
  return <Tag class={\`text text-\${props.variant || "body"} font-\${props.weight || "normal"} text-\${props.align || "left"}\`}>{props.content}</Tag>;
}` as string;
    case "Modal":
      return `export function Modal(props: { title: string; description?: string; open?: boolean; size?: string; children?: any }) {
  return (
    <dialog open={props.open} class={\`modal modal-\${props.size || "md"}\`}>
      <h2>{props.title}</h2>
      {props.description && <p>{props.description}</p>}
      {props.children}
    </dialog>
  );
}`;
    case "Badge":
      return `export function Badge(props: { variant?: string; size?: string; label: string }) {
  return <span class={\`badge badge-\${props.variant || "default"} badge-\${props.size || "md"}\`}>{props.label}</span>;
}`;
    case "Alert":
      return `export function Alert(props: { variant?: string; title?: string; description?: string; dismissible?: boolean; children?: any }) {
  return (
    <div class={\`alert alert-\${props.variant || "info"}\`} role="alert">
      {props.title && <strong>{props.title}</strong>}
      {props.description && <p>{props.description}</p>}
      {props.children}
    </div>
  );
}`;
    case "Avatar":
      return `export function Avatar(props: { src?: string; alt?: string; initials?: string; size?: string }) {
  return props.src
    ? <img class={\`avatar avatar-\${props.size || "md"}\`} src={props.src} alt={props.alt || ""} />
    : <span class={\`avatar avatar-\${props.size || "md"}\`}>{props.initials || "?"}</span>;
}`;
    case "Tabs":
      return `export function Tabs(props: { items: Array<{ id: string; label: string; disabled?: boolean }>; defaultTab?: string }) {
  return (
    <div class="tabs" role="tablist">
      {props.items.map((item) => <button role="tab" disabled={item.disabled} class={\`tab \${item.id === props.defaultTab ? "active" : ""}\`}>{item.label}</button>)}
    </div>
  );
}`;
    case "Select":
      return `export function Select(props: { options: Array<{ value: string; label: string; disabled?: boolean }>; value?: string; placeholder?: string; label?: string; error?: string; disabled?: boolean; name?: string }) {
  return (
    <div class="select-group">
      {props.label && <label>{props.label}</label>}
      <select name={props.name} disabled={props.disabled} value={props.value}>
        {props.placeholder && <option value="" disabled>{props.placeholder}</option>}
        {props.options.map((opt) => <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>)}
      </select>
      {props.error && <span class="error">{props.error}</span>}
    </div>
  );
}`;
    case "Textarea":
      return `export function Textarea(props: { label?: string; error?: string; placeholder?: string; rows?: number; resize?: string; required?: boolean; disabled?: boolean; name?: string }) {
  return (
    <div class="textarea-group">
      {props.label && <label>{props.label}</label>}
      <textarea name={props.name} placeholder={props.placeholder} rows={props.rows || 3} required={props.required} disabled={props.disabled} style={\`resize:\${props.resize || "vertical"}\`} />
      {props.error && <span class="error">{props.error}</span>}
    </div>
  );
}`;
    case "Spinner":
      return `export function Spinner(props: { size?: string }) {
  return <div class={\`spinner spinner-\${props.size || "md"}\`} role="status" aria-label="Loading" />;
}`;
    case "Tooltip":
      return `export function Tooltip(props: { content: string; position?: string; children?: any }) {
  return <div class={\`tooltip tooltip-\${props.position || "top"}\`} data-tooltip={props.content}>{props.children}</div>;
}`;
    case "Separator":
      return `export function Separator(props: { orientation?: string }) {
  return <hr class={\`separator separator-\${props.orientation || "horizontal"}\`} />;
}`;
    default:
      return `export function ${name}(props: Record<string, unknown>) {
  return <div data-component="${name}">{JSON.stringify(props)}</div>;
}`;
  }
}

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
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("Root element #app not found");

render(() => <App />, root);
`;

  // Generate base styles
  files["src/styles.css"] = generateBaseStyles();

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

function generateBaseStyles(): string {
  return `/* Auto-generated base styles for Back to the Future sites */
:root {
  --color-primary: #6366f1;
  --color-primary-hover: #4f46e5;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-text-secondary: #64748b;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

main { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }

/* Stack */
.stack { display: flex; }
.stack-vertical { flex-direction: column; }
.stack-horizontal { flex-direction: row; flex-wrap: wrap; }
.gap-none { gap: 0; }
.gap-xs { gap: 0.25rem; }
.gap-sm { gap: 0.5rem; }
.gap-md { gap: 1rem; }
.gap-lg { gap: 1.5rem; }
.gap-xl { gap: 2rem; }

/* Button */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-border); border-radius: var(--radius);
  cursor: pointer; font-weight: 500; transition: all 0.15s;
}
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; }
.btn-md { padding: 0.5rem 1rem; font-size: 0.9375rem; }
.btn-lg { padding: 0.625rem 1.25rem; font-size: 1rem; }
.btn-default { background: var(--color-bg); color: var(--color-text); }
.btn-default:hover { background: var(--color-surface); }
.btn-primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }
.btn-primary:hover { background: var(--color-primary-hover); }
.btn-secondary { background: var(--color-surface); color: var(--color-text); }
.btn-destructive { background: var(--color-error); color: white; border-color: var(--color-error); }
.btn-outline { background: transparent; border-color: var(--color-border); }
.btn-ghost { background: transparent; border-color: transparent; }
.btn-ghost:hover { background: var(--color-surface); }
.btn-link { background: transparent; border: none; color: var(--color-primary); text-decoration: underline; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Card */
.card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); box-shadow: var(--shadow); }
.card-pad-none { padding: 0; }
.card-pad-sm { padding: 0.75rem; }
.card-pad-md { padding: 1.25rem; }
.card-pad-lg { padding: 2rem; }
.card-title { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.25rem; }
.card-desc { color: var(--color-text-secondary); font-size: 0.875rem; margin-bottom: 0.75rem; }

/* Text */
.text-h1 { font-size: 2.25rem; line-height: 1.2; }
.text-h2 { font-size: 1.75rem; line-height: 1.25; }
.text-h3 { font-size: 1.375rem; line-height: 1.3; }
.text-h4 { font-size: 1.125rem; line-height: 1.35; }
.text-body { font-size: 1rem; }
.text-caption { font-size: 0.8125rem; color: var(--color-text-secondary); }
.text-code { font-family: "SF Mono", "Fira Code", monospace; background: var(--color-surface); padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.875rem; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

/* Input */
.input-group { display: flex; flex-direction: column; gap: 0.375rem; }
.input-group label { font-size: 0.875rem; font-weight: 500; }
.input-group input, .textarea-group textarea, .select-group select {
  padding: 0.5rem 0.75rem; border: 1px solid var(--color-border);
  border-radius: var(--radius); font-size: 0.9375rem; outline: none;
  transition: border-color 0.15s;
}
.input-group input:focus, .textarea-group textarea:focus, .select-group select:focus {
  border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}
.error { color: var(--color-error); font-size: 0.8125rem; }

/* Badge */
.badge {
  display: inline-flex; align-items: center; border-radius: 9999px;
  font-weight: 500; white-space: nowrap;
}
.badge-sm { padding: 0.125rem 0.5rem; font-size: 0.75rem; }
.badge-md { padding: 0.25rem 0.625rem; font-size: 0.8125rem; }
.badge-default { background: var(--color-surface); color: var(--color-text); }
.badge-success { background: #dcfce7; color: #166534; }
.badge-warning { background: #fef3c7; color: #92400e; }
.badge-error { background: #fee2e2; color: #991b1b; }
.badge-info { background: #dbeafe; color: #1e40af; }

/* Alert */
.alert { padding: 1rem; border-radius: var(--radius); border: 1px solid; }
.alert-info { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
.alert-success { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.alert-warning { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.alert-error { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.alert strong { display: block; margin-bottom: 0.25rem; }

/* Avatar */
.avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; overflow: hidden; background: var(--color-surface); color: var(--color-text-secondary); font-weight: 600; }
.avatar-sm { width: 2rem; height: 2rem; font-size: 0.75rem; }
.avatar-md { width: 2.5rem; height: 2.5rem; font-size: 0.875rem; }
.avatar-lg { width: 3.5rem; height: 3.5rem; font-size: 1.125rem; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }

/* Tabs */
.tabs { display: flex; border-bottom: 2px solid var(--color-border); gap: 0; }
.tab {
  padding: 0.625rem 1rem; background: none; border: none; border-bottom: 2px solid transparent;
  margin-bottom: -2px; cursor: pointer; font-size: 0.9375rem; color: var(--color-text-secondary);
  transition: all 0.15s;
}
.tab:hover { color: var(--color-text); }
.tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 500; }
.tab:disabled { opacity: 0.4; cursor: not-allowed; }

/* Select */
.select-group { display: flex; flex-direction: column; gap: 0.375rem; }
.select-group label { font-size: 0.875rem; font-weight: 500; }

/* Textarea */
.textarea-group { display: flex; flex-direction: column; gap: 0.375rem; }
.textarea-group label { font-size: 0.875rem; font-weight: 500; }

/* Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner { border: 2px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 9999px; animation: spin 0.6s linear infinite; }
.spinner-sm { width: 1rem; height: 1rem; }
.spinner-md { width: 1.5rem; height: 1.5rem; }
.spinner-lg { width: 2rem; height: 2rem; }

/* Tooltip */
.tooltip { position: relative; display: inline-block; }
.tooltip::after {
  content: attr(data-tooltip); position: absolute; padding: 0.375rem 0.625rem;
  background: var(--color-text); color: white; border-radius: 4px; font-size: 0.75rem;
  white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.15s;
  z-index: 10;
}
.tooltip-top::after { bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 6px; }
.tooltip-bottom::after { top: 100%; left: 50%; transform: translateX(-50%); margin-top: 6px; }
.tooltip-left::after { right: 100%; top: 50%; transform: translateY(-50%); margin-right: 6px; }
.tooltip-right::after { left: 100%; top: 50%; transform: translateY(-50%); margin-left: 6px; }
.tooltip:hover::after { opacity: 1; }

/* Separator */
.separator { border: none; }
.separator-horizontal { border-top: 1px solid var(--color-border); width: 100%; margin: 0.5rem 0; }
.separator-vertical { border-left: 1px solid var(--color-border); height: 100%; margin: 0 0.5rem; display: inline-block; }

/* Modal */
dialog.modal { border: none; border-radius: var(--radius); box-shadow: 0 20px 60px rgba(0,0,0,0.15); padding: 1.5rem; max-height: 85vh; overflow-y: auto; }
dialog.modal::backdrop { background: rgba(0,0,0,0.4); }
.modal-sm { max-width: 24rem; }
.modal-md { max-width: 32rem; }
.modal-lg { max-width: 48rem; }
.modal-xl { max-width: 64rem; }
dialog.modal h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
`;
}

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

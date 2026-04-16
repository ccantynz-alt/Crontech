import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Input, Badge, Spinner } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { trpc } from "../../lib/trpc";

// ── Types ──────────────────────────────────────────────────────────────

type Platform = "vercel" | "netlify" | "railway" | "github";

interface ExternalProject {
  id: string;
  name: string;
  framework: string | null;
}

interface ImportResult {
  projectId: string;
  name: string;
  envVarsImported: number;
  domainsImported: number;
  framework: string | null;
}

type ImportStep =
  | "platform"
  | "token"
  | "select"
  | "review"
  | "importing"
  | "done";

interface ImportProgress {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

// ── Platform Metadata ──────────────────────────────────────────────────

interface PlatformMeta {
  id: Platform;
  name: string;
  color: string;
  icon: string;
  tokenUrl: string;
  tokenLabel: string;
  supported: boolean;
}

const PLATFORMS: PlatformMeta[] = [
  {
    id: "vercel",
    name: "Vercel",
    color: "#000000",
    icon: "V",
    tokenUrl: "https://vercel.com/account/tokens",
    tokenLabel: "Vercel API Token",
    supported: true,
  },
  {
    id: "netlify",
    name: "Netlify",
    color: "#00C7B7",
    icon: "N",
    tokenUrl: "https://app.netlify.com/user/applications#personal-access-tokens",
    tokenLabel: "Netlify Personal Access Token",
    supported: true,
  },
  {
    id: "railway",
    name: "Railway",
    color: "#0B0D0E",
    icon: "R",
    tokenUrl: "https://railway.app/account/tokens",
    tokenLabel: "Railway API Token",
    supported: false,
  },
  {
    id: "github",
    name: "GitHub",
    color: "#24292e",
    icon: "G",
    tokenUrl: "https://github.com/settings/tokens",
    tokenLabel: "GitHub Personal Access Token",
    supported: false,
  },
];

// ── Platform Card Component ────────────────────────────────────────────

interface PlatformCardProps {
  platform: PlatformMeta;
  selected: boolean;
  onSelect: () => void;
}

function PlatformCard(props: PlatformCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        if (props.platform.supported) {
          props.onSelect();
        }
      }}
      disabled={!props.platform.supported}
      class={`relative flex flex-col items-center gap-4 rounded-2xl border p-8 transition-all duration-300 cursor-pointer group ${
        props.selected
          ? "border-indigo-500 bg-indigo-50 shadow-sm"
          : props.platform.supported
            ? "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
            : "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed"
      }`}
    >
      {/* Platform icon */}
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white transition-transform duration-300 group-hover:scale-110"
        style={{
          background: props.platform.color,
        }}
      >
        {props.platform.icon}
      </div>

      <span class="text-lg font-semibold text-slate-900">
        {props.platform.name}
      </span>

      <Show when={!props.platform.supported}>
        <Badge variant="info" size="sm">
          Coming Soon
        </Badge>
      </Show>

      <Show when={props.selected}>
        <div class="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
          {"✓"}
        </div>
      </Show>
    </button>
  );
}

// ── Progress Step Component ────────────────────────────────────────────

interface ProgressItemProps {
  step: ImportProgress;
}

function ProgressItem(props: ProgressItemProps): JSX.Element {
  return (
    <div class="flex items-center gap-4 py-3">
      <div class="flex h-8 w-8 items-center justify-center">
        <Show when={props.step.status === "done"}>
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            {"✓"}
          </div>
        </Show>
        <Show when={props.step.status === "active"}>
          <Spinner size="sm" />
        </Show>
        <Show when={props.step.status === "pending"}>
          <div class="h-3 w-3 rounded-full bg-slate-200" />
        </Show>
        <Show when={props.step.status === "error"}>
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 border border-rose-200 text-rose-700">
            {"!"}
          </div>
        </Show>
      </div>
      <span
        class={`text-sm font-medium transition-colors duration-300 ${
          props.step.status === "done"
            ? "text-emerald-700"
            : props.step.status === "active"
              ? "text-slate-900"
              : props.step.status === "error"
                ? "text-rose-700"
                : "text-slate-500"
        }`}
      >
        {props.step.label}
      </span>
    </div>
  );
}

// ── Main Import Wizard ─────────────────────────────────────────────────

export default function ImportProject(): JSX.Element {
  const navigate = useNavigate();

  // Wizard state
  const [step, setStep] = createSignal<ImportStep>("platform");
  const [selectedPlatform, setSelectedPlatform] = createSignal<Platform | null>(null);
  const [token, setToken] = createSignal("");
  const [tokenError, setTokenError] = createSignal("");
  const [externalProjects, setExternalProjects] = createSignal<ExternalProject[]>([]);
  const [selectedProject, setSelectedProject] = createSignal<ExternalProject | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [importResult, setImportResult] = createSignal<ImportResult | null>(null);
  const [importError, setImportError] = createSignal("");
  const [progressSteps, setProgressSteps] = createSignal<ImportProgress[]>([]);

  // Helpers
  function getPlatformMeta(): PlatformMeta | undefined {
    const id = selectedPlatform();
    return PLATFORMS.find((p) => p.id === id);
  }

  function resetWizard(): void {
    setStep("platform");
    setSelectedPlatform(null);
    setToken("");
    setTokenError("");
    setExternalProjects([]);
    setSelectedProject(null);
    setLoading(false);
    setImportResult(null);
    setImportError("");
    setProgressSteps([]);
  }

  // Step handlers
  function handlePlatformSelect(platform: Platform): void {
    setSelectedPlatform(platform);
    setStep("token");
    setTokenError("");
    setToken("");
  }

  async function handleTokenSubmit(): Promise<void> {
    const t = token().trim();
    if (!t) {
      setTokenError("Please enter your API token.");
      return;
    }

    setLoading(true);
    setTokenError("");

    try {
      const platform = selectedPlatform();
      let projectList: ExternalProject[] = [];

      if (platform === "vercel") {
        projectList = await trpc.import.listVercelProjects.mutate({
          token: t,
        });
      } else if (platform === "netlify") {
        projectList = await trpc.import.listNetlifyProjects.mutate({
          token: t,
        });
      }

      if (projectList.length === 0) {
        setTokenError("No projects found. Check your token permissions.");
        setLoading(false);
        return;
      }

      setExternalProjects(projectList);
      setStep("select");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect. Check your token.";
      setTokenError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleProjectSelect(project: ExternalProject): void {
    setSelectedProject(project);
    setStep("review");
  }

  async function handleImport(): Promise<void> {
    const project = selectedProject();
    const platform = selectedPlatform();
    const t = token().trim();

    if (!project || !platform || !t) return;

    setStep("importing");
    setImportError("");

    const steps: ImportProgress[] = [
      { label: "Connecting to platform...", status: "active" },
      { label: "Creating project...", status: "pending" },
      { label: "Importing environment variables...", status: "pending" },
      { label: "Configuring domains...", status: "pending" },
      { label: "Finalizing import...", status: "pending" },
    ];
    setProgressSteps([...steps]);

    // Animate through steps with a slight delay for visual feedback
    const updateStep = (index: number, status: ImportProgress["status"]): void => {
      const current = [...progressSteps()];
      const s = current[index];
      if (s) {
        s.status = status;
      }
      setProgressSteps([...current]);
    };

    try {
      // Step 1: Connecting
      await delay(600);
      updateStep(0, "done");
      updateStep(1, "active");

      // Step 2-4: Do the actual import
      await delay(400);

      let result: ImportResult;

      if (platform === "vercel") {
        result = await trpc.import.importFromVercel.mutate({
          token: t,
          projectId: project.id,
        });
      } else if (platform === "netlify") {
        result = await trpc.import.importFromNetlify.mutate({
          token: t,
          siteId: project.id,
        });
      } else {
        throw new Error("Unsupported platform");
      }

      // Finish animating steps
      updateStep(1, "done");
      updateStep(2, "active");
      await delay(500);

      updateStep(2, "done");
      updateStep(3, "active");
      await delay(500);

      updateStep(3, "done");
      updateStep(4, "active");
      await delay(400);

      updateStep(4, "done");

      setImportResult(result);
      setStep("done");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Import failed. Please try again.";
      setImportError(message);

      // Mark current active step as error
      const current = [...progressSteps()];
      for (const s of current) {
        if (s.status === "active") {
          s.status = "error";
          break;
        }
      }
      setProgressSteps([...current]);
    }
  }

  // Redirect to project after import
  function handleGoToProject(): void {
    const result = importResult();
    if (result) {
      navigate(`/dashboard`);
    }
  }

  return (
    <ProtectedRoute>
      <Title>Import Project | Crontech</Title>

      <div class="min-h-screen bg-white px-4 py-12">
        <div class="mx-auto max-w-3xl">
          {/* Header */}
          <div class="mb-10 text-center">
            <h1 class="text-4xl font-bold tracking-tight text-slate-900">
              Import Project
            </h1>
            <p class="mt-3 text-base text-slate-600">
              Migrate your project to Crontech in one click. We handle everything.
            </p>
          </div>

          {/* Step Indicator */}
          <div class="mb-10 flex items-center justify-center gap-2">
            <For each={["Platform", "Token", "Project", "Review", "Import"]}>
              {(label, i) => {
                const stepOrder: ImportStep[] = [
                  "platform",
                  "token",
                  "select",
                  "review",
                  "importing",
                ];
                const currentIdx = (): number =>
                  stepOrder.indexOf(step() === "done" ? "importing" : step());
                const isActive = (): boolean => i() === currentIdx();
                const isCompleted = (): boolean => i() < currentIdx() || step() === "done";

                return (
                  <div class="flex items-center gap-2">
                    <Show when={i() > 0}>
                      <div
                        class={`h-px w-8 transition-colors duration-300 ${
                          isCompleted() ? "bg-indigo-500" : "bg-slate-200"
                        }`}
                      />
                    </Show>
                    <div
                      class={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                        isActive()
                          ? "bg-indigo-600 text-white"
                          : isCompleted()
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Show when={isCompleted()} fallback={i() + 1}>
                        {"✓"}
                      </Show>
                    </div>
                    <span
                      class={`hidden text-xs font-medium sm:inline ${
                        isActive()
                          ? "text-slate-900"
                          : isCompleted()
                            ? "text-indigo-700"
                            : "text-slate-500"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Step 1: Choose Platform */}
          <Show when={step() === "platform"}>
            <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 class="mb-2 text-xl font-semibold text-slate-900">
                Where is your project hosted?
              </h2>
              <p class="mb-8 text-sm text-slate-600">
                Select the platform you want to import from.
              </p>

              <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <For each={PLATFORMS}>
                  {(platform) => (
                    <PlatformCard
                      platform={platform}
                      selected={selectedPlatform() === platform.id}
                      onSelect={() => handlePlatformSelect(platform.id)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Step 2: Enter API Token */}
          <Show when={step() === "token"}>
            <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 class="mb-2 text-xl font-semibold text-slate-900">
                Connect to {getPlatformMeta()?.name}
              </h2>
              <p class="mb-6 text-sm text-slate-600">
                Enter your API token. We use it only for this import and never store it.
              </p>

              <div class="space-y-4">
                <Input
                  label={getPlatformMeta()?.tokenLabel ?? "API Token"}
                  type="password"
                  placeholder="Enter your API token..."
                  value={token()}
                  onInput={(e) => {
                    setToken(e.currentTarget.value);
                    setTokenError("");
                  }}
                  error={tokenError()}
                />

                <p class="text-xs text-slate-500">
                  Get your token:{" "}
                  <a
                    href={getPlatformMeta()?.tokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-indigo-600 underline decoration-indigo-300 hover:decoration-indigo-600"
                  >
                    {getPlatformMeta()?.name} Token Settings
                  </a>
                </p>

                <div class="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setStep("platform");
                      setToken("");
                      setTokenError("");
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      void handleTokenSubmit();
                    }}
                    loading={loading()}
                    disabled={!token().trim()}
                  >
                    Connect & Fetch Projects
                  </Button>
                </div>
              </div>
            </div>
          </Show>

          {/* Step 3: Select Project */}
          <Show when={step() === "select"}>
            <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 class="mb-2 text-xl font-semibold text-slate-900">
                Select a project to import
              </h2>
              <p class="mb-6 text-sm text-slate-600">
                Found {externalProjects().length} project
                {externalProjects().length !== 1 ? "s" : ""} on{" "}
                {getPlatformMeta()?.name}.
              </p>

              <div class="max-h-96 space-y-2 overflow-y-auto pr-1">
                <For each={externalProjects()}>
                  {(project) => (
                    <button
                      type="button"
                      class={`flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
                        selectedProject()?.id === project.id
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={() => handleProjectSelect(project)}
                    >
                      <div class="flex flex-col gap-1">
                        <span class="font-medium text-slate-900">
                          {project.name}
                        </span>
                        <Show when={project.framework}>
                          <span class="text-xs text-slate-500">
                            Framework: {project.framework}
                          </span>
                        </Show>
                      </div>
                      <svg
                        class="h-5 w-5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  )}
                </For>
              </div>

              <div class="mt-6 flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep("token");
                    setSelectedProject(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          </Show>

          {/* Step 4: Review */}
          <Show when={step() === "review"}>
            <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 class="mb-2 text-xl font-semibold text-slate-900">
                Review import
              </h2>
              <p class="mb-6 text-sm text-slate-600">
                Confirm the details below before importing.
              </p>

              <div class="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600">Source Platform</span>
                  <Badge variant="info">{getPlatformMeta()?.name}</Badge>
                </div>
                <div class="h-px bg-slate-200" />
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600">Project Name</span>
                  <span class="font-medium text-slate-900">
                    {selectedProject()?.name}
                  </span>
                </div>
                <div class="h-px bg-slate-200" />
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600">Framework</span>
                  <span class="text-sm text-slate-900">
                    {selectedProject()?.framework ?? "Not detected"}
                  </span>
                </div>
                <div class="h-px bg-slate-200" />
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600">What we will import</span>
                  <div class="flex gap-2">
                    <Badge>Project Config</Badge>
                    <Badge>Env Vars</Badge>
                    <Badge>Domains</Badge>
                  </div>
                </div>
              </div>

              <div class="mt-6 flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setStep("select")}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    void handleImport();
                  }}
                >
                  Start Import
                </Button>
              </div>
            </div>
          </Show>

          {/* Step 5: Importing */}
          <Show when={step() === "importing"}>
            <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 class="mb-2 text-xl font-semibold text-slate-900">
                Importing {selectedProject()?.name}...
              </h2>
              <p class="mb-6 text-sm text-slate-600">
                Sit back. We are migrating everything for you.
              </p>

              <div class="space-y-1">
                <For each={progressSteps()}>
                  {(s) => <ProgressItem step={s} />}
                </For>
              </div>

              <Show when={importError()}>
                <div class="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p class="text-sm text-rose-700">{importError()}</p>
                  <div class="mt-3 flex gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetWizard}
                    >
                      Start Over
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        void handleImport();
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* Step 6: Done */}
          <Show when={step() === "done"}>
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center shadow-sm">
              {/* Success icon */}
              <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">
                {"✓"}
              </div>

              <h2 class="mb-2 text-2xl font-bold text-slate-900">
                Import Complete
              </h2>
              <p class="mb-8 text-base text-slate-600">
                <strong class="text-slate-900">{importResult()?.name}</strong> has
                been imported to Crontech.
              </p>

              {/* Import summary */}
              <div class="mx-auto mb-8 grid max-w-md grid-cols-3 gap-4">
                <div class="rounded-xl border border-slate-200 bg-white p-4">
                  <div class="text-2xl font-bold text-indigo-700">1</div>
                  <div class="text-xs text-slate-600">Project</div>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white p-4">
                  <div class="text-2xl font-bold text-indigo-700">
                    {importResult()?.envVarsImported ?? 0}
                  </div>
                  <div class="text-xs text-slate-600">Env Vars</div>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white p-4">
                  <div class="text-2xl font-bold text-indigo-700">
                    {importResult()?.domainsImported ?? 0}
                  </div>
                  <div class="text-xs text-slate-600">Domains</div>
                </div>
              </div>

              <div class="flex justify-center gap-3">
                <Button variant="ghost" onClick={resetWizard}>
                  Import Another
                </Button>
                <Button variant="primary" onClick={handleGoToProject}>
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ── Utility ────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

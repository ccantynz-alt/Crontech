import type { JSX } from "solid-js";
import { Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Button } from "@back-to-the-future/ui";
import { useAuth, useTheme } from "../stores";
import { NotificationCenter } from "./NotificationCenter";

// BLK-008 — light-first, Stripe-direction premium shell. Dark mode
// layers on top via `html.dark` CSS variables (see app.css).

// ── Sidebar nav items ────────────────────────────────────────────────

interface SidebarNavItem {
  href: string;
  label: string;
  icon: string;
}

const sidebarNavItems: readonly SidebarNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "\u25A0" },
  { href: "/builder", label: "Composer", icon: "\u26A1" },
  { href: "/chat", label: "Chat", icon: "\u{1F4AC}" },
  { href: "/projects", label: "Projects", icon: "\u{1F4C1}" },
  { href: "/templates", label: "Templates", icon: "\u{1F4CB}" },
  { href: "/repos", label: "Repos", icon: "\u{1F5C2}" },
  { href: "/ops", label: "Ops Theatre", icon: "\u25B6" },
  { href: "/flywheel", label: "Flywheel", icon: "\u27F3" },
  { href: "/settings", label: "Settings", icon: "\u2699" },
  { href: "/admin", label: "Admin", icon: "\u{1F512}" },
] as const;

// ── Nav Link (top navbar) ────────────────────────────────────────────

interface NavLinkProps {
  href: string;
  label: string;
}

function NavLink(props: NavLinkProps): JSX.Element {
  const location = useLocation();
  const isActive = (): boolean => location.pathname === props.href;

  return (
    <A
      href={props.href}
      class="relative rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150"
      classList={{
        "bg-slate-100 text-slate-900": isActive(),
        "text-slate-600 hover:bg-slate-100 hover:text-slate-900": !isActive(),
      }}
    >
      {props.label}
    </A>
  );
}

// ── User Menu (restrained, light-first) ──────────────────────────────

function UserMenu(): JSX.Element {
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent): void => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };

  createEffect(() => {
    if (menuOpen()) {
      document.addEventListener("click", handleClickOutside);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  const userInitial = (): string =>
    auth.currentUser()?.displayName?.charAt(0).toUpperCase() ?? "?";

  const roleBadgeColor = (): string => {
    const role = auth.currentUser()?.role;
    if (role === "admin") return "bg-rose-50 text-rose-700 border-rose-200";
    if (role === "editor") return "bg-violet-50 text-violet-700 border-violet-200";
    return "bg-sky-50 text-sky-700 border-sky-200";
  };

  return (
    <div class="relative" ref={menuRef}>
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-200"
        onClick={() => setMenuOpen(!menuOpen())}
        type="button"
        aria-label="User menu"
      >
        {userInitial()}
      </button>

      <Show when={menuOpen()}>
        <div
          class="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          style="animation: crontech-menu-enter 0.15s ease"
        >
          <div class="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700">
                {userInitial()}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-900">
                  {auth.currentUser()?.displayName}
                </p>
                <p class="mt-0.5 truncate text-xs text-slate-500">
                  {auth.currentUser()?.email}
                </p>
                <Show when={auth.currentUser()?.role}>
                  <span
                    class={`mt-1.5 inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roleBadgeColor()}`}
                  >
                    {auth.currentUser()?.role}
                  </span>
                </Show>
              </div>
            </div>
          </div>

          <div class="py-1">
            <A
              href="/dashboard"
              class="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900"
              onClick={() => setMenuOpen(false)}
            >
              <span class="text-slate-400">{"\u25A0"}</span>
              <span class="font-medium">Dashboard</span>
            </A>
            <A
              href="/settings"
              class="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900"
              onClick={() => setMenuOpen(false)}
            >
              <span class="text-slate-400">{"\u2699"}</span>
              <span class="font-medium">Settings</span>
            </A>
          </div>

          <div class="border-t border-slate-100 py-1">
            <button
              class="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => {
                setMenuOpen(false);
                auth.logout();
              }}
              type="button"
            >
              <span class="text-slate-400">{"\u279C"}</span>
              <span class="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── Theme Toggle ─────────────────────────────────────────────────────

function ThemeToggle(): JSX.Element {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      class="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
      onClick={toggleTheme}
      aria-label={isDark() ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <Show when={isDark()} fallback={<span class="text-lg">{"\u263E"}</span>}>
        <span class="text-lg">{"\u2600"}</span>
      </Show>
    </button>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function Sidebar(props: SidebarProps): JSX.Element {
  const location = useLocation();
  const isActive = (href: string): boolean => location.pathname === href;

  return (
    <aside
      class="relative flex shrink-0 flex-col border-r border-slate-200 bg-slate-50 transition-all duration-300 ease-out"
      classList={{
        "w-[68px]": props.collapsed,
        "w-60": !props.collapsed,
      }}
    >
      <div
        class="flex h-12 items-center border-b border-slate-200"
        classList={{
          "justify-center": props.collapsed,
          "justify-end pr-3": !props.collapsed,
        }}
      >
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-200 hover:text-slate-900"
          onClick={props.onToggle}
          type="button"
          aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {props.collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      <nav class="flex-1 overflow-y-auto px-2 py-3">
        <For each={sidebarNavItems}>
          {(item) => (
            <A
              href={item.href}
              class="relative my-0.5 flex items-center gap-3 rounded-md transition-colors duration-150"
              classList={{
                "justify-center px-0 py-2.5": props.collapsed,
                "px-3 py-2": !props.collapsed,
                "bg-white text-slate-900 shadow-sm": isActive(item.href),
                "text-slate-600 hover:bg-slate-100 hover:text-slate-900":
                  !isActive(item.href),
              }}
              title={props.collapsed ? item.label : undefined}
            >
              <span
                class="shrink-0 text-base"
                classList={{ "w-5 text-center": !props.collapsed }}
              >
                {item.icon}
              </span>
              <Show when={!props.collapsed}>
                <span class="truncate text-sm font-medium">{item.label}</span>
              </Show>
            </A>
          )}
        </For>
      </nav>

      <Show when={!props.collapsed}>
        <div class="border-t border-slate-200 px-4 py-3">
          <p class="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
            Crontech
          </p>
        </div>
      </Show>
    </aside>
  );
}

// ── Layout ───────────────────────────────────────────────────────────

interface LayoutProps {
  children: JSX.Element;
}

export function Layout(props: LayoutProps): JSX.Element {
  const auth = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

  return (
    <div class="flex min-h-screen flex-col bg-white text-slate-900">
      {/* ── Navbar ────────────────────────────────────────────────── */}
      <header class="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div class="flex h-14 items-center justify-between px-4 md:px-6">
          {/* Left: logo + nav */}
          <div class="flex items-center gap-8">
            <A href="/" class="flex items-center gap-2">
              <span class="text-lg">{"\u26A1"}</span>
              <span class="text-lg font-bold tracking-tight text-slate-900">
                Crontech
              </span>
            </A>

            <nav class="hidden items-center gap-1 md:flex">
              <NavLink href="/" label="Home" />
              <Show when={auth.isAuthenticated()}>
                <NavLink href="/dashboard" label="Dashboard" />
                <NavLink href="/builder" label="Composer" />
                <NavLink href="/chat" label="Chat" />
                <NavLink href="/projects" label="Projects" />
              </Show>
              <NavLink href="/pricing" label="Pricing" />
              <NavLink href="/docs" label="Docs" />
            </nav>
          </div>

          {/* Right: actions */}
          <div class="flex items-center gap-2">
            <ThemeToggle />
            <Show when={auth.isAuthenticated()}>
              <NotificationCenter />
            </Show>
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <>
                  <A href="/login">
                    <Button variant="ghost" size="sm">
                      Sign in
                    </Button>
                  </A>
                  <A href="/register">
                    <Button variant="primary" size="sm">
                      Start building
                    </Button>
                  </A>
                </>
              }
            >
              <UserMenu />
            </Show>
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div class="flex flex-1 overflow-hidden">
        <Show when={auth.isAuthenticated()}>
          <Sidebar
            collapsed={sidebarCollapsed()}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed())}
          />
        </Show>
        <main class="flex-1 overflow-y-auto">{props.children}</main>
      </div>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer class="border-t border-slate-200 bg-slate-50">
        <div class="flex flex-col items-center justify-between gap-4 px-6 py-6 md:flex-row">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-sm">{"\u26A1"}</span>
              <span class="text-sm font-semibold tracking-tight text-slate-900">
                Crontech
              </span>
            </div>
            <span class="hidden h-4 w-px bg-slate-300 md:inline-block" />
            <span class="text-xs text-slate-500">
              {"\u00A9"} {new Date().getFullYear()} Crontech. All rights reserved.
            </span>
          </div>

          <nav class="flex flex-wrap items-center gap-1">
            <A
              href="/legal/terms"
              class="rounded px-2.5 py-1 text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
            >
              Terms
            </A>
            <A
              href="/legal/privacy"
              class="rounded px-2.5 py-1 text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
            >
              Privacy
            </A>
            <A
              href="/legal/dmca"
              class="rounded px-2.5 py-1 text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
            >
              DMCA
            </A>
            <A
              href="/legal/cookies"
              class="rounded px-2.5 py-1 text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
            >
              Cookies
            </A>
            <A
              href="/legal/acceptable-use"
              class="rounded px-2.5 py-1 text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900"
            >
              Acceptable Use
            </A>
          </nav>
        </div>
      </footer>

      <style>{`
        @keyframes crontech-menu-enter {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

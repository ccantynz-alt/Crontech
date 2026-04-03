// ── Global App State Store ───────────────────────────────────────────
// Unified signal-based store for cross-cutting application state:
// user, theme, navigation, and notifications.

import {
  type Accessor,
  createEffect,
  createRoot,
  createSignal,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { User } from "@back-to-the-future/schemas";
import { createPersistedSignal } from "./persist";

// ── Types ────────────────────────────────────────────────────────────

export type AuthStatus = "unknown" | "authenticated" | "unauthenticated";

export interface UserPreferences {
  locale: string;
  reducedMotion: boolean;
  fontSize: "small" | "medium" | "large";
  sidebarCollapsed: boolean;
}

export interface UserState {
  authStatus: AuthStatus;
  profile: User | null;
  preferences: UserPreferences;
}

export type ThemeMode = "light" | "dark" | "system";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  duration: number;
  createdAt: number;
}

export interface NavigationEntry {
  path: string;
  timestamp: number;
}

export interface NavigationState {
  currentRoute: string;
  history: NavigationEntry[];
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
  locale: "en",
  reducedMotion: false,
  fontSize: "medium",
  sidebarCollapsed: false,
};

const DEFAULT_USER_STATE: UserState = {
  authStatus: "unknown",
  profile: null,
  preferences: DEFAULT_PREFERENCES,
};

const DEFAULT_NAV_STATE: NavigationState = {
  currentRoute: "/",
  history: [],
};

const MAX_HISTORY_LENGTH = 50;
const MAX_NOTIFICATIONS = 10;

// ── Resolved Theme Helper ────────────────────────────────────────────

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// ── Store Factory ────────────────────────────────────────────────────

function createAppStore() {
  // ── User State ───────────────────────────────────────────────────
  const [user, setUser] = createStore<UserState>({ ...DEFAULT_USER_STATE });

  const persistedPreferences = createPersistedSignal<UserPreferences>(
    "btf_user_preferences",
    DEFAULT_PREFERENCES,
  );

  // Sync persisted preferences into the store on init
  setUser("preferences", persistedPreferences.get());

  // Persist preferences whenever they change
  createEffect((): void => {
    // Read all fields to track them
    const prefs: UserPreferences = {
      locale: user.preferences.locale,
      reducedMotion: user.preferences.reducedMotion,
      fontSize: user.preferences.fontSize,
      sidebarCollapsed: user.preferences.sidebarCollapsed,
    };
    persistedPreferences.set(prefs);
  });

  // ── Theme State ──────────────────────────────────────────────────
  const persistedThemeMode = createPersistedSignal<ThemeMode>(
    "btf_theme_mode",
    "system",
    {
      validate: (v): v is ThemeMode =>
        v === "light" || v === "dark" || v === "system",
    },
  );

  const [themeMode, setThemeMode] = createSignal<ThemeMode>(
    persistedThemeMode.get(),
  );

  const resolvedTheme: Accessor<"light" | "dark"> = (): "light" | "dark" => {
    const mode = themeMode();
    return mode === "system" ? resolveSystemTheme() : mode;
  };

  const isDark: Accessor<boolean> = (): boolean => resolvedTheme() === "dark";

  // Persist theme mode changes
  createEffect((): void => {
    persistedThemeMode.set(themeMode());
  });

  // Apply theme to document
  createEffect((): void => {
    const current = resolvedTheme();
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", current === "dark");
    document.documentElement.setAttribute("data-theme", current);
  });

  // ── Navigation State ─────────────────────────────────────────────
  const [nav, setNav] = createStore<NavigationState>({
    ...DEFAULT_NAV_STATE,
  });

  // ── Notification State ───────────────────────────────────────────
  const [notifications, setNotifications] = createStore<Notification[]>([]);

  let notificationCounter = 0;

  // ── User Actions ─────────────────────────────────────────────────

  function setAuthStatus(status: AuthStatus): void {
    setUser("authStatus", status);
  }

  function setProfile(profile: User | null): void {
    setUser("profile", profile);
    setUser("authStatus", profile ? "authenticated" : "unauthenticated");
  }

  function updatePreferences(patch: Partial<UserPreferences>): void {
    setUser(
      "preferences",
      produce((prefs) => {
        const keys = Object.keys(patch) as Array<keyof UserPreferences>;
        for (const key of keys) {
          const value = patch[key];
          if (value !== undefined) {
            // Type-safe assignment per key
            (prefs as Record<keyof UserPreferences, unknown>)[key] = value;
          }
        }
      }),
    );
  }

  function clearUser(): void {
    setUser({
      authStatus: "unauthenticated",
      profile: null,
      preferences: DEFAULT_PREFERENCES,
    });
    persistedPreferences.clear();
  }

  // ── Theme Actions ────────────────────────────────────────────────

  function changeThemeMode(mode: ThemeMode): void {
    setThemeMode(mode);
  }

  function cycleThemeMode(): void {
    setThemeMode((prev) => {
      const order: ThemeMode[] = ["light", "dark", "system"];
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length]!;
    });
  }

  // ── Navigation Actions ───────────────────────────────────────────

  function navigateTo(path: string): void {
    const entry: NavigationEntry = { path, timestamp: Date.now() };
    setNav(
      produce((state) => {
        state.currentRoute = path;
        state.history.push(entry);
        if (state.history.length > MAX_HISTORY_LENGTH) {
          state.history.splice(0, state.history.length - MAX_HISTORY_LENGTH);
        }
      }),
    );
  }

  function clearNavigationHistory(): void {
    setNav("history", []);
  }

  // ── Notification Actions ─────────────────────────────────────────

  function addNotification(
    level: NotificationLevel,
    title: string,
    message: string,
    duration: number = 5000,
  ): string {
    notificationCounter += 1;
    const id = `notif_${Date.now()}_${String(notificationCounter)}`;
    const notification: Notification = {
      id,
      level,
      title,
      message,
      duration,
      createdAt: Date.now(),
    };

    setNotifications(
      produce((list) => {
        list.push(notification);
        if (list.length > MAX_NOTIFICATIONS) {
          list.splice(0, list.length - MAX_NOTIFICATIONS);
        }
      }),
    );

    // Auto-dismiss if duration > 0
    if (duration > 0) {
      setTimeout(() => {
        dismissNotification(id);
      }, duration);
    }

    return id;
  }

  function dismissNotification(id: string): void {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function clearNotifications(): void {
    setNotifications([]);
  }

  // Convenience notification methods
  function notify(title: string, message: string, duration?: number): string {
    return addNotification("info", title, message, duration);
  }

  function notifySuccess(title: string, message: string, duration?: number): string {
    return addNotification("success", title, message, duration);
  }

  function notifyWarning(title: string, message: string, duration?: number): string {
    return addNotification("warning", title, message, duration);
  }

  function notifyError(title: string, message: string, duration?: number): string {
    return addNotification("error", title, message, duration ?? 0);
  }

  return {
    // ── User ─────────────────────────────────────────────────────
    user,
    setAuthStatus,
    setProfile,
    updatePreferences,
    clearUser,

    // ── Theme ────────────────────────────────────────────────────
    themeMode,
    resolvedTheme,
    isDark,
    changeThemeMode,
    cycleThemeMode,

    // ── Navigation ───────────────────────────────────────────────
    nav,
    navigateTo,
    clearNavigationHistory,

    // ── Notifications ────────────────────────────────────────────
    notifications,
    addNotification,
    dismissNotification,
    clearNotifications,
    notify,
    notifySuccess,
    notifyWarning,
    notifyError,
  } as const;
}

// ── Singleton ────────────────────────────────────────────────────────

export type AppStore = ReturnType<typeof createAppStore>;

let _appStore: AppStore | undefined;

/**
 * Returns the global app store singleton.
 *
 * Creates the store inside a `createRoot` on first call so that effects
 * and subscriptions are properly owned and cleaned up.
 *
 * @example
 * ```ts
 * const app = useAppStore();
 * app.setProfile(user);
 * app.changeThemeMode("dark");
 * app.notify("Saved", "Your changes have been saved.");
 * ```
 */
export function useAppStore(): AppStore {
  if (!_appStore) {
    createRoot(() => {
      _appStore = createAppStore();
    });
  }
  return _appStore!;
}

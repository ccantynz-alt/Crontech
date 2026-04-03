/**
 * Service Worker registration and lifecycle management for Back to the Future PWA.
 *
 * Provides:
 * - SW registration with update detection
 * - Push notification permission flow
 * - Online/offline status as SolidJS signals
 */

import { createSignal } from "solid-js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SWRegistrationResult {
  registration: ServiceWorkerRegistration;
  isUpdate: boolean;
}

export type UpdateCallback = (registration: ServiceWorkerRegistration) => void;

// ─── Online/Offline signals ──────────────────────────────────────────────────

const [isOnline, setIsOnline] = createSignal(
  typeof navigator !== "undefined" ? navigator.onLine : true,
);

const [swStatus, setSWStatus] = createSignal<
  "idle" | "installing" | "installed" | "activating" | "activated" | "redundant" | "unsupported"
>("idle");

const [updateAvailable, setUpdateAvailable] = createSignal(false);

export { isOnline, swStatus, updateAvailable };

// ─── Internal state ──────────────────────────────────────────────────────────

let currentRegistration: ServiceWorkerRegistration | null = null;
let onUpdateAvailable: UpdateCallback | null = null;

// ─── Register the service worker ─────────────────────────────────────────────

export async function registerServiceWorker(
  options?: {
    onUpdate?: UpdateCallback;
    swPath?: string;
  },
): Promise<SWRegistrationResult | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    setSWStatus("unsupported");
    return null;
  }

  // Set up online/offline listeners
  window.addEventListener("online", () => setIsOnline(true));
  window.addEventListener("offline", () => setIsOnline(false));

  if (options?.onUpdate) {
    onUpdateAvailable = options.onUpdate;
  }

  const swPath = options?.swPath ?? "/sw.js";

  try {
    const registration = await navigator.serviceWorker.register(swPath, {
      scope: "/",
    });

    currentRegistration = registration;
    const isUpdate = !!registration.active;

    // Track installing worker state
    if (registration.installing) {
      trackWorkerState(registration.installing);
    }

    // Listen for new updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      trackWorkerState(newWorker);

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // New content available; old SW still controls the page
          setUpdateAvailable(true);
          onUpdateAvailable?.(registration);
        }
      });
    });

    // Handle controller change (e.g., after skipWaiting)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // The new SW has taken over
      setSWStatus("activated");
    });

    return { registration, isUpdate };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[BTTF] Service worker registration failed: ${message}`);
    setSWStatus("redundant");
    return null;
  }
}

// ─── Apply pending update ────────────────────────────────────────────────────

/**
 * Tell the waiting service worker to take control immediately.
 * The page will reload to ensure the new version is fully active.
 */
export function applyUpdate(reload = true): void {
  const waiting = currentRegistration?.waiting;
  if (!waiting) return;

  waiting.postMessage({ type: "SKIP_WAITING" });

  if (reload) {
    // Listen for the new worker to take over, then reload
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once: true });
  }
}

// ─── Check for updates manually ──────────────────────────────────────────────

export async function checkForUpdate(): Promise<boolean> {
  if (!currentRegistration) return false;

  try {
    await currentRegistration.update();
    return !!currentRegistration.waiting;
  } catch {
    return false;
  }
}

// ─── Push notification permission ────────────────────────────────────────────

export type NotificationPermissionResult = "granted" | "denied" | "default" | "unsupported";

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  const result = await Notification.requestPermission();
  return result;
}

/**
 * Subscribe to push notifications. Returns the PushSubscription or null.
 * Requires a VAPID public key from the server.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  if (!currentRegistration) return null;

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return null;

  try {
    const subscription = await currentRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
    });
    return subscription;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[BTTF] Push subscription failed: ${message}`);
    return null;
  }
}

// ─── Cache stats (communicates with SW) ──────────────────────────────────────

export interface CacheStats {
  [cacheName: string]: number;
}

export function getCacheStats(): Promise<CacheStats> {
  return new Promise((resolve) => {
    if (!navigator.serviceWorker.controller) {
      resolve({});
      return;
    }

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "CACHE_STATS") {
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(event.data.stats as CacheStats);
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    navigator.serviceWorker.controller.postMessage({ type: "GET_CACHE_STATS" });

    // Timeout after 3 seconds
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", handler);
      resolve({});
    }, 3000);
  });
}

// ─── Unregister ──────────────────────────────────────────────────────────────

export async function unregisterServiceWorker(): Promise<boolean> {
  if (!currentRegistration) return false;

  const result = await currentRegistration.unregister();
  if (result) {
    currentRegistration = null;
    setSWStatus("idle");
    setUpdateAvailable(false);
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trackWorkerState(worker: ServiceWorker): void {
  const stateMap: Record<string, typeof swStatus extends () => infer R ? R : never> = {
    installing: "installing",
    installed: "installed",
    activating: "activating",
    activated: "activated",
    redundant: "redundant",
  };

  setSWStatus(stateMap[worker.state] ?? "idle");

  worker.addEventListener("statechange", () => {
    setSWStatus(stateMap[worker.state] ?? "idle");
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

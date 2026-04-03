/// @ts-check

const CACHE_VERSION = "bttf-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PRECACHE = `${CACHE_VERSION}-precache`;

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/offline.html",
];

const STATIC_EXTENSIONS = [
  ".js",
  ".css",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
];

const ALL_CACHES = [STATIC_CACHE, API_CACHE, PRECACHE];

// ─── Background Sync ────────────────────────────────────────────────────────

const SYNC_TAG = "bttf-offline-mutations";

// ─── Install: precache critical resources ────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ──────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !ALL_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ─── Fetch: strategy-based routing ───────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests for caching strategies
  if (url.origin !== self.location.origin) {
    return;
  }

  // Non-GET requests: attempt network, queue for background sync on failure
  if (request.method !== "GET") {
    if (isApiRequest(url)) {
      event.respondWith(handleMutationRequest(request));
    }
    return;
  }

  // API / tRPC calls: network-first with offline fallback
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests: network-first with offline fallback page
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request, STATIC_CACHE));
});

// ─── Background Sync handler ─────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueuedMutations());
  }
});

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  /** @type {{ title: string; body?: string; icon?: string; badge?: string; url?: string; tag?: string }} */
  const defaults = {
    title: "Back to the Future",
    body: "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-96.png",
    url: "/",
    tag: "bttf-notification",
  };

  let data = defaults;
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...defaults, ...parsed };
    } catch {
      data = { ...defaults, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if one is open
      for (const client of clients) {
        if (new URL(client.url).pathname === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// ─── Message handler for client communication ────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "GET_CACHE_STATS") {
    getCacheStats().then((stats) => {
      event.source?.postMessage({ type: "CACHE_STATS", stats });
    });
  }
});

// ─── Strategy: cache-first ───────────────────────────────────────────────────

/**
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    // Revalidate in the background (stale-while-revalidate)
    refreshCache(request, cacheName);
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// ─── Strategy: network-first ─────────────────────────────────────────────────

/**
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ error: "offline", message: "You are offline and no cached data is available." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── Navigation handler with offline fallback ────────────────────────────────

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Fall back to the offline page
    const offlinePage = await caches.match("/offline.html");
    if (offlinePage) {
      return offlinePage;
    }
    return new Response("<!DOCTYPE html><html><body><h1>Offline</h1><p>Back to the Future is unavailable offline. Please reconnect.</p></body></html>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
}

// ─── Mutation request handler (background sync) ──────────────────────────────

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleMutationRequest(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Store the request for background sync replay
    await queueMutation(request);

    // Register for background sync
    if (self.registration.sync) {
      await self.registration.sync.register(SYNC_TAG);
    }

    return new Response(
      JSON.stringify({ queued: true, message: "Request queued for sync when online." }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ─── IndexedDB-based mutation queue (used by SW) ─────────────────────────────

/**
 * @param {Request} request
 */
async function queueMutation(request) {
  const body = await request.text();
  const entry = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
  };

  const db = await openSyncDB();
  const tx = db.transaction("mutations", "readwrite");
  tx.objectStore("mutations").add(entry);
  await promisifyTransaction(tx);
  db.close();
}

async function replayQueuedMutations() {
  const db = await openSyncDB();
  const tx = db.transaction("mutations", "readonly");
  const store = tx.objectStore("mutations");

  /** @type {Array<{id: number; url: string; method: string; headers: Record<string, string>; body: string; timestamp: number}>} */
  const entries = await promisifyRequest(store.getAll());
  db.close();

  for (const entry of entries) {
    try {
      await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.method !== "GET" && entry.method !== "HEAD" ? entry.body : undefined,
      });
      // Remove successfully replayed entry
      const deleteDb = await openSyncDB();
      const deleteTx = deleteDb.transaction("mutations", "readwrite");
      deleteTx.objectStore("mutations").delete(entry.id);
      await promisifyTransaction(deleteTx);
      deleteDb.close();
    } catch {
      // Leave in queue for next sync attempt
      break;
    }
  }
}

/**
 * @returns {Promise<IDBDatabase>}
 */
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bttf-sw-sync", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("mutations")) {
        db.createObjectStore("mutations", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function promisifyTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * @param {URL} url
 * @returns {boolean}
 */
function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/trpc/");
}

/**
 * @param {URL} url
 * @returns {boolean}
 */
function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

/**
 * Background revalidation for stale-while-revalidate pattern.
 * @param {Request} request
 * @param {string} cacheName
 */
function refreshCache(request, cacheName) {
  fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(cacheName).then((cache) => cache.put(request, response));
      }
    })
    .catch(() => {
      // Network unavailable; cached version remains valid
    });
}

/**
 * @returns {Promise<Record<string, number>>}
 */
async function getCacheStats() {
  const stats = {};
  const keys = await caches.keys();
  for (const key of keys) {
    const cache = await caches.open(key);
    const entries = await cache.keys();
    stats[key] = entries.length;
  }
  return stats;
}

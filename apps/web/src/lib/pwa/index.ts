export {
  registerServiceWorker,
  applyUpdate,
  checkForUpdate,
  requestNotificationPermission,
  subscribeToPush,
  getCacheStats,
  unregisterServiceWorker,
  isOnline,
  swStatus,
  updateAvailable,
} from "./register-sw";

export type {
  SWRegistrationResult,
  UpdateCallback,
  NotificationPermissionResult,
  CacheStats,
} from "./register-sw";

export {
  queueMutation,
  getQueuedMutations,
  removeMutation,
  clearMutationQueue,
  setOfflineData,
  getOfflineData,
  deleteOfflineData,
  getUnsyncedRecords,
  markSynced,
  replayMutations,
  mergeRemoteData,
  setupAutoSync,
  destroyOfflineStore,
  pendingMutationCount,
  isSyncing,
  lastSyncTime,
} from "./offline-store";

export type {
  QueuedMutation,
  OfflineRecord,
  MergeConflict,
  MergeStrategy,
  SyncResult,
} from "./offline-store";

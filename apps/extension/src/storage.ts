import type { SupportedStorage } from '@supabase/supabase-js';
import { isWorkerSessionFresh, type WorkerSession } from '@live-tab-mirror/shared';

export interface ExtensionSyncState {
  lastAttemptAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  tabCount: number;
  windowCount: number;
  reason: string | null;
}

export const DEFAULT_SYNC_STATE: ExtensionSyncState = {
  lastAttemptAt: null,
  lastSyncAt: null,
  lastError: null,
  tabCount: 0,
  windowCount: 0,
  reason: null
};

const SYNC_STATE_KEY = 'live-tab-mirror:sync-state';
const WORKER_SESSION_KEY = 'live-tab-mirror:worker-session';

function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

export const chromeStorageAdapter: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await storageGet(key);
    return typeof result[key] === 'string' ? result[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await storageSet({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await storageRemove(key);
  }
};

export async function readSyncState(): Promise<ExtensionSyncState> {
  const result = await storageGet(SYNC_STATE_KEY);
  return {
    ...DEFAULT_SYNC_STATE,
    ...(typeof result[SYNC_STATE_KEY] === 'object' && result[SYNC_STATE_KEY] !== null
      ? (result[SYNC_STATE_KEY] as Partial<ExtensionSyncState>)
      : {})
  };
}

export async function writeSyncState(state: ExtensionSyncState): Promise<ExtensionSyncState> {
  await storageSet({ [SYNC_STATE_KEY]: state });
  return state;
}

export async function clearSyncState(): Promise<ExtensionSyncState> {
  await storageRemove(SYNC_STATE_KEY);
  return DEFAULT_SYNC_STATE;
}

export async function readWorkerSession(now = new Date()): Promise<WorkerSession | null> {
  const result = await storageGet(WORKER_SESSION_KEY);
  const session = result[WORKER_SESSION_KEY] as WorkerSession | undefined;

  if (isWorkerSessionFresh(session ?? null, now)) {
    return session ?? null;
  }

  await storageRemove(WORKER_SESSION_KEY);
  return null;
}

export async function writeWorkerSession(session: WorkerSession): Promise<void> {
  await storageSet({ [WORKER_SESSION_KEY]: session });
}

export async function clearWorkerSession(): Promise<void> {
  await storageRemove(WORKER_SESSION_KEY);
}

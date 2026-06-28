import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSyncState, DEFAULT_SYNC_STATE, readSyncState, writeSyncState } from '../storage';

type StoredItems = Record<string, unknown>;

const store: StoredItems = {};

function installChromeStorageMock() {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get(keys: string | string[], callback: (items: StoredItems) => void) {
          const requestedKeys = Array.isArray(keys) ? keys : [keys];
          callback(
            requestedKeys.reduce<StoredItems>((items, key) => {
              if (key in store) {
                items[key] = store[key];
              }
              return items;
            }, {})
          );
        },
        set(items: StoredItems, callback: () => void) {
          Object.assign(store, items);
          callback();
        },
        remove(keys: string | string[], callback: () => void) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete store[key];
          }
          callback();
        }
      }
    }
  });
}

describe('extension sync state storage', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    installChromeStorageMock();
  });

  it('persists the latest sync summary for the popup', async () => {
    await writeSyncState({
      lastAttemptAt: '2026-06-29T03:40:00.000Z',
      lastSyncAt: '2026-06-29T03:40:01.000Z',
      lastError: null,
      reason: 'manual',
      tabCount: 42,
      windowCount: 3
    });

    await expect(readSyncState()).resolves.toEqual({
      lastAttemptAt: '2026-06-29T03:40:00.000Z',
      lastSyncAt: '2026-06-29T03:40:01.000Z',
      lastError: null,
      reason: 'manual',
      tabCount: 42,
      windowCount: 3
    });
  });

  it('clears the sync summary on sign out', async () => {
    await writeSyncState({
      ...DEFAULT_SYNC_STATE,
      lastError: '扩展还没有登录。',
      reason: 'manual'
    });

    await expect(clearSyncState()).resolves.toEqual(DEFAULT_SYNC_STATE);
    await expect(readSyncState()).resolves.toEqual(DEFAULT_SYNC_STATE);
  });
});

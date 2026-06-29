import { DEFAULT_DEVICE_ID } from '@live-tab-mirror/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncState,
  DEFAULT_SYNC_STATE,
  readDeviceConfig,
  readSyncState,
  writeDeviceConfig,
  writeSyncState
} from '../storage';

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

  it('creates a stable per-install device id instead of reusing the build default', async () => {
    const firstRead = await readDeviceConfig({ deviceName: 'Mac Chrome' });
    const secondRead = await readDeviceConfig({ deviceName: 'Mac Chrome' });

    expect(firstRead.deviceId).toMatch(/^desktop-chrome-[a-f0-9-]+$/);
    expect(firstRead.deviceId).not.toBe(DEFAULT_DEVICE_ID);
    expect(secondRead).toEqual(firstRead);
  });

  it('persists a user-editable device name without changing the device id', async () => {
    const config = await readDeviceConfig({ deviceName: 'Mac Chrome' });

    await expect(writeDeviceConfig({ ...config, deviceName: 'Studio Chrome' })).resolves.toEqual({
      ...config,
      deviceName: 'Studio Chrome'
    });
    await expect(readDeviceConfig({ deviceName: 'Mac Chrome' })).resolves.toEqual({
      ...config,
      deviceName: 'Studio Chrome'
    });
  });
});

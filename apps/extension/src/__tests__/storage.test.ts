import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPendingOtp, writePendingOtp } from '../storage';

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

describe('pending OTP state', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    installChromeStorageMock();
  });

  it('persists a pending OTP request so the popup can recover after closing', async () => {
    await writePendingOtp('zhaowork74@gmail.com', new Date('2026-06-28T15:00:00.000Z'));

    await expect(readPendingOtp(new Date('2026-06-28T15:05:00.000Z'))).resolves.toEqual({
      email: 'zhaowork74@gmail.com',
      requestedAt: '2026-06-28T15:00:00.000Z'
    });
  });

  it('drops stale pending OTP requests after the Supabase OTP expiry window', async () => {
    await writePendingOtp('zhaowork74@gmail.com', new Date('2026-06-28T15:00:00.000Z'));

    await expect(readPendingOtp(new Date('2026-06-28T16:01:00.000Z'))).resolves.toBeNull();
    expect(store).not.toHaveProperty('live-tab-mirror:pending-otp');
  });
});

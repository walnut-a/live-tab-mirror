import { describe, expect, it } from 'vitest';
import {
  createSnapshotInboxItem,
  chooseInboxWinner,
  mergeInboxCapture,
  readInboxCursor,
  readInboxLimit,
  snapshotTabsToInboxSeeds
} from '../inbox';
import type { InboxSyncItem, TabSnapshot } from '@live-tab-mirror/shared';

const item = (changedAt: number, status: InboxSyncItem['status'] = 'INBOX'): InboxSyncItem => ({
  id: 'item-1',
  url: 'https://example.com/read',
  title: 'Read later',
  source: 'MANUAL',
  sourceItemId: null,
  dedupeKey: 'https://example.com/read',
  createdAt: 10,
  lastWrittenAt: 10,
  lastOpenedAt: null,
  openCount: 0,
  status,
  archivedAt: null,
  archiveReason: null,
  deletedAt: status === 'DELETED' ? changedAt : null,
  changedAt
});

describe('worker inbox helpers', () => {
  it('bounds incremental cursors and page size', () => {
    expect(readInboxCursor(null)).toBe(0);
    expect(readInboxCursor('-1')).toBe(0);
    expect(readInboxCursor('42')).toBe(42);
    expect(readInboxLimit(null)).toBe(100);
    expect(readInboxLimit('9999')).toBe(200);
  });

  it('uses changedAt and a deterministic status rank to converge conflicts', () => {
    expect(chooseInboxWinner(item(20), item(10, 'DELETED'))).toEqual(item(20));
    expect(chooseInboxWinner(item(20), item(20, 'ARCHIVED'))).toEqual(item(20, 'ARCHIVED'));
    expect(chooseInboxWinner(item(20), item(20, 'DELETED'))).toEqual(item(20, 'DELETED'));
  });

  it('treats an explicit browser capture as a newer intent without losing history', () => {
    const deleted = { ...item(500, 'DELETED'), openCount: 3, createdAt: 5, lastOpenedAt: 300 };

    expect(mergeInboxCapture(deleted, {
      id: 'new-id', url: 'https://example.com/read', title: 'Captured', sourceItemId: 'mac:42', now: 100
    })).toMatchObject({
      id: 'item-1', status: 'INBOX', title: 'Captured', createdAt: 5, openCount: 3,
      lastOpenedAt: 300, deletedAt: null, changedAt: 501
    });
  });

  it('turns snapshot tabs into inbox seeds and keeps the newest title for duplicate URLs', () => {
    const snapshot = (
      syncedAt: string,
      title: string,
      urls: string[],
      pinnedIndexes: number[] = []
    ): TabSnapshot => ({
      schemaVersion: 1,
      device: { deviceId: 'mac', deviceName: 'MacBook', browser: 'Chrome' },
      syncedAt,
      windows: [{
        windowId: 1,
        focused: true,
        incognito: false,
        tabs: urls.map((url, index) => ({
          id: index + 1,
          index,
          title: index === 0 ? title : `Tab ${index}`,
          url,
          favIconUrl: null,
          active: index === 0,
          pinned: pinnedIndexes.includes(index),
          audible: false,
          groupId: -1,
          domain: new URL(url).hostname
        }))
      }]
    });

    const seeds = snapshotTabsToInboxSeeds([
      snapshot('2026-09-14T10:00:00.000Z', 'Newest title', [
        'https://EXAMPLE.com:443/read',
        'https://another.example/page',
        'https://pinned.example/dashboard'
      ], [2]),
      snapshot('2026-09-14T09:00:00.000Z', 'Older title', ['https://example.com/read'])
    ]);

    expect(seeds).toHaveLength(2);
    expect(seeds.map((seed) => seed.url)).not.toContain('https://pinned.example/dashboard');
    expect(seeds[0]).toMatchObject({
      url: 'https://example.com/read',
      dedupeKey: 'https://example.com/read',
      title: 'Newest title',
      sourceItemId: 'mac:1'
    });
  });

  it('does not recreate snapshot entries that already exist in any inbox state', () => {
    const seeds = [{
      url: 'https://example.com/read',
      dedupeKey: 'https://example.com/read',
      title: 'Read later',
      sourceItemId: 'mac:1'
    }];

    const snapshot: TabSnapshot = {
      schemaVersion: 1,
      device: { deviceId: 'mac', deviceName: 'MacBook', browser: 'Chrome' },
      syncedAt: '2026-09-14T10:00:00.000Z',
      windows: [{
        windowId: 1, focused: true, incognito: false,
        tabs: [{
          id: 1, index: 0, title: 'Read later', url: 'https://example.com/read',
          favIconUrl: null, active: true, pinned: false, audible: false, groupId: -1,
          domain: 'example.com'
        }]
      }]
    };

    expect(snapshotTabsToInboxSeeds([snapshot], new Set(['https://example.com/read']))).toEqual([]);
    expect(createSnapshotInboxItem(seeds[0], 'snapshot-item', 1234)).toMatchObject({
      id: 'snapshot-item',
      source: 'EXTENSION',
      status: 'INBOX',
      createdAt: 1234,
      lastWrittenAt: 1234,
      changedAt: 1234
    });
  });
});

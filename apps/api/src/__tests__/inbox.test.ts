import { describe, expect, it } from 'vitest';
import { chooseInboxWinner, mergeInboxCapture, readInboxCursor, readInboxLimit } from '../inbox';
import type { InboxSyncItem } from '@live-tab-mirror/shared';

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
});

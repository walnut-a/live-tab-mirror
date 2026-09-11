import { describe, expect, it } from 'vitest';
import { isInboxSyncItem, normalizeInboxUrl } from '../inbox';

describe('inbox sync contract', () => {
  it('normalizes only explicit HTTP and HTTPS URLs for conservative dedupe', () => {
    expect(normalizeInboxUrl('https://Example.com:443/read#part')).toEqual({
      url: 'https://example.com/read#part',
      dedupeKey: 'https://example.com/read#part'
    });
    expect(normalizeInboxUrl('example.com/read')).toBeNull();
    expect(normalizeInboxUrl('javascript:alert(1)')).toBeNull();
  });

  it('accepts complete tombstones and rejects malformed sync items', () => {
    const item = {
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
      status: 'DELETED',
      archivedAt: null,
      archiveReason: null,
      deletedAt: 20,
      changedAt: 20
    };

    expect(isInboxSyncItem(item)).toBe(true);
    expect(isInboxSyncItem({ ...item, status: 'UNKNOWN' })).toBe(false);
    expect(isInboxSyncItem({ ...item, url: 'file:///secret' })).toBe(false);
  });
});

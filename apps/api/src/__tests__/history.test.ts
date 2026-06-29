import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_RETENTION_HOURS,
  MAX_HISTORY_LIMIT,
  getSnapshotHistoryCutoffIso,
  mergeSnapshotHistoryRows,
  readSnapshotHistoryLimit,
  readSnapshotHistoryRetentionHours
} from '../history';
import type { SnapshotHistoryRow, SnapshotRow } from '../types';

function snapshotJson(tabs: Array<{ title: string; url: string }>): string {
  return JSON.stringify({
    schemaVersion: 1,
    device: {
      deviceId: 'mac-chrome',
      deviceName: 'Mac Chrome',
      browser: 'Chrome'
    },
    syncedAt: '2026-06-29T12:00:00.000Z',
    windows: [
      {
        windowId: 1,
        focused: true,
        incognito: false,
        tabs: tabs.map((tab, index) => ({
          id: index + 1,
          index,
          title: tab.title,
          url: tab.url,
          favIconUrl: null,
          active: index === 0,
          pinned: false,
          audible: false,
          groupId: -1,
          domain: new URL(tab.url).hostname
        }))
      }
    ]
  });
}

describe('worker snapshot history helpers', () => {
  it('keeps the default retention window at 48 hours', () => {
    expect(readSnapshotHistoryRetentionHours({})).toBe(DEFAULT_HISTORY_RETENTION_HOURS);
    expect(readSnapshotHistoryRetentionHours({ SNAPSHOT_HISTORY_RETENTION_HOURS: '24' })).toBe(24);
  });

  it('computes retention cutoffs from the configured window', () => {
    const now = new Date('2026-06-29T12:00:00.000Z');

    expect(getSnapshotHistoryCutoffIso({}, now)).toBe('2026-06-27T12:00:00.000Z');
    expect(getSnapshotHistoryCutoffIso({ SNAPSHOT_HISTORY_RETENTION_HOURS: '24' }, now)).toBe(
      '2026-06-28T12:00:00.000Z'
    );
  });

  it('bounds history list limits', () => {
    expect(readSnapshotHistoryLimit(null)).toBe(DEFAULT_HISTORY_LIMIT);
    expect(readSnapshotHistoryLimit('0')).toBe(DEFAULT_HISTORY_LIMIT);
    expect(readSnapshotHistoryLimit('40')).toBe(40);
    expect(readSnapshotHistoryLimit('9999')).toBe(MAX_HISTORY_LIMIT);
  });

  it('merges recent history by URL while excluding currently open tabs', () => {
    const current = {
      device_id: 'mac-chrome',
      device_name: 'Mac Chrome',
      snapshot_json: snapshotJson([{ title: 'Current A', url: 'https://example.com/a' }])
    } as SnapshotRow;
    const rows = [
      {
        id: 'latest',
        device_id: 'mac-chrome',
        device_name: 'Mac Chrome',
        snapshot_json: snapshotJson([
          { title: 'Current A Later', url: 'https://example.com/a' },
          { title: 'History B Latest', url: 'https://example.com/b' }
        ]),
        synced_at: '2026-06-29T12:00:00.000Z',
        updated_at: '2026-06-29T12:00:01.000Z'
      },
      {
        id: 'older',
        device_id: 'mac-chrome',
        device_name: 'Mac Chrome',
        snapshot_json: snapshotJson([
          { title: 'History B Old', url: 'https://example.com/b' },
          { title: 'History C', url: 'https://example.com/c' }
        ]),
        synced_at: '2026-06-29T11:00:00.000Z',
        updated_at: '2026-06-29T11:00:01.000Z'
      }
    ] as SnapshotHistoryRow[];

    const merged = mergeSnapshotHistoryRows(rows, current);

    expect(merged?.snapshot.windows[0].tabs.map((tab) => [tab.title, tab.url])).toEqual([
      ['History B Latest', 'https://example.com/b'],
      ['History C', 'https://example.com/c']
    ]);
  });
});

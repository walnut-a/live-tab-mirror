import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_RETENTION_DAYS,
  MAX_HISTORY_LIMIT,
  getSnapshotHistoryCutoffIso,
  readSnapshotHistoryLimit,
  readSnapshotHistoryRetentionDays
} from '../history';

describe('worker snapshot history helpers', () => {
  it('keeps the default retention window at three days', () => {
    expect(readSnapshotHistoryRetentionDays({})).toBe(DEFAULT_HISTORY_RETENTION_DAYS);
    expect(readSnapshotHistoryRetentionDays({ SNAPSHOT_HISTORY_RETENTION_DAYS: '5' })).toBe(5);
  });

  it('computes retention cutoffs from the configured window', () => {
    const now = new Date('2026-06-29T12:00:00.000Z');

    expect(getSnapshotHistoryCutoffIso({}, now)).toBe('2026-06-26T12:00:00.000Z');
    expect(getSnapshotHistoryCutoffIso({ SNAPSHOT_HISTORY_RETENTION_DAYS: '1' }, now)).toBe(
      '2026-06-28T12:00:00.000Z'
    );
  });

  it('bounds history list limits', () => {
    expect(readSnapshotHistoryLimit(null)).toBe(DEFAULT_HISTORY_LIMIT);
    expect(readSnapshotHistoryLimit('0')).toBe(DEFAULT_HISTORY_LIMIT);
    expect(readSnapshotHistoryLimit('40')).toBe(40);
    expect(readSnapshotHistoryLimit('9999')).toBe(MAX_HISTORY_LIMIT);
  });
});

import { describe, expect, it } from 'vitest';
import { readSnapshotDeviceFilter } from '../devices';

describe('worker snapshot device helpers', () => {
  it('normalizes optional device filters for latest and history reads', () => {
    expect(readSnapshotDeviceFilter(null)).toBeNull();
    expect(readSnapshotDeviceFilter('')).toBeNull();
    expect(readSnapshotDeviceFilter('  macbook-chrome  ')).toBe('macbook-chrome');
  });

  it('rejects oversized device filters instead of letting them shape SQL queries', () => {
    expect(readSnapshotDeviceFilter('a'.repeat(81))).toBeNull();
  });
});

import type { FreshnessDescription } from './types';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

export function describeFreshness(
  syncedAt: string | null | undefined,
  now: Date = new Date()
): FreshnessDescription {
  if (!syncedAt) {
    return {
      label: '还没有同步',
      state: 'unknown',
      ageSeconds: null
    };
  }

  const syncedTime = new Date(syncedAt).getTime();

  if (Number.isNaN(syncedTime)) {
    return {
      label: '同步时间未知',
      state: 'unknown',
      ageSeconds: null
    };
  }

  const ageMs = Math.max(0, now.getTime() - syncedTime);
  const ageSeconds = Math.floor(ageMs / SECOND);

  if (ageMs > DAY) {
    return {
      label: '很久没有同步',
      state: 'old',
      ageSeconds
    };
  }

  if (ageSeconds <= 15) {
    return {
      label: '刚刚同步',
      state: 'fresh',
      ageSeconds
    };
  }

  if (ageMs < MINUTE) {
    return {
      label: `${ageSeconds} 秒前`,
      state: 'fresh',
      ageSeconds
    };
  }

  const ageMinutes = Math.floor(ageMs / MINUTE);

  if (ageMinutes <= 10) {
    return {
      label: `${ageMinutes} 分钟前`,
      state: 'fresh',
      ageSeconds
    };
  }

  return {
    label: '同步可能已过期',
    state: 'stale',
    ageSeconds
  };
}

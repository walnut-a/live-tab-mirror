import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEBOUNCE_MS,
  HEARTBEAT_PERIOD_MINUTES,
  TITLE_DEBOUNCE_MS
} from '../syncPolicy';

describe('extension sync policy', () => {
  it('uses events for fast sync and keeps the heartbeat as a slow fallback', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBeLessThanOrEqual(3000);
    expect(TITLE_DEBOUNCE_MS).toBeLessThanOrEqual(5000);
    expect(HEARTBEAT_PERIOD_MINUTES).toBeGreaterThanOrEqual(10);
  });
});

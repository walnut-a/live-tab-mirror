import type { SnapshotRecord, SnapshotTab, TabSnapshot } from '@live-tab-mirror/shared';
import { readPositiveInteger } from './security';
import type { Env, SnapshotHistoryRow, SnapshotRow } from './types';

export const DEFAULT_HISTORY_LIMIT = 80;
export const MAX_HISTORY_LIMIT = 200;
export const DEFAULT_HISTORY_RETENTION_HOURS = 48;

function toIso(date: Date): string {
  return date.toISOString();
}

export function readSnapshotHistoryLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

export function readSnapshotHistoryRetentionHours(env: Pick<Env, 'SNAPSHOT_HISTORY_RETENTION_HOURS'>): number {
  return readPositiveInteger(env.SNAPSHOT_HISTORY_RETENTION_HOURS, DEFAULT_HISTORY_RETENTION_HOURS);
}

export function getSnapshotHistoryCutoffIso(
  env: Pick<Env, 'SNAPSHOT_HISTORY_RETENTION_HOURS'>,
  now = new Date()
): string {
  return toIso(new Date(now.getTime() - readSnapshotHistoryRetentionHours(env) * 60 * 60 * 1000));
}

export function snapshotRowToBody(row: SnapshotRow): SnapshotRecord {
  return {
    device_id: row.device_id,
    device_name: row.device_name,
    snapshot: JSON.parse(row.snapshot_json) as TabSnapshot,
    snapshot_hash: row.snapshot_hash,
    synced_at: row.synced_at,
    updated_at: row.updated_at
  };
}

export async function cleanupSnapshotHistory(env: Env, now = new Date()): Promise<void> {
  await env.DB.prepare('delete from desktop_tab_snapshot_history where updated_at < ?1')
    .bind(getSnapshotHistoryCutoffIso(env, now))
    .run();
}

function snapshotUrls(snapshot: TabSnapshot): Set<string> {
  return new Set(snapshot.windows.flatMap((window) => window.tabs.map((tab) => tab.url)));
}

export function mergeSnapshotHistoryRows(
  rows: SnapshotHistoryRow[],
  currentRow: SnapshotRow | null
): SnapshotRecord | null {
  const latestHistoryRow = rows[0];
  if (!latestHistoryRow) {
    return null;
  }

  const currentUrls = currentRow ? snapshotUrls(JSON.parse(currentRow.snapshot_json) as TabSnapshot) : new Set<string>();
  const tabsByUrl = new Map<string, SnapshotTab>();
  let browser = 'Chrome';

  for (const row of rows) {
    const snapshot = JSON.parse(row.snapshot_json) as TabSnapshot;
    browser = snapshot.device.browser || browser;

    for (const window of snapshot.windows) {
      for (const tab of window.tabs) {
        if (currentUrls.has(tab.url) || tabsByUrl.has(tab.url)) {
          continue;
        }

        tabsByUrl.set(tab.url, {
          ...tab,
          id: null,
          active: false
        });
      }
    }
  }

  const tabs = Array.from(tabsByUrl.values()).map((tab, index) => ({
    ...tab,
    index
  }));

  if (tabs.length === 0) {
    return null;
  }

  return {
    device_id: latestHistoryRow.device_id,
    device_name: latestHistoryRow.device_name,
    snapshot: {
      schemaVersion: 1,
      device: {
        deviceId: latestHistoryRow.device_id,
        deviceName: latestHistoryRow.device_name,
        browser
      },
      syncedAt: latestHistoryRow.synced_at,
      windows: [
        {
          windowId: null,
          focused: false,
          incognito: false,
          tabs
        }
      ]
    },
    snapshot_hash: `merged-${latestHistoryRow.updated_at}`,
    synced_at: latestHistoryRow.synced_at,
    updated_at: latestHistoryRow.updated_at
  };
}

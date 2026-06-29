import type { SnapshotHistoryRecord, SnapshotRecord, TabSnapshot } from '@live-tab-mirror/shared';
import { addDays, readPositiveInteger } from './security';
import type { Env, SnapshotHistoryRow, SnapshotRow } from './types';

export const DEFAULT_HISTORY_LIMIT = 80;
export const MAX_HISTORY_LIMIT = 200;
export const DEFAULT_HISTORY_RETENTION_DAYS = 3;

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

export function readSnapshotHistoryRetentionDays(env: Pick<Env, 'SNAPSHOT_HISTORY_RETENTION_DAYS'>): number {
  return readPositiveInteger(env.SNAPSHOT_HISTORY_RETENTION_DAYS, DEFAULT_HISTORY_RETENTION_DAYS);
}

export function getSnapshotHistoryCutoffIso(
  env: Pick<Env, 'SNAPSHOT_HISTORY_RETENTION_DAYS'>,
  now = new Date()
): string {
  return toIso(addDays(now, -readSnapshotHistoryRetentionDays(env)));
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

export function snapshotHistoryRowToBody(row: SnapshotHistoryRow): SnapshotHistoryRecord {
  return {
    id: row.id,
    ...snapshotRowToBody(row)
  };
}

export async function cleanupSnapshotHistory(env: Env, now = new Date()): Promise<void> {
  await env.DB.prepare('delete from desktop_tab_snapshot_history where updated_at < ?1')
    .bind(getSnapshotHistoryCutoffIso(env, now))
    .run();
}

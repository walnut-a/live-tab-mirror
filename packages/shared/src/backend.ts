import type { TabSnapshot } from './types';

export type BackendProvider = 'supabase' | 'worker';

export interface BackendUser {
  email: string;
}

export interface SnapshotRecord {
  device_id: string;
  device_name: string;
  snapshot: TabSnapshot;
  snapshot_hash?: string;
  synced_at: string;
  updated_at: string;
}

export interface SnapshotHistoryRecord extends SnapshotRecord {
  id: string;
}

export interface SnapshotHistoryResponse {
  retentionDays: number;
  snapshots: SnapshotHistoryRecord[];
}

export interface WorkerSession {
  email: string;
  token: string;
  expiresAt: string;
}

export interface SnapshotUpsertResult {
  ok: boolean;
  unchanged?: boolean;
  snapshotHash?: string;
  syncedAt?: string;
  updatedAt?: string;
}

export function normalizeBackendProvider(value: string | undefined | null): BackendProvider {
  return value === 'worker' ? 'worker' : 'supabase';
}

export function isWorkerSessionFresh(session: WorkerSession | null, now = new Date()): session is WorkerSession {
  if (!session?.token || !session.email || !session.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

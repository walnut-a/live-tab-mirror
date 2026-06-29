import type { TabSnapshot } from '@live-tab-mirror/shared';

export interface Env {
  DB: D1Database;
  ADMIN_CODE_SECRET: string;
  SESSION_SECRET: string;
  ALLOWED_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
  LOGIN_CODE_TTL_MINUTES?: string;
  SESSION_TTL_DAYS?: string;
  SNAPSHOT_HISTORY_RETENTION_DAYS?: string;
}

export interface LoginCodeRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  email: string;
  token_hash: string;
  device_label: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface SnapshotRow {
  email: string;
  device_id: string;
  device_name: string;
  snapshot_hash: string;
  snapshot_json: string;
  synced_at: string;
  updated_at: string;
}

export interface SnapshotHistoryRow extends SnapshotRow {
  id: string;
}

export interface AuthenticatedSession {
  id: string;
  email: string;
}

export interface SnapshotUpsertBody {
  snapshot?: TabSnapshot;
  snapshotHash?: string;
}

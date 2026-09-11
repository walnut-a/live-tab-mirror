export const INBOX_STATUSES = ['INBOX', 'ARCHIVED', 'DELETED'] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const INBOX_SOURCES = ['CURRENT_PAGE', 'SHARE', 'MANUAL', 'CONNECTOR', 'EXTENSION'] as const;
export type InboxSource = (typeof INBOX_SOURCES)[number];

export interface InboxSyncItem {
  id: string;
  url: string;
  title: string;
  source: InboxSource;
  sourceItemId: string | null;
  dedupeKey: string;
  createdAt: number;
  lastWrittenAt: number;
  lastOpenedAt: number | null;
  openCount: number;
  status: InboxStatus;
  archivedAt: number | null;
  archiveReason: string | null;
  deletedAt: number | null;
  changedAt: number;
}

export interface InboxSyncChange {
  item: InboxSyncItem;
  revision: number;
}

export interface InboxChangesResponse {
  changes: InboxSyncChange[];
  cursor: string;
}

export interface InboxPushResponse {
  accepted: Array<{ id: string; revision: number }>;
}

export interface InboxCaptureInput {
  url: string;
  title?: string;
  sourceItemId?: string;
}

export function normalizeInboxUrl(value: string): { url: string; dedupeKey: string } | null {
  const input = value.trim();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  const normalized = url.toString();
  return { url: normalized, dedupeKey: normalized };
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isInboxSyncItem(value: unknown): value is InboxSyncItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const normalized = typeof item.url === 'string' ? normalizeInboxUrl(item.url) : null;
  return Boolean(
    typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 128 &&
    normalized && typeof item.title === 'string' && item.title.length <= 2048 &&
    typeof item.source === 'string' && INBOX_SOURCES.includes(item.source as InboxSource) &&
    isNullableString(item.sourceItemId) && typeof item.dedupeKey === 'string' &&
    typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt >= 0 &&
    typeof item.lastWrittenAt === 'number' && Number.isFinite(item.lastWrittenAt) && item.lastWrittenAt >= 0 &&
    isNullableNumber(item.lastOpenedAt) && typeof item.openCount === 'number' && Number.isInteger(item.openCount) && item.openCount >= 0 &&
    typeof item.status === 'string' && INBOX_STATUSES.includes(item.status as InboxStatus) &&
    isNullableNumber(item.archivedAt) && isNullableString(item.archiveReason) && isNullableNumber(item.deletedAt) &&
    typeof item.changedAt === 'number' && Number.isFinite(item.changedAt) && item.changedAt >= 0
  );
}

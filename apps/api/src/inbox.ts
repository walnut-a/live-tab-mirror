import type { InboxSyncItem } from '@live-tab-mirror/shared';

export const DEFAULT_INBOX_LIMIT = 100;
export const MAX_INBOX_LIMIT = 200;

export function readInboxCursor(value: string | null): number {
  const cursor = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

export function readInboxLimit(value: string | null): number {
  const limit = Number.parseInt(value ?? '', 10);
  if (!Number.isSafeInteger(limit) || limit <= 0) return DEFAULT_INBOX_LIMIT;
  return Math.min(limit, MAX_INBOX_LIMIT);
}

const statusRank: Record<InboxSyncItem['status'], number> = {
  INBOX: 0,
  ARCHIVED: 1,
  DELETED: 2
};

export function chooseInboxWinner(current: InboxSyncItem, incoming: InboxSyncItem): InboxSyncItem {
  if (incoming.changedAt !== current.changedAt) {
    return incoming.changedAt > current.changedAt ? incoming : current;
  }
  if (statusRank[incoming.status] !== statusRank[current.status]) {
    return statusRank[incoming.status] > statusRank[current.status] ? incoming : current;
  }
  return JSON.stringify(incoming) > JSON.stringify(current) ? incoming : current;
}

export function mergeInboxCapture(
  existing: InboxSyncItem | null,
  capture: { id: string; url: string; title: string; sourceItemId: string | null; now: number }
): InboxSyncItem {
  const changedAt = Math.max(capture.now, (existing?.changedAt ?? -1) + 1);
  return {
    id: existing?.id ?? capture.id,
    url: capture.url,
    title: capture.title || existing?.title || new URL(capture.url).hostname,
    source: 'EXTENSION',
    sourceItemId: capture.sourceItemId,
    dedupeKey: capture.url,
    createdAt: existing?.createdAt ?? changedAt,
    lastWrittenAt: changedAt,
    lastOpenedAt: existing?.lastOpenedAt ?? null,
    openCount: existing?.openCount ?? 0,
    status: 'INBOX',
    archivedAt: null,
    archiveReason: null,
    deletedAt: null,
    changedAt
  };
}

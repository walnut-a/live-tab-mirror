import {
  isInboxSyncItem,
  isTabSnapshot,
  normalizeInboxUrl,
  type InboxCaptureInput,
  type InboxChangesResponse,
  type InboxPushResponse,
  type InboxSyncChange,
  type InboxSyncItem
} from '@live-tab-mirror/shared';
import { errorResponse, jsonResponse, readJson } from './http';
import { getSnapshotHistoryCutoffIso } from './history';
import {
  chooseInboxWinner,
  createSnapshotInboxItem,
  mergeInboxCapture,
  readInboxCursor,
  readInboxLimit,
  snapshotTabsToInboxSeeds
} from './inbox';
import type { AuthenticatedSession, Env, InboxChangeRow, InboxItemRow } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function parseStoredItem(row: InboxItemRow | null): InboxSyncItem | null {
  if (!row) return null;
  try {
    const item = JSON.parse(row.item_json);
    return isInboxSyncItem(item) ? item : null;
  } catch {
    return null;
  }
}

function parseSnapshots(rows: Array<{ snapshot_json: string }>): import('@live-tab-mirror/shared').TabSnapshot[] {
  return rows.flatMap((row) => {
    try {
      const snapshot = JSON.parse(row.snapshot_json);
      return isTabSnapshot(snapshot) ? [snapshot] : [];
    } catch {
      return [];
    }
  }).sort((left, right) => right.syncedAt.localeCompare(left.syncedAt));
}

export async function syncSnapshotTabsIntoInbox(env: Env, email: string): Promise<number> {
  const [latestRows, historyRows, existingRows] = await Promise.all([
    env.DB.prepare(
      `select snapshot_json from desktop_tab_snapshots
       where email = ?1 order by updated_at desc`
    ).bind(email).all<{ snapshot_json: string }>(),
    env.DB.prepare(
      `select snapshot_json from desktop_tab_snapshot_history
       where email = ?1 and updated_at >= ?2
       order by updated_at desc limit 200`
    ).bind(email, getSnapshotHistoryCutoffIso(env)).all<{ snapshot_json: string }>(),
    env.DB.prepare('select dedupe_key from inbox_items where email = ?1')
      .bind(email).all<{ dedupe_key: string }>()
  ]);
  const existingDedupeKeys = new Set(existingRows.results.map((row) => row.dedupe_key));
  const seeds = snapshotTabsToInboxSeeds(
    parseSnapshots([...latestRows.results, ...historyRows.results]),
    existingDedupeKeys
  );
  const baseRevision = Date.now();

  for (let offset = 0; offset < seeds.length; offset += 40) {
    const statements = seeds.slice(offset, offset + 40).flatMap((seed, index) => {
      const item = createSnapshotInboxItem(seed, crypto.randomUUID(), baseRevision + offset + index);
      const itemJson = JSON.stringify(item);
      const changedAt = nowIso();
      return [
        env.DB.prepare(
          `insert into inbox_items (email, id, dedupe_key, item_json, changed_at, updated_at)
           values (?1, ?2, ?3, ?4, ?5, ?6)
           on conflict do nothing`
        ).bind(email, item.id, item.dedupeKey, itemJson, item.changedAt, changedAt),
        env.DB.prepare(
          `insert into inbox_changes (email, item_id, revision, item_json, changed_at)
           select ?1, ?2, ?3, ?4, ?5
           where exists (
             select 1 from inbox_items where email = ?1 and id = ?2
           )`
        ).bind(email, item.id, item.changedAt, itemJson, changedAt)
      ];
    });
    await env.DB.batch(statements);
  }

  return seeds.length;
}

async function findExisting(env: Env, email: string, item: InboxSyncItem): Promise<InboxSyncItem | null> {
  const row = await env.DB.prepare(
    `select email, id, dedupe_key, item_json, changed_at, updated_at
     from inbox_items where email = ?1 and (id = ?2 or dedupe_key = ?3)
     order by case when id = ?2 then 0 else 1 end limit 1`
  ).bind(email, item.id, item.dedupeKey).first<InboxItemRow>();
  return parseStoredItem(row ?? null);
}

async function saveIfNewer(env: Env, email: string, incoming: InboxSyncItem): Promise<InboxSyncItem> {
  const existing = await findExisting(env, email, incoming);
  const winner = existing ? chooseInboxWinner(existing, incoming) : incoming;
  if (existing && winner === existing) return existing;

  const item = existing && winner.id !== existing.id ? { ...winner, id: existing.id } : winner;
  const itemJson = JSON.stringify(item);
  const changedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `insert into inbox_items (email, id, dedupe_key, item_json, changed_at, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6)
       on conflict(email, id) do update set
         dedupe_key = excluded.dedupe_key,
         item_json = excluded.item_json,
         changed_at = excluded.changed_at,
         updated_at = excluded.updated_at`
    ).bind(email, item.id, item.dedupeKey, itemJson, item.changedAt, changedAt),
    env.DB.prepare(
      `insert into inbox_changes (email, item_id, revision, item_json, changed_at)
       values (?1, ?2, ?3, ?4, ?5)`
    ).bind(email, item.id, item.changedAt, itemJson, changedAt)
  ]);
  return item;
}

export async function captureInboxItem(
  request: Request,
  env: Env,
  session: AuthenticatedSession
): Promise<Response> {
  const body = await readJson<InboxCaptureInput>(request, 32 * 1024);
  const normalized = normalizeInboxUrl(String(body.url ?? ''));
  if (!normalized) return errorResponse(request, env, 400, 'Invalid inbox URL.');

  const probe = mergeInboxCapture(null, {
    id: crypto.randomUUID(), url: normalized.url, title: '', sourceItemId: null, now: Date.now()
  });
  const existing = await findExisting(env, session.email, probe);
  const item = mergeInboxCapture(existing, {
    id: probe.id,
    url: normalized.url,
    title: String(body.title ?? '').trim().slice(0, 2048),
    sourceItemId: body.sourceItemId ? String(body.sourceItemId).slice(0, 128) : null,
    now: Date.now()
  });
  return jsonResponse(request, env, { item: await saveIfNewer(env, session.email, item) });
}

export async function pullInboxChanges(
  request: Request,
  env: Env,
  session: AuthenticatedSession
): Promise<Response> {
  await syncSnapshotTabsIntoInbox(env, session.email);
  const url = new URL(request.url);
  const cursor = readInboxCursor(url.searchParams.get('cursor'));
  const limit = readInboxLimit(url.searchParams.get('limit'));
  const rows = await env.DB.prepare(
    `select sequence, revision, item_json from inbox_changes
     where email = ?1 and sequence > ?2 order by sequence asc limit ?3`
  ).bind(session.email, cursor, limit).all<InboxChangeRow>();
  const changes = rows.results.flatMap<InboxSyncChange>((row) => {
    try {
      const item = JSON.parse(row.item_json);
      return isInboxSyncItem(item) ? [{ item, revision: row.revision }] : [];
    } catch {
      return [];
    }
  });
  const nextCursor = rows.results.at(-1)?.sequence ?? cursor;
  const body: InboxChangesResponse = { changes, cursor: String(nextCursor) };
  return jsonResponse(request, env, body);
}

export async function pushInboxChanges(
  request: Request,
  env: Env,
  session: AuthenticatedSession
): Promise<Response> {
  const body = await readJson<{ changes?: unknown }>(request, 512 * 1024);
  if (!Array.isArray(body.changes) || body.changes.length > 100) {
    return errorResponse(request, env, 400, 'Invalid inbox changes.');
  }
  const changes = body.changes as Array<Partial<InboxSyncChange>>;
  if (changes.some((change) => !isInboxSyncItem(change.item) || change.revision !== change.item.changedAt)) {
    return errorResponse(request, env, 400, 'Invalid inbox change.');
  }

  const accepted: InboxPushResponse['accepted'] = [];
  for (const change of changes as InboxSyncChange[]) {
    await saveIfNewer(env, session.email, change.item);
    accepted.push({ id: change.item.id, revision: change.revision });
  }
  return jsonResponse(request, env, { accepted } satisfies InboxPushResponse);
}

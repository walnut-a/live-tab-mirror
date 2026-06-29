import {
  createSnapshotHash,
  isAllowedEmail,
  isTabSnapshot,
  normalizeEmail,
  type TabSnapshot
} from '@live-tab-mirror/shared';
import { errorResponse, jsonResponse, optionsResponse, readJson } from './http';
import {
  addDays,
  addMinutes,
  adminSecretMatches,
  assertAllowedEmail,
  generateLoginCode,
  generateToken,
  hashWithSecret,
  readPositiveInteger
} from './security';
import type { AuthenticatedSession, Env, LoginCodeRow, SessionRow, SnapshotRow, SnapshotUpsertBody } from './types';

interface VerifyBody {
  email?: string;
  code?: string;
  deviceLabel?: string;
}

interface AdminLoginCodeBody {
  email?: string;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function parseBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Response('Missing bearer token', { status: 401 });
  }
  return match[1].trim();
}

async function requireSession(request: Request, env: Env): Promise<AuthenticatedSession> {
  const token = parseBearerToken(request);
  const tokenHash = await hashWithSecret(token, env.SESSION_SECRET);
  const row = await env.DB.prepare(
    `select id, email, token_hash, device_label, expires_at, revoked_at, created_at
     from sessions
     where token_hash = ?1 and revoked_at is null and expires_at > ?2
     limit 1`
  ).bind(tokenHash, nowIso()).first<SessionRow>();

  if (!row || !isAllowedEmail(row.email)) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return {
    id: row.id,
    email: normalizeEmail(row.email)
  };
}

async function createLoginCode(request: Request, env: Env): Promise<Response> {
  const authorized = await adminSecretMatches(env, request.headers.get('X-Admin-Secret'));
  if (!authorized) {
    return errorResponse(request, env, 401, 'Invalid admin secret.');
  }

  const body = await readJson<AdminLoginCodeBody>(request, 8 * 1024);
  const email = assertAllowedEmail(env, body.email || env.ALLOWED_EMAIL || '');
  const code = generateLoginCode();
  const codeHash = await hashWithSecret(code, env.SESSION_SECRET);
  const createdAt = new Date();
  const expiresAt = addMinutes(createdAt, readPositiveInteger(env.LOGIN_CODE_TTL_MINUTES, 20));
  const id = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare('delete from login_codes where expires_at <= ?1 or used_at is not null').bind(nowIso(createdAt)),
    env.DB.prepare(
      `insert into login_codes (id, email, code_hash, expires_at, used_at, created_at)
       values (?1, ?2, ?3, ?4, null, ?5)`
    ).bind(id, email, codeHash, nowIso(expiresAt), nowIso(createdAt))
  ]);

  return jsonResponse(request, env, {
    code,
    email,
    expiresAt: nowIso(expiresAt)
  });
}

async function verifyLoginCode(request: Request, env: Env): Promise<Response> {
  const body = await readJson<VerifyBody>(request, 16 * 1024);
  const email = assertAllowedEmail(env, body.email || '');
  const code = String(body.code ?? '').trim();

  if (!/^\d{6,12}$/.test(code)) {
    return errorResponse(request, env, 400, 'Invalid code.');
  }

  const codeHash = await hashWithSecret(code, env.SESSION_SECRET);
  const codeRow = await env.DB.prepare(
    `select id, email, code_hash, expires_at, used_at, created_at
     from login_codes
     where email = ?1 and code_hash = ?2 and used_at is null and expires_at > ?3
     order by created_at desc
     limit 1`
  ).bind(email, codeHash, nowIso()).first<LoginCodeRow>();

  if (!codeRow) {
    return errorResponse(request, env, 401, 'Invalid or expired code.');
  }

  const createdAt = new Date();
  const token = generateToken();
  const tokenHash = await hashWithSecret(token, env.SESSION_SECRET);
  const sessionId = crypto.randomUUID();
  const expiresAt = addDays(createdAt, readPositiveInteger(env.SESSION_TTL_DAYS, 30));

  await env.DB.batch([
    env.DB.prepare('update login_codes set used_at = ?1 where id = ?2 and used_at is null').bind(
      nowIso(createdAt),
      codeRow.id
    ),
    env.DB.prepare(
      `insert into sessions (id, email, token_hash, device_label, expires_at, revoked_at, created_at)
       values (?1, ?2, ?3, ?4, ?5, null, ?6)`
    ).bind(sessionId, email, tokenHash, body.deviceLabel ?? null, nowIso(expiresAt), nowIso(createdAt))
  ]);

  return jsonResponse(request, env, {
    email,
    token,
    expiresAt: nowIso(expiresAt)
  });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  await env.DB.prepare('update sessions set revoked_at = ?1 where id = ?2').bind(nowIso(), session.id).run();
  return jsonResponse(request, env, { ok: true });
}

function snapshotRowToBody(row: SnapshotRow): unknown {
  return {
    device_id: row.device_id,
    device_name: row.device_name,
    snapshot: JSON.parse(row.snapshot_json) as TabSnapshot,
    snapshot_hash: row.snapshot_hash,
    synced_at: row.synced_at,
    updated_at: row.updated_at
  };
}

async function latestSnapshot(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  const row = await env.DB.prepare(
    `select email, device_id, device_name, snapshot_hash, snapshot_json, synced_at, updated_at
     from desktop_tab_snapshots
     where email = ?1
     order by updated_at desc
     limit 1`
  ).bind(session.email).first<SnapshotRow>();

  return jsonResponse(request, env, row ? snapshotRowToBody(row) : null);
}

async function upsertSnapshot(request: Request, env: Env, deviceId: string): Promise<Response> {
  const session = await requireSession(request, env);
  const body = await readJson<SnapshotUpsertBody>(request, 512 * 1024);
  const snapshot = body.snapshot;

  if (!isTabSnapshot(snapshot)) {
    return errorResponse(request, env, 400, 'Invalid snapshot.');
  }

  if (snapshot.device.deviceId !== deviceId) {
    return errorResponse(request, env, 400, 'Snapshot device id does not match URL.');
  }

  const snapshotHash = await createSnapshotHash(snapshot);
  if (body.snapshotHash && body.snapshotHash !== snapshotHash) {
    return errorResponse(request, env, 400, 'Snapshot hash does not match payload.');
  }

  const existing = await env.DB.prepare(
    `select snapshot_hash, updated_at
     from desktop_tab_snapshots
     where email = ?1 and device_id = ?2
     limit 1`
  ).bind(session.email, deviceId).first<{ snapshot_hash: string; updated_at: string }>();

  if (existing?.snapshot_hash === snapshotHash) {
    return jsonResponse(request, env, {
      ok: true,
      unchanged: true,
      snapshotHash,
      syncedAt: snapshot.syncedAt,
      updatedAt: existing.updated_at
    });
  }

  const updatedAt = nowIso();
  await env.DB.prepare(
    `insert into desktop_tab_snapshots (
       email, device_id, device_name, snapshot_hash, snapshot_json, synced_at, updated_at
     )
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     on conflict(email, device_id) do update set
       device_name = excluded.device_name,
       snapshot_hash = excluded.snapshot_hash,
       snapshot_json = excluded.snapshot_json,
       synced_at = excluded.synced_at,
       updated_at = excluded.updated_at`
  ).bind(
    session.email,
    deviceId,
    snapshot.device.deviceName,
    snapshotHash,
    JSON.stringify(snapshot),
    snapshot.syncedAt,
    updatedAt
  ).run();

  return jsonResponse(request, env, {
    ok: true,
    unchanged: false,
    snapshotHash,
    syncedAt: snapshot.syncedAt,
    updatedAt
  });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return optionsResponse(request, env);
  }

  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse(request, env, { ok: true });
  }

  if (request.method === 'POST' && url.pathname === '/admin/login-code') {
    return createLoginCode(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/auth/verify') {
    return verifyLoginCode(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/auth/logout') {
    return logout(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/snapshot/latest') {
    return latestSnapshot(request, env);
  }

  const snapshotMatch = url.pathname.match(/^\/snapshot\/([^/]+)$/);
  if (request.method === 'PUT' && snapshotMatch) {
    return upsertSnapshot(request, env, decodeURIComponent(snapshotMatch[1]));
  }

  return errorResponse(request, env, 404, 'Not found.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof Response) {
        return errorResponse(request, env, error.status, await error.text());
      }

      const message = error instanceof Error ? error.message : 'Internal server error.';
      return errorResponse(request, env, 500, message);
    }
  }
};

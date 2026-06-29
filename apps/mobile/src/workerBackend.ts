import {
  isWorkerSessionFresh,
  normalizeEmail,
  type BackendUser,
  type SnapshotDeviceRecord,
  type SnapshotHistoryResponse,
  type SnapshotRecord,
  type WorkerSession
} from '@live-tab-mirror/shared';
import { mobileEnv } from './env';

const WORKER_SESSION_KEY = 'live-tab-mirror:worker-session';

function getApiUrl(path: string): string {
  return new URL(path, mobileEnv.workerApiUrl).toString();
}

function readWorkerSession(): WorkerSession | null {
  const value = window.localStorage.getItem(WORKER_SESSION_KEY);
  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as WorkerSession;
    if (isWorkerSessionFresh(session)) {
      return session;
    }
  } catch {
    // Ignore malformed local state and clear it below.
  }

  window.localStorage.removeItem(WORKER_SESSION_KEY);
  return null;
}

function writeWorkerSession(session: WorkerSession): void {
  window.localStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(session));
}

function clearWorkerSession(): void {
  window.localStorage.removeItem(WORKER_SESSION_KEY);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body ? String(body.error) : response.statusText;
    throw new Error(message);
  }

  return body as T;
}

async function workerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readWorkerSession();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  if (session) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  const response = await fetch(getApiUrl(path), {
    ...init,
    headers
  });
  return parseJsonResponse<T>(response);
}

export function getWorkerUser(): BackendUser | null {
  const session = readWorkerSession();
  return session ? { email: session.email } : null;
}

export async function verifyWorkerCode(email: string, code: string): Promise<BackendUser> {
  const session = await workerFetch<WorkerSession>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizeEmail(email),
      code
    })
  });

  writeWorkerSession(session);
  return { email: session.email };
}

export async function signOutWorker(): Promise<void> {
  const session = readWorkerSession();

  if (session) {
    await workerFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    }).catch(() => undefined);
  }

  clearWorkerSession();
}

function withDeviceParam(path: string, deviceId?: string | null): string {
  if (!deviceId) {
    return path;
  }

  const params = new URLSearchParams({ device_id: deviceId });
  return `${path}?${params.toString()}`;
}

export async function fetchLatestWorkerSnapshot(deviceId?: string | null): Promise<SnapshotRecord | null> {
  return workerFetch<SnapshotRecord | null>(withDeviceParam('/snapshot/latest', deviceId));
}

export async function fetchWorkerSnapshotHistory(
  deviceId?: string | null
): Promise<SnapshotHistoryResponse> {
  const params = new URLSearchParams();
  if (deviceId) {
    params.set('device_id', deviceId);
  }

  const query = params.toString();
  return workerFetch<SnapshotHistoryResponse>(query ? `/snapshots/history?${query}` : '/snapshots/history');
}

export async function fetchWorkerDevices(): Promise<SnapshotDeviceRecord[]> {
  return workerFetch<SnapshotDeviceRecord[]>('/devices');
}

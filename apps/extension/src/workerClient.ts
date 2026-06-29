import {
  createSnapshotHash,
  normalizeEmail,
  type BackendUser,
  type SnapshotUpsertResult,
  type TabSnapshot,
  type WorkerSession
} from '@live-tab-mirror/shared';
import { extensionEnv } from './env';
import { clearWorkerSession, readWorkerSession, writeWorkerSession } from './storage';

function getApiUrl(path: string): string {
  return new URL(path, extensionEnv.workerApiUrl).toString();
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
  const session = await readWorkerSession();
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

export async function getWorkerUser(): Promise<BackendUser | null> {
  const session = await readWorkerSession();
  return session ? { email: session.email } : null;
}

export async function verifyWorkerCode(email: string, code: string): Promise<BackendUser> {
  const session = await workerFetch<WorkerSession>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizeEmail(email),
      code,
      deviceLabel: extensionEnv.deviceName
    })
  });

  await writeWorkerSession(session);
  return { email: session.email };
}

export async function signOutWorker(): Promise<void> {
  const session = await readWorkerSession();

  if (session) {
    await workerFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    }).catch(() => undefined);
  }

  await clearWorkerSession();
}

export async function upsertWorkerSnapshot(snapshot: TabSnapshot): Promise<SnapshotUpsertResult> {
  const snapshotHash = await createSnapshotHash(snapshot);
  return workerFetch<SnapshotUpsertResult>(
    `/snapshot/${encodeURIComponent(snapshot.device.deviceId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        snapshot,
        snapshotHash
      })
    }
  );
}

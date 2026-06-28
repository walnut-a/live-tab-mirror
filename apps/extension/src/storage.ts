import type { SupportedStorage } from '@supabase/supabase-js';

export interface ExtensionSyncState {
  lastAttemptAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  tabCount: number;
  windowCount: number;
  reason: string | null;
}

export const DEFAULT_SYNC_STATE: ExtensionSyncState = {
  lastAttemptAt: null,
  lastSyncAt: null,
  lastError: null,
  tabCount: 0,
  windowCount: 0,
  reason: null
};

export interface PendingOtpState {
  email: string;
  requestedAt: string;
}

const SYNC_STATE_KEY = 'live-tab-mirror:sync-state';
const PENDING_OTP_KEY = 'live-tab-mirror:pending-otp';
const PENDING_OTP_TTL_MS = 60 * 60 * 1000;

function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

export const chromeStorageAdapter: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await storageGet(key);
    return typeof result[key] === 'string' ? result[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await storageSet({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await storageRemove(key);
  }
};

export async function readSyncState(): Promise<ExtensionSyncState> {
  const result = await storageGet(SYNC_STATE_KEY);
  return {
    ...DEFAULT_SYNC_STATE,
    ...(typeof result[SYNC_STATE_KEY] === 'object' && result[SYNC_STATE_KEY] !== null
      ? (result[SYNC_STATE_KEY] as Partial<ExtensionSyncState>)
      : {})
  };
}

export async function writeSyncState(state: ExtensionSyncState): Promise<ExtensionSyncState> {
  await storageSet({ [SYNC_STATE_KEY]: state });
  return state;
}

export async function clearSyncState(): Promise<ExtensionSyncState> {
  await storageRemove(SYNC_STATE_KEY);
  return DEFAULT_SYNC_STATE;
}

function parsePendingOtpState(value: unknown): PendingOtpState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const pendingOtp = value as Partial<PendingOtpState>;
  if (typeof pendingOtp.email !== 'string' || typeof pendingOtp.requestedAt !== 'string') {
    return null;
  }

  return {
    email: pendingOtp.email,
    requestedAt: pendingOtp.requestedAt
  };
}

function isPendingOtpFresh(pendingOtp: PendingOtpState, now: Date): boolean {
  const requestedAt = Date.parse(pendingOtp.requestedAt);
  return Number.isFinite(requestedAt) && now.getTime() - requestedAt <= PENDING_OTP_TTL_MS;
}

export async function readPendingOtp(now = new Date()): Promise<PendingOtpState | null> {
  const result = await storageGet(PENDING_OTP_KEY);
  const pendingOtp = parsePendingOtpState(result[PENDING_OTP_KEY]);

  if (!pendingOtp) {
    return null;
  }

  if (!isPendingOtpFresh(pendingOtp, now)) {
    await storageRemove(PENDING_OTP_KEY);
    return null;
  }

  return pendingOtp;
}

export async function writePendingOtp(email: string, requestedAt = new Date()): Promise<PendingOtpState> {
  const pendingOtp = {
    email,
    requestedAt: requestedAt.toISOString()
  };

  await storageSet({ [PENDING_OTP_KEY]: pendingOtp });
  return pendingOtp;
}

export async function clearPendingOtp(): Promise<void> {
  await storageRemove(PENDING_OTP_KEY);
}

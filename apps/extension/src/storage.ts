import {
  DEFAULT_DEVICE_ID,
  DEFAULT_DEVICE_NAME,
  isWorkerSessionFresh,
  type WorkerSession
} from '@live-tab-mirror/shared';

export interface ExtensionSyncState {
  lastAttemptAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  tabCount: number;
  windowCount: number;
  reason: string | null;
}

export interface ExtensionDeviceConfig {
  deviceId: string;
  deviceName: string;
}

export interface ExtensionDeviceDefaults {
  deviceId?: string;
  deviceName?: string;
}

export const DEFAULT_SYNC_STATE: ExtensionSyncState = {
  lastAttemptAt: null,
  lastSyncAt: null,
  lastError: null,
  tabCount: 0,
  windowCount: 0,
  reason: null
};

const SYNC_STATE_KEY = 'live-tab-mirror:sync-state';
const WORKER_SESSION_KEY = 'live-tab-mirror:worker-session';
const DEVICE_CONFIG_KEY = 'live-tab-mirror:device-config';

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

export async function readWorkerSession(now = new Date()): Promise<WorkerSession | null> {
  const result = await storageGet(WORKER_SESSION_KEY);
  const session = result[WORKER_SESSION_KEY] as WorkerSession | undefined;

  if (isWorkerSessionFresh(session ?? null, now)) {
    return session ?? null;
  }

  await storageRemove(WORKER_SESSION_KEY);
  return null;
}

export async function writeWorkerSession(session: WorkerSession): Promise<void> {
  await storageSet({ [WORKER_SESSION_KEY]: session });
}

export async function clearWorkerSession(): Promise<void> {
  await storageRemove(WORKER_SESSION_KEY);
}

function generateDeviceId(): string {
  return `desktop-chrome-${crypto.randomUUID()}`;
}

function normalizeDeviceName(value: string | undefined): string {
  return value?.trim() || DEFAULT_DEVICE_NAME;
}

function getDefaultDeviceId(defaults: ExtensionDeviceDefaults): string {
  const configuredDeviceId = defaults.deviceId?.trim();
  return configuredDeviceId && configuredDeviceId !== DEFAULT_DEVICE_ID
    ? configuredDeviceId
    : generateDeviceId();
}

function isStoredDeviceConfig(value: unknown): value is ExtensionDeviceConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const config = value as Partial<ExtensionDeviceConfig>;
  return (
    typeof config.deviceId === 'string' &&
    config.deviceId.trim().length > 0 &&
    config.deviceId !== DEFAULT_DEVICE_ID &&
    typeof config.deviceName === 'string' &&
    config.deviceName.trim().length > 0
  );
}

export async function readDeviceConfig(defaults: ExtensionDeviceDefaults = {}): Promise<ExtensionDeviceConfig> {
  const result = await storageGet(DEVICE_CONFIG_KEY);
  const stored = result[DEVICE_CONFIG_KEY];

  if (isStoredDeviceConfig(stored)) {
    return stored;
  }

  const config = {
    deviceId: getDefaultDeviceId(defaults),
    deviceName: normalizeDeviceName(defaults.deviceName)
  };
  await storageSet({ [DEVICE_CONFIG_KEY]: config });
  return config;
}

export async function writeDeviceConfig(config: ExtensionDeviceConfig): Promise<ExtensionDeviceConfig> {
  const nextConfig = {
    deviceId: config.deviceId.trim() || generateDeviceId(),
    deviceName: normalizeDeviceName(config.deviceName)
  };
  await storageSet({ [DEVICE_CONFIG_KEY]: nextConfig });
  return nextConfig;
}

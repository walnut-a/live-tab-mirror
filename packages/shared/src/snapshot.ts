import { SNAPSHOT_SCHEMA_VERSION } from './constants';
import type {
  BrowserTabInput,
  BrowserWindowInput,
  SnapshotOptions,
  SnapshotTab,
  SnapshotWindow,
  TabSnapshot
} from './types';

const OPENABLE_PROTOCOLS = new Set(['http:', 'https:']);

export function hasOpenableUrl(url: string | undefined | null): boolean {
  if (!url) {
    return false;
  }

  try {
    return OPENABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function getDomain(url: string | undefined | null): string {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normalizeTab(tab: BrowserTabInput): SnapshotTab | null {
  if (!hasOpenableUrl(tab.url)) {
    return null;
  }

  const url = tab.url ?? '';

  return {
    id: tab.id ?? null,
    index: tab.index ?? 0,
    title: tab.title?.trim() || url,
    url,
    favIconUrl: tab.favIconUrl || null,
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    groupId: tab.groupId ?? -1,
    domain: getDomain(url)
  };
}

function normalizeWindow(window: BrowserWindowInput): SnapshotWindow | null {
  if (window.incognito) {
    return null;
  }

  const tabs = (window.tabs ?? [])
    .map(normalizeTab)
    .filter((tab): tab is SnapshotTab => tab !== null)
    .sort((left, right) => left.index - right.index);

  if (tabs.length === 0) {
    return null;
  }

  return {
    windowId: window.id ?? null,
    focused: Boolean(window.focused),
    incognito: false,
    tabs
  };
}

export function createSnapshotFromWindows(
  windows: BrowserWindowInput[],
  options: SnapshotOptions
): TabSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    device: {
      deviceId: options.deviceId,
      deviceName: options.deviceName,
      browser: options.browser
    },
    syncedAt: (options.now ?? new Date()).toISOString(),
    windows: windows
      .map(normalizeWindow)
      .filter((window): window is SnapshotWindow => window !== null)
  };
}

function tabMatches(tab: SnapshotTab, query: string): boolean {
  const haystack = `${tab.title} ${tab.url} ${tab.domain}`.toLowerCase();
  return haystack.includes(query);
}

export function filterSnapshot(snapshot: TabSnapshot, query: string): TabSnapshot {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return snapshot;
  }

  return {
    ...snapshot,
    windows: snapshot.windows
      .map((window) => ({
        ...window,
        tabs: window.tabs.filter((tab) => tabMatches(tab, normalizedQuery))
      }))
      .filter((window) => window.tabs.length > 0)
  };
}

export function countTabs(snapshot: TabSnapshot | null): number {
  return snapshot?.windows.reduce((total, window) => total + window.tabs.length, 0) ?? 0;
}

function isSnapshotTab(value: unknown): value is SnapshotTab {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const tab = value as Partial<SnapshotTab>;
  return (
    (typeof tab.id === 'number' || tab.id === null) &&
    typeof tab.index === 'number' &&
    typeof tab.title === 'string' &&
    typeof tab.url === 'string' &&
    hasOpenableUrl(tab.url) &&
    (typeof tab.favIconUrl === 'string' || tab.favIconUrl === null) &&
    typeof tab.active === 'boolean' &&
    typeof tab.pinned === 'boolean' &&
    typeof tab.audible === 'boolean' &&
    typeof tab.groupId === 'number' &&
    typeof tab.domain === 'string'
  );
}

function isSnapshotWindow(value: unknown): value is SnapshotWindow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const window = value as Partial<SnapshotWindow>;
  return (
    (typeof window.windowId === 'number' || window.windowId === null) &&
    typeof window.focused === 'boolean' &&
    window.incognito === false &&
    Array.isArray(window.tabs) &&
    window.tabs.every(isSnapshotTab)
  );
}

export function isTabSnapshot(value: unknown): value is TabSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const snapshot = value as Partial<TabSnapshot>;
  return (
    snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
    typeof snapshot.syncedAt === 'string' &&
    typeof snapshot.device?.deviceId === 'string' &&
    typeof snapshot.device.deviceName === 'string' &&
    typeof snapshot.device.browser === 'string' &&
    Array.isArray(snapshot.windows) &&
    snapshot.windows.every(isSnapshotWindow)
  );
}

export async function createSnapshotHash(snapshot: TabSnapshot): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot))
  );

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

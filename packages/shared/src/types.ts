export type FreshnessState = 'fresh' | 'stale' | 'old' | 'unknown';

export interface FreshnessDescription {
  label: string;
  state: FreshnessState;
  ageSeconds: number | null;
}

export interface SnapshotDevice {
  deviceId: string;
  deviceName: string;
  browser: string;
}

export interface BrowserTabInput {
  id?: number;
  index?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active?: boolean;
  pinned?: boolean;
  audible?: boolean;
  groupId?: number;
}

export interface BrowserWindowInput {
  id?: number;
  focused?: boolean;
  incognito?: boolean;
  tabs?: BrowserTabInput[];
}

export interface SnapshotTab {
  id: number | null;
  index: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  groupId: number;
  domain: string;
}

export interface SnapshotWindow {
  windowId: number | null;
  focused: boolean;
  incognito: false;
  tabs: SnapshotTab[];
}

export interface TabSnapshot {
  schemaVersion: 1;
  device: SnapshotDevice;
  syncedAt: string;
  windows: SnapshotWindow[];
}

export interface SnapshotOptions {
  deviceId: string;
  deviceName: string;
  browser: string;
  now?: Date;
}

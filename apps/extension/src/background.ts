import {
  countTabs,
  createSnapshotFromWindows,
  isAllowedEmail,
  type BrowserWindowInput
} from '@live-tab-mirror/shared';
import { extensionEnv, isSupabaseConfigured } from './env';
import { supabase } from './supabaseClient';
import { clearSyncState, readSyncState, writeSyncState, type ExtensionSyncState } from './storage';

const HEARTBEAT_ALARM = 'live-tab-mirror-heartbeat';
const DEFAULT_DEBOUNCE_MS = 1600;
const TITLE_DEBOUNCE_MS = 2200;

let pendingSync: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

function toBrowserWindowInput(window: chrome.windows.Window): BrowserWindowInput {
  return {
    id: window.id,
    focused: window.focused,
    incognito: window.incognito,
    tabs: window.tabs?.map((tab) => ({
      id: tab.id,
      index: tab.index,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible,
      groupId: tab.groupId
    }))
  };
}

async function getNormalWindows(): Promise<BrowserWindowInput[]> {
  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ['normal']
  });

  return windows.map(toBrowserWindowInput);
}

async function recordFailure(reason: string, message: string): Promise<ExtensionSyncState> {
  return writeSyncState({
    ...(await readSyncState()),
    lastAttemptAt: new Date().toISOString(),
    lastError: message,
    reason
  });
}

export async function syncNow(reason = 'manual'): Promise<ExtensionSyncState> {
  if (syncing) {
    return readSyncState();
  }

  syncing = true;
  const lastAttemptAt = new Date().toISOString();

  try {
    if (!isSupabaseConfigured()) {
      return await recordFailure(reason, '请先配置 Supabase URL 和 publishable key。');
    }

    const { data, error: sessionError } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (sessionError) {
      return await recordFailure(reason, sessionError.message);
    }

    if (!user) {
      return await recordFailure(reason, '扩展还没有登录。');
    }

    if (!isAllowedEmail(user.email ?? '')) {
      await supabase.auth.signOut();
      return await recordFailure(reason, '当前账号不在允许列表中。');
    }

    const snapshot = createSnapshotFromWindows(await getNormalWindows(), {
      deviceId: extensionEnv.deviceId,
      deviceName: extensionEnv.deviceName,
      browser: 'Chrome'
    });

    const { error } = await supabase.from('desktop_tab_snapshots').upsert(
      {
        user_id: user.id,
        device_id: snapshot.device.deviceId,
        device_name: snapshot.device.deviceName,
        snapshot,
        synced_at: snapshot.syncedAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,device_id' }
    );

    if (error) {
      return await recordFailure(reason, error.message);
    }

    return writeSyncState({
      lastAttemptAt,
      lastSyncAt: snapshot.syncedAt,
      lastError: null,
      tabCount: countTabs(snapshot),
      windowCount: snapshot.windows.length,
      reason
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败。';
    return recordFailure(reason, message);
  } finally {
    syncing = false;
  }
}

function scheduleSync(reason: string, delayMs = DEFAULT_DEBOUNCE_MS): void {
  if (pendingSync !== null) {
    clearTimeout(pendingSync);
  }

  pendingSync = setTimeout(() => {
    pendingSync = null;
    void syncNow(reason);
  }, delayMs);
}

function ensureHeartbeat(): void {
  chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: 1
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureHeartbeat();
  scheduleSync('installed', 100);
});

chrome.runtime.onStartup.addListener(() => {
  ensureHeartbeat();
  scheduleSync('startup', 100);
});

chrome.tabs.onCreated.addListener(() => scheduleSync('tab-created'));
chrome.tabs.onRemoved.addListener(() => scheduleSync('tab-removed'));
chrome.tabs.onMoved.addListener(() => scheduleSync('tab-moved'));
chrome.tabs.onAttached.addListener(() => scheduleSync('tab-attached'));
chrome.tabs.onDetached.addListener(() => scheduleSync('tab-detached'));
chrome.tabs.onActivated.addListener(() => scheduleSync('tab-activated'));
chrome.tabs.onReplaced.addListener(() => scheduleSync('tab-replaced'));
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned) {
    scheduleSync('tab-updated', TITLE_DEBOUNCE_MS);
  }
});

chrome.windows.onCreated.addListener(() => scheduleSync('window-created'));
chrome.windows.onRemoved.addListener(() => scheduleSync('window-removed'));
chrome.windows.onFocusChanged.addListener(() => scheduleSync('window-focus'));

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    void syncNow('heartbeat');
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message.type === 'getStatus') {
    void readSyncState().then((state) => sendResponse({ ok: true, state }));
    return true;
  }

  if (message.type === 'syncNow') {
    void syncNow('manual').then((state) => sendResponse({ ok: true, state }));
    return true;
  }

  if (message.type === 'clearStatus') {
    void clearSyncState().then((state) => sendResponse({ ok: true, state }));
    return true;
  }

  return false;
});

ensureHeartbeat();

import {
  countTabs,
  createSnapshotFromWindows,
  isAllowedEmail,
  type BrowserWindowInput
} from '@live-tab-mirror/shared';
import { extensionEnv, isBackendConfigured } from './env';
import { supabase } from './supabaseClient';
import {
  DEFAULT_DEBOUNCE_MS,
  HEARTBEAT_PERIOD_MINUTES,
  TITLE_DEBOUNCE_MS
} from './syncPolicy';
import {
  clearSyncState,
  readSyncState,
  readWorkerSession,
  writeSyncState,
  type ExtensionSyncState
} from './storage';
import { signOutWorker, upsertWorkerSnapshot } from './workerClient';

const HEARTBEAT_ALARM = 'live-tab-mirror-heartbeat';

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

async function buildCurrentSnapshot() {
  return createSnapshotFromWindows(await getNormalWindows(), {
    deviceId: extensionEnv.deviceId,
    deviceName: extensionEnv.deviceName,
    browser: 'Chrome'
  });
}

async function syncToWorker(reason: string, lastAttemptAt: string): Promise<ExtensionSyncState> {
  const session = await readWorkerSession();

  if (!session) {
    return recordFailure(reason, '扩展还没有登录。');
  }

  if (!isAllowedEmail(session.email)) {
    await signOutWorker();
    return recordFailure(reason, '当前账号不在允许列表中。');
  }

  const snapshot = await buildCurrentSnapshot();
  await upsertWorkerSnapshot(snapshot);

  return writeSyncState({
    lastAttemptAt,
    lastSyncAt: snapshot.syncedAt,
    lastError: null,
    tabCount: countTabs(snapshot),
    windowCount: snapshot.windows.length,
    reason
  });
}

async function syncToSupabase(reason: string, lastAttemptAt: string): Promise<ExtensionSyncState> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  const user = data.session?.user;

  if (sessionError) {
    return recordFailure(reason, sessionError.message);
  }

  if (!user) {
    return recordFailure(reason, '扩展还没有登录。');
  }

  if (!isAllowedEmail(user.email ?? '')) {
    await supabase.auth.signOut();
    return recordFailure(reason, '当前账号不在允许列表中。');
  }

  const snapshot = await buildCurrentSnapshot();
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
    return recordFailure(reason, error.message);
  }

  return writeSyncState({
    lastAttemptAt,
    lastSyncAt: snapshot.syncedAt,
    lastError: null,
    tabCount: countTabs(snapshot),
    windowCount: snapshot.windows.length,
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
    if (!isBackendConfigured()) {
      return await recordFailure(reason, '请先配置当前后端需要的环境变量。');
    }

    return extensionEnv.backendProvider === 'worker'
      ? await syncToWorker(reason, lastAttemptAt)
      : await syncToSupabase(reason, lastAttemptAt);
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
    periodInMinutes: HEARTBEAT_PERIOD_MINUTES
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

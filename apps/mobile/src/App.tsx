import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALLOWED_EMAIL,
  type BackendUser,
  countTabs,
  filterSnapshot,
  getDomain,
  getOtpLoginViewState,
  hasOpenableUrl,
  isAllowedEmail,
  normalizeEmail,
  type SnapshotDeviceRecord,
  type SnapshotRecord,
  type TabSnapshot
} from '@live-tab-mirror/shared';
import {
  ExternalLink,
  History,
  Loader2,
  LogOut,
  Pin,
  RefreshCw,
  Search
} from 'lucide-react';
import { isBackendConfigured, mobileEnv } from './env';
import { SNAPSHOT_POLL_INTERVAL_MS } from './polling';
import {
  fetchWorkerDevices,
  fetchLatestWorkerSnapshot,
  fetchWorkerSnapshotHistory,
  getWorkerUser,
  signOutWorker,
  verifyWorkerCode
} from './workerBackend';

async function fetchLatestSnapshot(deviceId?: string | null): Promise<SnapshotRecord | null> {
  return fetchLatestWorkerSnapshot(deviceId);
}

async function fetchSnapshotHistory(deviceId?: string | null): Promise<SnapshotRecord | null> {
  const data = await fetchWorkerSnapshotHistory(deviceId);
  return data.snapshot;
}

async function fetchSnapshotDevices(): Promise<SnapshotDeviceRecord[]> {
  return fetchWorkerDevices();
}

function formatSnapshotTime(value?: string | null): string {
  if (!value) {
    return '未知时间';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatSnapshotSourceLabel(value?: string | null): string {
  if (!value) {
    return '等待同步';
  }

  const formattedTime = formatSnapshotTime(value);
  return formattedTime === '未知时间' ? '同步时间未知' : `同步于 ${formattedTime}`;
}

function useSnapshotPolling(user: BackendUser | null, selectedDeviceId: string | null) {
  const [row, setRow] = useState<SnapshotRecord | null>(null);
  const [historyRow, setHistoryRow] = useState<SnapshotRecord | null>(null);
  const [devices, setDevices] = useState<SnapshotDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !isBackendConfigured()) {
      return;
    }

    setLoading(true);

    try {
      const [data, nextDevices] = await Promise.all([
        fetchLatestSnapshot(selectedDeviceId),
        fetchSnapshotDevices()
      ]);
      const historyDeviceId = selectedDeviceId ?? data?.device_id ?? null;
      const history = await fetchSnapshotHistory(historyDeviceId);
      setError(null);
      setRow(data);
      setHistoryRow(history);
      setDevices(nextDevices);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '刷新失败。');
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, user]);

  useEffect(() => {
    if (!user) {
      setRow(null);
      setHistoryRow(null);
      setDevices([]);
      setError(null);
      return;
    }

    void refresh();

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void refresh();
      }
    }, SNAPSHOT_POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh, user]);

  return { row, historyRow, devices, loading, error, refresh };
}

export function App() {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [token, setToken] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const { row, historyRow, devices, loading, error, refresh } = useSnapshotPolling(user, selectedDeviceId);
  const activeRow = row;
  const snapshot = activeRow?.snapshot ?? null;
  const filteredSnapshot = useMemo(
    () => (snapshot ? filterSnapshot(snapshot, query) : null),
    [query, snapshot]
  );
  const historySnapshot = historyRow?.snapshot ?? null;
  const filteredHistorySnapshot = useMemo(
    () => (historySnapshot ? filterSnapshot(historySnapshot, query) : null),
    [historySnapshot, query]
  );
  const snapshotSourceLabel = formatSnapshotSourceLabel(snapshot?.syncedAt ?? activeRow?.synced_at ?? null);
  const backendConfigured = isBackendConfigured();
  const otpLoginView = getOtpLoginViewState({
    busy: authBusy,
    configured: backendConfigured,
    token
  });

  useEffect(() => {
    setUser(getWorkerUser());
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    if (selectedDeviceId && devices.length > 0 && !devices.some((device) => device.device_id === selectedDeviceId)) {
      setSelectedDeviceId(null);
    }
  }, [devices, selectedDeviceId]);

  async function verifyOtp() {
    setAuthBusy(true);
    setAuthError(null);

    const normalizedEmail = normalizeEmail(email);
    if (!isAllowedEmail(normalizedEmail)) {
      setAuthBusy(false);
      setAuthError('这里只有 zhaowork74@gmail.com 可以登录。');
      return;
    }

    try {
      const nextUser = await verifyWorkerCode(normalizedEmail, token.trim());
      setUser(nextUser);
      await refresh();
    } catch (verifyError) {
      setAuthError(verifyError instanceof Error ? verifyError.message : '登录失败。');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    await signOutWorker();
    setUser(null);
    setToken('');
    setQuery('');
    setSelectedDeviceId(null);
  }

  if (authLoading) {
    return (
      <main className="center-screen">
        <Loader2 className="spin" size={22} />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <h1>Live Tabs</h1>
          <p>输入本机脚本生成的验证码后查看电脑 Chrome 当前标签页。</p>

          {!backendConfigured ? (
            <div className="notice error">
              请先配置当前后端需要的环境变量。
            </div>
          ) : null}

          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label>
            验证码
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button type="button" onClick={verifyOtp} disabled={otpLoginView.verifyButtonDisabled}>
            登录
          </button>

          {authError ? <div className="notice error">{authError}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Live Tabs</h1>
          <p className="freshness">{snapshotSourceLabel}</p>
        </div>
        <div className="top-actions">
          <button type="button" className="icon-button" onClick={() => void refresh()} aria-label="刷新">
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          </button>
          <button type="button" className="icon-button" onClick={signOut} aria-label="退出登录">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="app-content">
        <section className="meta-row">
          <span>{activeRow?.device_name ?? mobileEnv.allowedEmail}</span>
          <span>{snapshot ? `${countTabs(snapshot)} 个标签页` : '等待同步'}</span>
        </section>

        {devices.length > 1 ? (
          <DeviceFilter
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => {
              setSelectedDeviceId(deviceId);
            }}
          />
        ) : null}

        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            placeholder="搜索标题、URL 或域名"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {error ? <div className="notice error">暂时无法刷新，已保留上次看到的列表。{error}</div> : null}

        {!snapshot ? (
          <section className="empty-state">
            <h2>还没有收到桌面端同步</h2>
            <p>请确认 Chrome 扩展已登录并运行。</p>
          </section>
        ) : filteredSnapshot && countTabs(filteredSnapshot) === 0 ? (
          <section className="empty-state">
            <h2>没有匹配结果</h2>
            <p>换一个标题、URL 或域名试试。</p>
          </section>
        ) : (
          <TabWindows snapshot={filteredSnapshot ?? snapshot} />
        )}

        {historySnapshot && filteredHistorySnapshot && countTabs(filteredHistorySnapshot) > 0 ? (
          <HistorySection snapshot={filteredHistorySnapshot} />
        ) : null}
      </section>
    </main>
  );
}

function DeviceFilter({
  devices,
  selectedDeviceId,
  onSelect
}: {
  devices: SnapshotDeviceRecord[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string | null) => void;
}) {
  return (
    <section className="device-strip" aria-label="设备筛选">
      <div className="device-list">
        <button
          type="button"
          className={`device-chip ${selectedDeviceId === null ? 'active' : ''}`}
          aria-pressed={selectedDeviceId === null}
          onClick={() => onSelect(null)}
        >
          <span>最近同步</span>
          <small>自动切换</small>
        </button>

        {devices.map((device) => (
          <button
            type="button"
            className={`device-chip ${selectedDeviceId === device.device_id ? 'active' : ''}`}
            aria-pressed={selectedDeviceId === device.device_id}
            key={device.device_id}
            onClick={() => onSelect(device.device_id)}
          >
            <span>{device.device_name}</span>
            <small>{formatSnapshotTime(device.updated_at)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function HistorySection({ snapshot }: { snapshot: TabSnapshot }) {
  return (
    <section className="history-section" aria-label="最近 48 小时历史">
      <header className="history-heading">
        <History size={16} />
        <span>最近 48 小时</span>
        <small>{countTabs(snapshot)} 个历史链接</small>
      </header>
      <TabWindows snapshot={snapshot} compact />
    </section>
  );
}

function TabWindows({ snapshot, compact = false }: { snapshot: TabSnapshot; compact?: boolean }) {
  return (
    <section className="windows">
      {snapshot.windows.map((window, index) => (
        <section className="window-group" key={`${window.windowId ?? index}-${index}`}>
          {!compact ? (
            <header className="window-header">
              <h2>Window {index + 1}</h2>
              <span>
                {window.focused ? 'Current on desktop · ' : ''}
                {window.tabs.length} tabs
              </span>
            </header>
          ) : null}

          <div className="tab-list">
            {window.tabs.map((tab) => (
              <a
                className={`tab-row ${tab.active ? 'active' : ''}`}
                href={hasOpenableUrl(tab.url) ? tab.url : undefined}
                target="_blank"
                rel="noreferrer"
                key={`${tab.id ?? tab.url}-${tab.index}`}
              >
                <span className="favicon" aria-hidden="true">
                  {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : getDomain(tab.url).slice(0, 1)}
                </span>
                <span className="tab-main">
                  <span className="tab-title">
                    {tab.pinned ? <Pin size={13} /> : null}
                    {tab.title}
                  </span>
                  <span className="tab-url">{getDomain(tab.url) || tab.url}</span>
                </span>
                <ExternalLink className="open-icon" size={16} />
              </a>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

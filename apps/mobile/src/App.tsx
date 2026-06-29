import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALLOWED_EMAIL,
  type BackendUser,
  countTabs,
  describeFreshness,
  filterSnapshot,
  getDomain,
  getOtpLoginViewState,
  hasOpenableUrl,
  isAllowedEmail,
  normalizeEmail,
  type SnapshotHistoryRecord,
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
import { supabase } from './supabaseClient';
import {
  fetchLatestWorkerSnapshot,
  fetchWorkerSnapshotHistory,
  getWorkerUser,
  signOutWorker,
  verifyWorkerCode
} from './workerBackend';

const HISTORY_FETCH_LIMIT = 120;

async function fetchLatestSnapshot(): Promise<SnapshotRecord | null> {
  if (mobileEnv.backendProvider === 'worker') {
    return fetchLatestWorkerSnapshot();
  }

  const { data, error } = await supabase
    .from('desktop_tab_snapshots')
    .select('device_id,device_name,snapshot,synced_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as SnapshotRecord | null) ?? null;
}

async function fetchSnapshotHistory(): Promise<SnapshotHistoryRecord[]> {
  if (mobileEnv.backendProvider !== 'worker') {
    return [];
  }

  const data = await fetchWorkerSnapshotHistory(HISTORY_FETCH_LIMIT);
  return data.snapshots;
}

function formatSnapshotTime(value?: string): string {
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

function useSnapshotPolling(user: BackendUser | null) {
  const [row, setRow] = useState<SnapshotRecord | null>(null);
  const [historyRows, setHistoryRows] = useState<SnapshotHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !isBackendConfigured()) {
      return;
    }

    setLoading(true);

    try {
      const [data, history] = await Promise.all([
        fetchLatestSnapshot(),
        fetchSnapshotHistory()
      ]);
      setError(null);
      setRow(data);
      setHistoryRows(history);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '刷新失败。');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRow(null);
      setHistoryRows([]);
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

  return { row, historyRows, loading, error, refresh };
}

export function App() {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [token, setToken] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const { row, historyRows, loading, error, refresh } = useSnapshotPolling(user);
  const visibleHistoryRows = useMemo(
    () =>
      historyRows.filter(
        (historyRow) =>
          historyRow.updated_at !== row?.updated_at ||
          historyRow.snapshot_hash !== row?.snapshot_hash
      ),
    [historyRows, row?.snapshot_hash, row?.updated_at]
  );
  const selectedHistoryRow = useMemo(
    () => historyRows.find((historyRow) => historyRow.id === selectedHistoryId) ?? null,
    [historyRows, selectedHistoryId]
  );
  const activeRow = selectedHistoryId ? selectedHistoryRow ?? row : row;
  const snapshot = activeRow?.snapshot ?? null;
  const filteredSnapshot = useMemo(
    () => (snapshot ? filterSnapshot(snapshot, query) : null),
    [query, snapshot]
  );
  const freshness = useMemo(
    () => describeFreshness(snapshot?.syncedAt ?? activeRow?.synced_at ?? null),
    [activeRow?.synced_at, snapshot?.syncedAt]
  );
  const backendConfigured = isBackendConfigured();
  const otpLoginView = getOtpLoginViewState({
    busy: authBusy,
    configured: backendConfigured,
    token
  });

  useEffect(() => {
    if (mobileEnv.backendProvider === 'worker') {
      setUser(getWorkerUser());
      setAuthLoading(false);
      return undefined;
    }

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user?.email ? { email: data.user.email } : null);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user?.email ? { email: session.user.email } : null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedHistoryId && !historyRows.some((historyRow) => historyRow.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [historyRows, selectedHistoryId]);

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
      const nextUser =
        mobileEnv.backendProvider === 'worker'
          ? await verifyWorkerCode(normalizedEmail, token.trim())
          : await supabase.auth
              .verifyOtp({
                email: normalizedEmail,
                token: token.trim(),
                type: 'email'
              })
              .then(({ data, error: verifyError }) => {
                if (verifyError) {
                  throw verifyError;
                }
                return data.user?.email ? { email: data.user.email } : null;
              });

      setUser(nextUser);
      await refresh();
    } catch (verifyError) {
      setAuthError(verifyError instanceof Error ? verifyError.message : '登录失败。');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (mobileEnv.backendProvider === 'worker') {
      await signOutWorker();
    } else {
      await supabase.auth.signOut();
    }

    setUser(null);
    setToken('');
    setQuery('');
    setSelectedHistoryId(null);
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
          <p className={`freshness ${freshness.state}`}>{freshness.label}</p>
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

        {row && visibleHistoryRows.length > 0 ? (
          <SnapshotTimeline
            latest={row}
            rows={visibleHistoryRows}
            selectedId={selectedHistoryId}
            onSelect={setSelectedHistoryId}
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
      </section>
    </main>
  );
}

function SnapshotTimeline({
  latest,
  rows,
  selectedId,
  onSelect
}: {
  latest: SnapshotRecord;
  rows: SnapshotHistoryRecord[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <section className="history-strip" aria-label="历史快照">
      <div className="history-heading">
        <History size={16} />
        <span>最近三天</span>
      </div>
      <div className="history-list">
        <button
          type="button"
          className={`history-chip ${selectedId === null ? 'active' : ''}`}
          aria-pressed={selectedId === null}
          onClick={() => onSelect(null)}
        >
          <span>最新</span>
          <small>{formatSnapshotTime(latest.updated_at)}</small>
        </button>

        {rows.map((historyRow) => (
          <button
            type="button"
            className={`history-chip ${selectedId === historyRow.id ? 'active' : ''}`}
            aria-pressed={selectedId === historyRow.id}
            key={historyRow.id}
            onClick={() => onSelect(historyRow.id)}
          >
            <span>{formatSnapshotTime(historyRow.updated_at)}</span>
            <small>{countTabs(historyRow.snapshot)} 个</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function TabWindows({ snapshot }: { snapshot: TabSnapshot }) {
  return (
    <section className="windows">
      {snapshot.windows.map((window, index) => (
        <section className="window-group" key={`${window.windowId ?? index}-${index}`}>
          <header className="window-header">
            <h2>Window {index + 1}</h2>
            <span>
              {window.focused ? 'Current on desktop · ' : ''}
              {window.tabs.length} tabs
            </span>
          </header>

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

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ALLOWED_EMAIL,
  countTabs,
  describeFreshness,
  filterSnapshot,
  getDomain,
  hasOpenableUrl,
  isAllowedEmail,
  normalizeEmail,
  type TabSnapshot
} from '@live-tab-mirror/shared';
import {
  ExternalLink,
  Loader2,
  LogOut,
  Pin,
  RefreshCw,
  Search,
  Send
} from 'lucide-react';
import { isSupabaseConfigured, mobileEnv } from './env';
import { supabase } from './supabaseClient';

interface SnapshotRow {
  device_id: string;
  device_name: string;
  snapshot: TabSnapshot;
  synced_at: string;
  updated_at: string;
}

function useSnapshotPolling(user: User | null) {
  const [row, setRow] = useState<SnapshotRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !isSupabaseConfigured()) {
      return;
    }

    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('desktop_tab_snapshots')
      .select('device_id,device_name,snapshot,synced_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setLoading(false);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setError(null);
    setRow((data as SnapshotRow | null) ?? null);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRow(null);
      setError(null);
      return;
    }

    void refresh();

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void refresh();
      }
    }, 4000);

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

  return { row, loading, error, refresh };
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [token, setToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const { row, loading, error, refresh } = useSnapshotPolling(user);
  const snapshot = row?.snapshot ?? null;
  const filteredSnapshot = useMemo(
    () => (snapshot ? filterSnapshot(snapshot, query) : null),
    [query, snapshot]
  );
  const freshness = useMemo(
    () => describeFreshness(snapshot?.syncedAt ?? row?.synced_at ?? null),
    [row?.synced_at, snapshot?.syncedAt]
  );

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function requestOtp() {
    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);

    const normalizedEmail = normalizeEmail(email);

    if (!isAllowedEmail(normalizedEmail)) {
      setAuthBusy(false);
      setAuthError('这里只有 zhaowork74@gmail.com 可以登录。');
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false
      }
    });

    setAuthBusy(false);

    if (otpError) {
      setAuthError(otpError.message);
      return;
    }

    setOtpSent(true);
    setAuthMessage('验证码已发送到邮箱。');
  }

  async function verifyOtp() {
    setAuthBusy(true);
    setAuthError(null);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: token.trim(),
      type: 'email'
    });

    setAuthBusy(false);

    if (verifyError) {
      setAuthError(verifyError.message);
      return;
    }

    setUser(data.user);
    setAuthMessage(null);
    await refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setOtpSent(false);
    setToken('');
    setQuery('');
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
          <p>输入邮箱验证码后查看电脑 Chrome 当前标签页。</p>

          {!isSupabaseConfigured() ? (
            <div className="notice error">
              请先配置 <code>VITE_SUPABASE_URL</code> 和{' '}
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>。
            </div>
          ) : null}

          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <button type="button" onClick={requestOtp} disabled={authBusy || !isSupabaseConfigured()}>
            <Send size={17} />
            发送验证码
          </button>

          {otpSent ? (
            <>
              <label>
                验证码
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
              <button type="button" onClick={verifyOtp} disabled={authBusy || token.length < 6}>
                登录
              </button>
            </>
          ) : null}

          {authMessage ? <div className="notice success">{authMessage}</div> : null}
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

      <section className="meta-row">
        <span>{row?.device_name ?? mobileEnv.allowedEmail}</span>
        <span>{snapshot ? `${countTabs(snapshot)} 个标签页` : '等待同步'}</span>
      </section>

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
    </main>
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

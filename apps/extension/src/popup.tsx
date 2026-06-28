import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, Loader2, LogOut, RefreshCw, Send } from 'lucide-react';
import {
  ALLOWED_EMAIL,
  describeFreshness,
  isAllowedEmail,
  normalizeEmail
} from '@live-tab-mirror/shared';
import type { User } from '@supabase/supabase-js';
import { extensionEnv, isSupabaseConfigured } from './env';
import { supabase } from './supabaseClient';
import type { ExtensionSyncState } from './storage';
import './popup.css';

interface MessageResponse {
  ok: boolean;
  state: ExtensionSyncState;
}

function sendExtensionMessage(type: string): Promise<MessageResponse> {
  return chrome.runtime.sendMessage({ type });
}

function PopupApp() {
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [token, setToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<ExtensionSyncState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const freshness = useMemo(
    () => describeFreshness(syncState?.lastSyncAt ?? null),
    [syncState?.lastSyncAt]
  );

  async function refreshStatus() {
    const response = await sendExtensionMessage('getStatus');
    setSyncState(response.state);
  }

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    void refreshStatus();

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 2500);

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = normalizeEmail(email);

    if (!isAllowedEmail(normalizedEmail)) {
      setBusy(false);
      setError('这里只允许 zhaowork74@gmail.com 登录。');
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true
      }
    });

    setBusy(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setOtpSent(true);
    setMessage('验证码已发送到邮箱。');
  }

  async function verifyOtp() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = normalizeEmail(email);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: 'email'
    });

    if (verifyError) {
      setBusy(false);
      setError(verifyError.message);
      return;
    }

    setUser(data.user);
    setMessage('登录成功，正在同步当前标签页。');
    const response = await sendExtensionMessage('syncNow');
    setSyncState(response.state);
    setBusy(false);
  }

  async function syncManually() {
    setBusy(true);
    setError(null);
    const response = await sendExtensionMessage('syncNow');
    setSyncState(response.state);
    setBusy(false);

    if (response.state.lastError) {
      setError(response.state.lastError);
    } else {
      setMessage('已同步最新标签页。');
    }
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    const response = await sendExtensionMessage('clearStatus');
    setSyncState(response.state);
    setUser(null);
    setOtpSent(false);
    setToken('');
    setBusy(false);
  }

  return (
    <main className="popup">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Live Tab Mirror</p>
          <h1>桌面标签页同步</h1>
        </div>
        {busy ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
      </header>

      {!isSupabaseConfigured() ? (
        <section className="notice error">
          请先在扩展构建环境里配置 <code>VITE_SUPABASE_URL</code> 和{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>。
        </section>
      ) : null}

      {user ? (
        <section className="stack">
          <div className="status-card">
            <span className={`dot ${freshness.state}`} />
            <div>
              <strong>{freshness.label}</strong>
              <p>
                {syncState?.windowCount ?? 0} 个窗口，{syncState?.tabCount ?? 0} 个标签页
              </p>
            </div>
          </div>

          {syncState?.lastError ? <div className="notice error">{syncState.lastError}</div> : null}
          {message ? <div className="notice success">{message}</div> : null}
          {error ? <div className="notice error">{error}</div> : null}

          <dl className="details">
            <div>
              <dt>账号</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>设备</dt>
              <dd>{extensionEnv.deviceName}</dd>
            </div>
          </dl>

          <div className="actions">
            <button type="button" onClick={syncManually} disabled={busy}>
              <RefreshCw size={15} />
              手动同步
            </button>
            <button type="button" className="secondary" onClick={signOut} disabled={busy}>
              <LogOut size={15} />
              退出
            </button>
          </div>
        </section>
      ) : (
        <section className="stack">
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <button type="button" onClick={requestOtp} disabled={busy || !isSupabaseConfigured()}>
            <Send size={15} />
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
              <button type="button" onClick={verifyOtp} disabled={busy || token.trim().length < 6}>
                <CheckCircle2 size={15} />
                登录并同步
              </button>
            </>
          ) : null}

          {message ? <div className="notice success">{message}</div> : null}
          {error ? <div className="notice error">{error}</div> : null}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupApp />);

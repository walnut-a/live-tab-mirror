import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, Loader2, LogOut, RefreshCw } from 'lucide-react';
import {
  ALLOWED_EMAIL,
  type BackendUser,
  describeFreshness,
  getOtpLoginViewState,
  isAllowedEmail,
  normalizeEmail
} from '@live-tab-mirror/shared';
import { extensionEnv, isBackendConfigured } from './env';
import { supabase } from './supabaseClient';
import {
  type ExtensionDeviceConfig,
  type ExtensionSyncState,
  readDeviceConfig,
  writeDeviceConfig
} from './storage';
import { getWorkerUser, signOutWorker, verifyWorkerCode } from './workerClient';
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
  const [user, setUser] = useState<BackendUser | null>(null);
  const [syncState, setSyncState] = useState<ExtensionSyncState | null>(null);
  const [deviceConfig, setDeviceConfig] = useState<ExtensionDeviceConfig | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const freshness = useMemo(
    () => describeFreshness(syncState?.lastSyncAt ?? null),
    [syncState?.lastSyncAt]
  );
  const backendConfigured = isBackendConfigured();
  const otpLoginView = getOtpLoginViewState({
    busy,
    configured: backendConfigured,
    token
  });

  async function refreshStatus() {
    const response = await sendExtensionMessage('getStatus');
    setSyncState(response.state);
  }

  useEffect(() => {
    void (async () => {
      const nextDeviceConfig = await readDeviceConfig({
        deviceId: extensionEnv.deviceId,
        deviceName: extensionEnv.deviceName
      });
      setDeviceConfig(nextDeviceConfig);
      setDeviceNameDraft(nextDeviceConfig.deviceName);

      if (extensionEnv.backendProvider === 'worker') {
        setUser(await getWorkerUser());
        return;
      }

      const { data } = await supabase.auth.getUser();
      setUser(data.user?.email ? { email: data.user.email } : null);
    })();

    void refreshStatus();

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 2500);

    const subscription =
      extensionEnv.backendProvider === 'supabase'
        ? supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user?.email ? { email: session.user.email } : null);
          }).data.subscription
        : null;

    return () => {
      window.clearInterval(interval);
      subscription?.unsubscribe();
    };
  }, []);

  async function verifyOtp() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = normalizeEmail(email);
    if (!isAllowedEmail(normalizedEmail)) {
      setBusy(false);
      setError('这里只允许 zhaowork74@gmail.com 登录。');
      return;
    }

    try {
      const nextUser =
        extensionEnv.backendProvider === 'worker'
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
      setToken('');
      setMessage('登录成功，正在同步当前标签页。');
      const response = await sendExtensionMessage('syncNow');
      setSyncState(response.state);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : '登录失败。');
    } finally {
      setBusy(false);
    }
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

  async function saveDeviceName() {
    if (!deviceConfig) {
      return;
    }

    const nextConfig = await writeDeviceConfig({
      ...deviceConfig,
      deviceName: deviceNameDraft
    });
    setDeviceConfig(nextConfig);
    setDeviceNameDraft(nextConfig.deviceName);
    setMessage('设备名称已保存。');
  }

  async function signOut() {
    setBusy(true);
    if (extensionEnv.backendProvider === 'worker') {
      await signOutWorker();
    } else {
      await supabase.auth.signOut();
    }

    const response = await sendExtensionMessage('clearStatus');
    setSyncState(response.state);
    setUser(null);
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

      {!backendConfigured ? (
        <section className="notice error">
          请先在扩展构建环境里配置当前后端需要的环境变量。
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
              <dd>{deviceConfig?.deviceName ?? extensionEnv.deviceName}</dd>
            </div>
          </dl>

          <section className="device-settings">
            <label>
              设备名称
              <input
                value={deviceNameDraft}
                onChange={(event) => setDeviceNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void saveDeviceName();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={saveDeviceName}
              disabled={busy || !deviceConfig}
            >
              保存名称
            </button>
          </section>

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
          <p className="auth-note">输入本机脚本生成的验证码。</p>

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
            <CheckCircle2 size={15} />
            登录并同步
          </button>

          {message ? <div className="notice success">{message}</div> : null}
          {error ? <div className="notice error">{error}</div> : null}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PopupApp />);

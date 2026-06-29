import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_POLL_INTERVAL_MS } from '../polling';

describe('mobile shell behavior', () => {
  it('keeps passive snapshot polling slower than event-driven desktop sync', () => {
    expect(SNAPSHOT_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('keeps the app title bar outside the scrollable content area', () => {
    const appPath = resolve(import.meta.dirname, '../App.tsx');
    const stylesPath = resolve(import.meta.dirname, '../styles.css');
    const appSource = readFileSync(appPath, 'utf8');
    const css = readFileSync(stylesPath, 'utf8');

    expect(appSource).toContain('className="app-content"');
    expect(css).toMatch(/\.app-shell\s*{[\s\S]*height:\s*100dvh/);
    expect(css).toMatch(/\.app-shell\s*{[\s\S]*overflow:\s*hidden/);
    expect(css).toMatch(/\.app-content\s*{[\s\S]*overflow-y:\s*auto/);
  });

  it('renders merged recent history instead of per-sync history chips', () => {
    const appPath = resolve(import.meta.dirname, '../App.tsx');
    const stylesPath = resolve(import.meta.dirname, '../styles.css');
    const appSource = readFileSync(appPath, 'utf8');
    const css = readFileSync(stylesPath, 'utf8');

    expect(appSource).toContain('aria-label="最近 48 小时历史"');
    expect(appSource).toContain('最近 48 小时');
    expect(appSource).not.toContain('history-chip');
    expect(css).toMatch(/\.history-section\s*{[\s\S]*display:\s*grid/);
  });

  it('renders a compact device filter for multiple desktop browsers', () => {
    const appPath = resolve(import.meta.dirname, '../App.tsx');
    const stylesPath = resolve(import.meta.dirname, '../styles.css');
    const appSource = readFileSync(appPath, 'utf8');
    const css = readFileSync(stylesPath, 'utf8');

    expect(appSource).toContain('aria-label="设备筛选"');
    expect(appSource).toContain('最近同步');
    expect(css).toMatch(/\.device-list\s*{[\s\S]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.device-chip\s*{[\s\S]*flex:\s*0 0 auto/);
  });

  it('shows when the current snapshot was synced without stale warning copy', () => {
    const appPath = resolve(import.meta.dirname, '../App.tsx');
    const stylesPath = resolve(import.meta.dirname, '../styles.css');
    const appSource = readFileSync(appPath, 'utf8');
    const css = readFileSync(stylesPath, 'utf8');

    expect(appSource).toContain('formatSnapshotSourceLabel');
    expect(appSource).toContain('同步于');
    expect(appSource).not.toContain('describeFreshness');
    expect(appSource).not.toContain('freshness.state');
    expect(css).not.toContain('.freshness.stale');
    expect(css).not.toContain('.freshness.old');
    expect(css).not.toContain('.freshness.unknown');
  });
});

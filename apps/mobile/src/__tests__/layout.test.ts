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
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPublicAssetUrl } from '../pwa';

describe('PWA install metadata', () => {
  it('uses relative manifest paths so GitHub Pages subpath installs launch inside the app', () => {
    const manifestPath = resolve(import.meta.dirname, '../../public/manifest.webmanifest');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      display: string;
      icons: Array<{ src: string }>;
      scope?: string;
      start_url: string;
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.icons.map((icon) => icon.src)).toContain('./icon.svg');
  });

  it('registers public runtime assets under the active Vite base path', () => {
    expect(getPublicAssetUrl('sw.js', '/live-tab-mirror/')).toBe('/live-tab-mirror/sw.js');
    expect(getPublicAssetUrl('/sw.js', '/live-tab-mirror')).toBe('/live-tab-mirror/sw.js');
    expect(getPublicAssetUrl('sw.js', '/')).toBe('/sw.js');
  });
});

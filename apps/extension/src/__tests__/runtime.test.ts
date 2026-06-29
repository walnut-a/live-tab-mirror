import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extension runtime backend', () => {
  it('keeps the extension runtime on the Worker backend only', () => {
    const srcDir = resolve(import.meta.dirname, '..');
    const runtimeFiles = [
      'background.ts',
      'popup.tsx',
      'env.ts',
      'storage.ts'
    ];

    for (const file of runtimeFiles) {
      const source = readFileSync(resolve(srcDir, file), 'utf8');
      expect(source).not.toContain('supabase');
      expect(source).not.toContain('backendProvider');
      expect(source).not.toContain('@supabase/supabase-js');
    }
  });
});

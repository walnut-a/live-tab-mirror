import { describe, expect, it } from 'vitest';
import { toInboxCapture } from '../inboxCapture';

describe('extension inbox capture', () => {
  it('captures one explicitly selected web tab with a stable source id', () => {
    expect(toInboxCapture({ id: 42, title: 'Article', url: 'https://example.com/read' }, 'mac-1')).toEqual({
      url: 'https://example.com/read',
      title: 'Article',
      sourceItemId: 'mac-1:42'
    });
  });

  it('does not send browser-internal pages to the reading inbox', () => {
    expect(toInboxCapture({ id: 42, title: 'Extensions', url: 'chrome://extensions' }, 'mac-1')).toBeNull();
    expect(toInboxCapture({ id: 42 }, 'mac-1')).toBeNull();
  });
});

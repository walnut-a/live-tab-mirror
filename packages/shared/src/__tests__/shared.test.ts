import { describe, expect, it } from 'vitest';
import { ALLOWED_EMAIL } from '../constants';
import { getOtpLoginViewState, isAllowedEmail } from '../auth';
import {
  createSnapshotFromWindows,
  filterSnapshot,
  getDomain,
  hasOpenableUrl
} from '../snapshot';
import { describeFreshness } from '../freshness';

describe('auth guards', () => {
  it('allows only the configured personal email, ignoring case and whitespace', () => {
    expect(isAllowedEmail(`  ${ALLOWED_EMAIL.toUpperCase()}  `)).toBe(true);
    expect(isAllowedEmail('someone@example.com')).toBe(false);
  });

  it('keeps the OTP input available before and after sending email', () => {
    expect(
      getOtpLoginViewState({
        busy: false,
        configured: true,
        otpSent: false,
        token: ''
      })
    ).toMatchObject({
      showTokenInput: true,
      sendButtonDisabled: false,
      sendButtonLabel: '发送验证码',
      verifyButtonDisabled: true
    });

    expect(
      getOtpLoginViewState({
        busy: false,
        configured: true,
        otpSent: true,
        token: '123456'
      })
    ).toMatchObject({
      showTokenInput: true,
      sendButtonDisabled: true,
      sendButtonLabel: '验证码已发送',
      verifyButtonDisabled: false
    });
  });
});

describe('snapshot shaping', () => {
  it('filters private and local/internal tabs while preserving window and tab order', () => {
    const snapshot = createSnapshotFromWindows(
      [
        {
          id: 10,
          focused: true,
          incognito: false,
          tabs: [
            {
              id: 1,
              index: 0,
              title: 'Alpha',
              url: 'https://alpha.example/post',
              favIconUrl: 'https://alpha.example/favicon.ico',
              active: true,
              pinned: false,
              audible: false,
              groupId: -1
            },
            {
              id: 2,
              index: 1,
              title: 'Chrome settings',
              url: 'chrome://settings',
              active: false,
              pinned: false,
              audible: false,
              groupId: -1
            },
            {
              id: 3,
              index: 2,
              title: 'Local file',
              url: 'file:///Users/me/private.txt',
              active: false,
              pinned: false,
              audible: false,
              groupId: -1
            }
          ]
        },
        {
          id: 11,
          focused: false,
          incognito: true,
          tabs: [
            {
              id: 4,
              index: 0,
              title: 'Private',
              url: 'https://private.example',
              active: true,
              pinned: false,
              audible: false,
              groupId: -1
            }
          ]
        },
        {
          id: 12,
          focused: false,
          incognito: false,
          tabs: [
            {
              id: 5,
              index: 0,
              title: 'Beta',
              url: 'https://beta.example',
              active: false,
              pinned: true,
              audible: true,
              groupId: 3
            }
          ]
        }
      ],
      {
        deviceId: 'desktop-chrome-main',
        deviceName: 'Mac Chrome',
        browser: 'Chrome',
        now: new Date('2026-06-28T11:24:32.000Z')
      }
    );

    expect(snapshot.windows).toHaveLength(2);
    expect(snapshot.windows[0].tabs.map((tab) => tab.title)).toEqual(['Alpha']);
    expect(snapshot.windows[1].tabs.map((tab) => tab.title)).toEqual(['Beta']);
    expect(snapshot.windows[1].tabs[0]).toMatchObject({
      pinned: true,
      audible: true,
      groupId: 3
    });
    expect(snapshot.syncedAt).toBe('2026-06-28T11:24:32.000Z');
  });

  it('searches title, url, and domain without changing the original grouping order', () => {
    const snapshot = createSnapshotFromWindows(
      [
        {
          id: 1,
          focused: true,
          incognito: false,
          tabs: [
            {
              id: 1,
              index: 0,
              title: 'React Server Components',
              url: 'https://react.dev/blog/rsc',
              active: true,
              pinned: false,
              audible: false,
              groupId: -1
            },
            {
              id: 2,
              index: 1,
              title: 'Supabase RLS guide',
              url: 'https://supabase.com/docs/guides/database/postgres/row-level-security',
              active: false,
              pinned: false,
              audible: false,
              groupId: -1
            }
          ]
        }
      ],
      {
        deviceId: 'desktop-chrome-main',
        deviceName: 'Mac Chrome',
        browser: 'Chrome',
        now: new Date('2026-06-28T11:24:32.000Z')
      }
    );

    expect(filterSnapshot(snapshot, 'rsc').windows[0].tabs.map((tab) => tab.title)).toEqual([
      'React Server Components'
    ]);
    expect(filterSnapshot(snapshot, 'supabase.com').windows[0].tabs.map((tab) => tab.title)).toEqual([
      'Supabase RLS guide'
    ]);
    expect(filterSnapshot(snapshot, 'missing').windows).toEqual([]);
  });

  it('detects openable urls and readable domains', () => {
    expect(hasOpenableUrl('https://example.com/a')).toBe(true);
    expect(hasOpenableUrl('chrome://newtab')).toBe(false);
    expect(hasOpenableUrl('file:///Users/me/private.txt')).toBe(false);
    expect(getDomain('https://developer.mozilla.org/en-US/docs/Web')).toBe('developer.mozilla.org');
  });
});

describe('freshness copy', () => {
  it('describes fresh, stale, and old snapshots', () => {
    const now = new Date('2026-06-28T11:35:00.000Z');

    expect(describeFreshness('2026-06-28T11:34:52.000Z', now)).toMatchObject({
      label: '刚刚同步',
      state: 'fresh'
    });
    expect(describeFreshness('2026-06-28T11:33:30.000Z', now)).toMatchObject({
      label: '1 分钟前',
      state: 'fresh'
    });
    expect(describeFreshness('2026-06-28T11:15:00.000Z', now)).toMatchObject({
      label: '同步可能已过期',
      state: 'stale'
    });
    expect(describeFreshness('2026-06-27T11:34:00.000Z', now)).toMatchObject({
      label: '很久没有同步',
      state: 'old'
    });
  });
});

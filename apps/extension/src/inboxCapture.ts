import { normalizeInboxUrl, type InboxCaptureInput } from '@live-tab-mirror/shared';

export function toInboxCapture(
  tab: Pick<chrome.tabs.Tab, 'id' | 'title' | 'url'>,
  deviceId: string
): InboxCaptureInput | null {
  const normalized = normalizeInboxUrl(tab.url ?? '');
  if (!normalized) return null;
  return {
    url: normalized.url,
    title: tab.title?.trim() ?? '',
    sourceItemId: `${deviceId}:${tab.id ?? 'active'}`
  };
}

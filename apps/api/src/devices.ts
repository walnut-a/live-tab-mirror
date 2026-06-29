export const MAX_DEVICE_ID_LENGTH = 80;

export function readSnapshotDeviceFilter(value: string | null): string | null {
  const deviceId = value?.trim() ?? '';
  if (!deviceId || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return null;
  }
  return deviceId;
}

export const HEART_DEVICE_KEY = 'heart_rate_device';

export const DEFAULT_HEART_DEVICE = Object.freeze({
  deviceId: '',
  deviceName: '',
});

const MAX_DEVICE_LABEL = 10;

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateLabel(value, max = MAX_DEVICE_LABEL) {
  const text = cleanString(value);
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function normalizeHeartRateDevice(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    deviceId: cleanString(src.deviceId),
    deviceName: truncateLabel(src.deviceName || src.name || ''),
  };
}

export function readHeartRateDevice(storage) {
  if (!storage || typeof storage.getStorageSync !== 'function') return { ...DEFAULT_HEART_DEVICE };
  try {
    return normalizeHeartRateDevice(storage.getStorageSync(HEART_DEVICE_KEY));
  } catch (_e) {
    return { ...DEFAULT_HEART_DEVICE };
  }
}

export function writeHeartRateDevice(storage, device) {
  const normalized = normalizeHeartRateDevice({
    deviceId: device && (device.deviceId || device.id),
    deviceName: device && (device.deviceName || device.name),
  });
  if (!storage || typeof storage.setStorageSync !== 'function') return normalized;
  try {
    storage.setStorageSync(HEART_DEVICE_KEY, normalized);
  } catch (_e) {}
  return normalized;
}

export function clearHeartRateDevice(storage) {
  if (!storage || typeof storage.removeStorageSync !== 'function') return { ...DEFAULT_HEART_DEVICE };
  try {
    storage.removeStorageSync(HEART_DEVICE_KEY);
  } catch (_e) {}
  return { ...DEFAULT_HEART_DEVICE };
}

export function hasPreferredHeartRateDevice(value) {
  const device = normalizeHeartRateDevice(value);
  return !!(device.deviceId || device.deviceName);
}

export function heartRateDeviceLabel(value) {
  const device = normalizeHeartRateDevice(value);
  return device.deviceName || (device.deviceId ? '已记住' : '自动选择');
}

export function deviceDisplayName(device) {
  return truncateLabel(device && (device.name || device.deviceName || '心率设备'));
}

export function matchesHeartRateDevice(device, preferred) {
  const pref = normalizeHeartRateDevice(preferred);
  if (!hasPreferredHeartRateDevice(pref)) return true;
  const id = cleanString(device && (device.id || device.deviceId));
  const name = cleanString(device && (device.name || device.deviceName));
  if (pref.deviceId && id && pref.deviceId === id) return true;
  return !!(pref.deviceName && name && pref.deviceName === truncateLabel(name));
}

export const RUN_SETTINGS_KEY = 'run_settings';

export const STRIDE_OPTIONS_M = Object.freeze([0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00]);

export const DEFAULT_RUN_SETTINGS = Object.freeze({
  strideM: 0.85,
  autoHeartRate: true,
  voiceCue: true,
  memoryContext: true,
});

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeStride(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 1.5) return DEFAULT_RUN_SETTINGS.strideM;
  return round2(n);
}

export function normalizeRunSettings(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    strideM: normalizeStride(src.strideM),
    autoHeartRate: typeof src.autoHeartRate === 'boolean'
      ? src.autoHeartRate : DEFAULT_RUN_SETTINGS.autoHeartRate,
    voiceCue: typeof src.voiceCue === 'boolean'
      ? src.voiceCue : DEFAULT_RUN_SETTINGS.voiceCue,
    memoryContext: typeof src.memoryContext === 'boolean'
      ? src.memoryContext : DEFAULT_RUN_SETTINGS.memoryContext,
  };
}

export function readRunSettings(storage) {
  if (!storage || typeof storage.getStorageSync !== 'function') return { ...DEFAULT_RUN_SETTINGS };
  try {
    return normalizeRunSettings(storage.getStorageSync(RUN_SETTINGS_KEY));
  } catch (_e) {
    return { ...DEFAULT_RUN_SETTINGS };
  }
}

export function writeRunSettings(storage, settings) {
  const normalized = normalizeRunSettings(settings);
  if (!storage || typeof storage.setStorageSync !== 'function') return normalized;
  try {
    storage.setStorageSync(RUN_SETTINGS_KEY, normalized);
  } catch (_e) {}
  return normalized;
}

export function nextStrideM(value) {
  const stride = normalizeStride(value);
  let bestIndex = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < STRIDE_OPTIONS_M.length; i += 1) {
    const delta = Math.abs(STRIDE_OPTIONS_M[i] - stride);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return STRIDE_OPTIONS_M[(bestIndex + 1) % STRIDE_OPTIONS_M.length];
}

export function formatStrideM(value) {
  return `${normalizeStride(value).toFixed(2)}m`;
}

export function formatSwitch(value) {
  return value ? '开' : '关';
}
